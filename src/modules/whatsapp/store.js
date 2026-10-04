/**
 * Supabase-backed store for the WhatsApp module. The engine only talks to
 * this interface, so the conversation logic can be tested with an in-memory
 * fake and the database stays swappable.
 *
 * `db` MUST be a service-role client: every table here is service-role only.
 */
import crypto from 'node:crypto'
import { locationTokens } from './guard.js'

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex')
const iso = (d = new Date()) => d.toISOString()
const safeWords = s => String(s || '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export const LINK_TTL_MINUTES = 20
const MAX_TOKENS_PER_HOUR = 5

export function createStore(db) {
  return {
    async isBlockedNumber(waId) {
      const { data } = await db.from('wa_blocked_numbers').select('wa_id').eq('wa_id', waId).maybeSingle()
      return !!data
    },

    /** @returns {boolean} true when this message id is new, false on a Meta retry */
    async logInbound({ wamid, waId, msgType }) {
      const { error } = await db.from('wa_message_log').insert({ wamid, wa_id: waId, direction: 'in', msg_type: msgType })
      if (error?.code === '23505') return false
      if (error) console.error('wa logInbound error', error.message)
      return true
    },

    async countInbound(waId, minutes) {
      const since = iso(new Date(Date.now() - minutes * 60_000))
      const { count } = await db.from('wa_message_log')
        .select('id', { count: 'exact', head: true })
        .eq('wa_id', waId).eq('direction', 'in').gte('created_at', since)
      return count || 0
    },

    async getContact(waId) {
      const { data } = await db.from('wa_contacts').select('*').eq('wa_id', waId).maybeSingle()
      return data || null
    },

    async createContact({ waId, waProfileName }) {
      await db.from('wa_contacts').upsert(
        { wa_id: waId, wa_profile_name: waProfileName || null, last_inbound_at: iso() },
        { onConflict: 'wa_id', ignoreDuplicates: true }
      )
      return this.getContact(waId)
    },

    async updateContact(waId, patch) {
      const { error } = await db.from('wa_contacts').update(patch).eq('wa_id', waId)
      if (error) console.error('wa updateContact error', error.message)
    },

    async deleteContact(waId) {
      await db.from('wa_contacts').delete().eq('wa_id', waId)
    },

    async addStrike(waId, reason) {
      const { data, error } = await db.rpc('wa_add_strike', { p_wa_id: waId, p_reason: reason, p_threshold: 3 })
      if (error) { console.error('wa addStrike error', error.message); return { strikes: 0, status: 'active' } }
      const row = Array.isArray(data) ? data[0] : data
      return { strikes: row?.out_strikes ?? 0, status: row?.out_status ?? 'active' }
    },

    /** guest = no linked account, linked = account but not ID-approved, verified = ID approved */
    async getTier(contact) {
      if (!contact?.profile_id) return { tier: 'guest', identityStatus: null, restricted: false }
      const { data: p } = await db.from('profiles')
        .select('identity_verification_status, account_status, account_flagged, is_deactivated, full_name')
        .eq('id', contact.profile_id).maybeSingle()
      if (!p) return { tier: 'guest', identityStatus: null, restricted: false }
      const restricted = !!(p.account_flagged || p.is_deactivated || (p.account_status && p.account_status !== 'active'))
      const identityStatus = p.identity_verification_status || 'unverified'
      const verified = identityStatus === 'approved' && !restricted
      return { tier: verified ? 'verified' : 'linked', identityStatus, restricted, fullName: p.full_name }
    },

    async countRequestsSince(waId, hours) {
      const since = iso(new Date(Date.now() - hours * 3_600_000))
      const { count } = await db.from('wa_requests')
        .select('id', { count: 'exact', head: true }).eq('wa_id', waId).gte('created_at', since)
      return count || 0
    },

    async createRequest(row) {
      const { data, error } = await db.from('wa_requests').insert(row).select('id').maybeSingle()
      if (error) console.error('wa createRequest error', error.message)
      return data?.id || null
    },

    async updateRequest(id, patch) {
      if (!id) return
      await db.from('wa_requests').update(patch).eq('id', id)
    },

    async listRequests(waId, limit = 5) {
      const { data } = await db.from('wa_requests')
        .select('kind, category, intent, location_text, status, result_count, created_at')
        .eq('wa_id', waId).order('created_at', { ascending: false }).limit(limit)
      return data || []
    },

    /**
     * Service providers (mechanics, artisans...). Uses the existing public
     * universal_search RPC, which only ever returns ACTIVE listings and only
     * public fields. No phone numbers or emails are selected anywhere.
     */
    async searchServices({ keywords, location, limit = 3 }) {
      const q = keywords.map(k => safeWords(k)).filter(Boolean).map(k => `"${k}"`).join(' or ')
      if (!q) return []
      const { data, error } = await db.rpc('universal_search', { p_query: q, p_limit: 30 })
      if (error) { console.error('wa searchServices error', error.message); return [] }
      const tokens = locationTokens(location)
      return (data || [])
        .filter(r => r.source === 'category_listings' || r.source === 'professionals')
        .map(r => {
          const hay = `${r.location_name || ''} ${r.title || ''} ${r.snippet || ''}`.toLowerCase()
          const locScore = tokens.filter(t => hay.includes(t)).length
          return { r, locScore }
        })
        .sort((a, b) => b.locScore - a.locScore || (b.r.search_rank || 0) - (a.r.search_rank || 0))
        .slice(0, limit)
        .map(({ r, locScore }) => ({
          title: r.title,
          location: r.location_name || '',
          priceCents: r.price_cents,
          urlPath: r.url_path,
          nearby: locScore > 0,
        }))
    },

    /** Homes. Selects only public columns: never contact_phone / contact_email. */
    async searchHomes({ category, location, budgetMax, limit = 3 }) {
      let q = db.from('properties')
        .select('id, title, price, city, state, bedrooms, category, price_period')
        .eq('status', 'active').eq('category', category)
      if (budgetMax) q = q.lte('price', budgetMax)
      const tokens = locationTokens(location).slice(0, 3)
      if (tokens.length) {
        q = q.or(tokens.map(t => `city.ilike.%${t}%,state.ilike.%${t}%,address.ilike.%${t}%`).join(','))
      }
      const { data, error } = await q.order('created_at', { ascending: false }).limit(limit)
      if (error) { console.error('wa searchHomes error', error.message); return [] }
      return (data || []).map(p => ({
        title: p.title,
        location: [p.city, p.state].filter(Boolean).join(', '),
        price: p.price,
        period: p.category === 'sale' ? '' : (p.price_period || 'month'),
        bedrooms: p.bedrooms,
        urlPath: `/property/${p.id}`,
      }))
    },

    /**
     * Creates a single-use link token. Older unused tokens for this number
     * are expired first, so only the newest link ever works. Only the SHA-256
     * hash is stored; the raw token exists only inside the WhatsApp message.
     */
    async createLinkToken(waId) {
      const hourAgo = iso(new Date(Date.now() - 3_600_000))
      const { count } = await db.from('wa_link_tokens')
        .select('id', { count: 'exact', head: true }).eq('wa_id', waId).gte('created_at', hourAgo)
      if ((count || 0) >= MAX_TOKENS_PER_HOUR) return { error: 'rate_limited' }

      await db.from('wa_link_tokens').update({ expires_at: iso() })
        .eq('wa_id', waId).is('used_at', null).gt('expires_at', iso())

      const token = crypto.randomBytes(32).toString('base64url')
      const { error } = await db.from('wa_link_tokens').insert({
        wa_id: waId,
        token_hash: sha256(token),
        expires_at: iso(new Date(Date.now() + LINK_TTL_MINUTES * 60_000)),
      })
      if (error) { console.error('wa createLinkToken error', error.message); return { error: 'failed' } }
      return { token }
    },

    /**
     * Binds a WhatsApp number to the signed-in DealMatch account.
     * The token is consumed atomically (one UPDATE ... WHERE used_at IS NULL),
     * so two tabs or a replayed link can never both succeed.
     */
    async claimLinkToken(token, userId) {
      const nowIso = iso()
      const { data: row } = await db.from('wa_link_tokens')
        .update({ used_at: nowIso, used_by: userId })
        .eq('token_hash', sha256(String(token || '')))
        .is('used_at', null).gt('expires_at', nowIso)
        .select('wa_id').maybeSingle()
      if (!row) return { error: 'invalid_or_expired' }

      const contact = await this.getContact(row.wa_id)
      if (!contact || contact.status !== 'active') return { error: 'contact_unavailable' }
      if (contact.profile_id && contact.profile_id !== userId) return { error: 'number_linked_elsewhere' }

      const { data: prof } = await db.from('profiles')
        .select('id, account_status, account_flagged, is_deactivated').eq('id', userId).maybeSingle()
      if (!prof) return { error: 'no_profile' }
      if (prof.account_flagged || prof.is_deactivated || (prof.account_status && prof.account_status !== 'active')) {
        return { error: 'account_restricted' }
      }

      const { error } = await db.from('wa_contacts')
        .update({ profile_id: userId, linked_at: nowIso })
        .eq('wa_id', row.wa_id)
      if (error?.code === '23505') return { error: 'profile_already_linked' }
      if (error) { console.error('wa claim bind error', error.message); return { error: 'failed' } }
      return { ok: true, waId: row.wa_id }
    },
  }
}
