#!/usr/bin/env node
/**
 * Offline tests for the WhatsApp module (no network, no database).
 * Run: node scripts/test-whatsapp.mjs
 */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { verifySignature } from '../src/modules/whatsapp/cloud.js'
import { screenText, parseNaira, normalizeWaId, isAllowedCountry, locationTokens } from '../src/modules/whatsapp/guard.js'
import { createEngine } from '../src/modules/whatsapp/engine.js'

let passed = 0
const t = async (name, fn) => {
  try { await fn(); passed++; console.log('  ok  ' + name) }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + (e.stack || e)); process.exitCode = 1 }
}

// ── fakes ───────────────────────────────────────────────────────────────────
function makeWorld({ tier = 'guest', identityStatus = null } = {}) {
  const w = {
    contacts: new Map(), seen: new Set(), blocked: new Set(), log: [], requests: [], tokens: 0,
    sent: [], tier, identityStatus, restricted: false, inboundCount: 0,
  }
  w.store = {
    isBlockedNumber: async id => w.blocked.has(id),
    logInbound: async ({ wamid }) => { if (w.seen.has(wamid)) return false; w.seen.add(wamid); return true },
    countInbound: async () => w.inboundCount,
    getContact: async id => w.contacts.get(id) || null,
    createContact: async ({ waId, waProfileName }) => {
      const c = { wa_id: waId, wa_profile_name: waProfileName, flow: null, flow_step: null, flow_data: {}, consent_at: null,
        display_name: null, status: 'active', strikes: 0, opted_out: false, profile_id: null, last_notice_at: null }
      w.contacts.set(waId, c); return c
    },
    updateContact: async (id, patch) => Object.assign(w.contacts.get(id) || {}, patch),
    deleteContact: async id => w.contacts.delete(id),
    addStrike: async id => {
      const c = w.contacts.get(id); c.strikes++
      if (c.strikes >= 3) c.status = 'suspended'
      return { strikes: c.strikes, status: c.status }
    },
    getTier: async () => ({ tier: w.tier, identityStatus: w.identityStatus, restricted: w.restricted }),
    countRequestsSince: async () => w.requests.length,
    createRequest: async r => { w.requests.push(r); return 'req' + w.requests.length },
    updateRequest: async () => {},
    listRequests: async () => w.requests.map(r => ({ ...r, result_count: 2, created_at: new Date().toISOString() })),
    searchServices: async () => [
      { title: 'Okoro Auto Works', location: 'Rumuola, Port Harcourt', priceCents: null, urlPath: '/marketplace/mechanics/listing/1', nearby: true },
      { title: 'Chidi Motors', location: 'GRA, Port Harcourt', priceCents: 500000, urlPath: '/marketplace/mechanics/listing/2', nearby: false },
    ],
    searchHomes: async () => [{ title: '3 bed flat', location: 'GRA, Rivers', price: 2500000, period: 'year', bedrooms: 3, urlPath: '/property/9' }],
    createLinkToken: async () => { w.tokens++; return { token: 'TESTTOKEN' + w.tokens } },
  }
  w.cloud = {
    sendText: async (to, body) => { w.sent.push({ to, kind: 'text', body }); return { ok: true } },
    sendButtons: async (to, body, buttons) => { w.sent.push({ to, kind: 'buttons', body, buttons }); return { ok: true } },
    sendList: async (to, body, label, sections) => { w.sent.push({ to, kind: 'list', body, sections }); return { ok: true } },
    sendCtaUrl: async (to, body, label, url) => { w.sent.push({ to, kind: 'cta', body, label, url }); return { ok: true } },
  }
  w.engine = createEngine({ store: w.store, cloud: w.cloud, appUrl: 'https://app.test', allowedCountryCodes: ['234'] })
  let n = 0
  w.text = (from, body) => w.engine.handleMessage({ from, id: 'wamid.' + (++n), type: 'text', text: { body } }, 'Test Name')
  w.pick = (from, id, title = id) => w.engine.handleMessage({ from, id: 'wamid.' + (++n), type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title } } }, 'Test Name')
  w.last = () => w.sent[w.sent.length - 1]
  w.all = () => w.sent.map(s => (s.body || '') + (s.url || '')).join('\n')
  return w
}
const U = '2348031234567'
async function onboard(w, from = U) {
  await w.text(from, 'hi')
  await w.pick(from, 'consent_yes')
  await w.text(from, 'Chidi')
}

// ── signature ───────────────────────────────────────────────────────────────
console.log('signature')
await t('accepts a valid Meta signature and rejects tampering', () => {
  const body = Buffer.from('{"entry":[{"x":"\\u00e9"}]}')
  const sig = 'sha256=' + crypto.createHmac('sha256', 's3cret').update(body).digest('hex')
  assert.equal(verifySignature(body, sig, 's3cret'), true)
  assert.equal(verifySignature(Buffer.from('{"entry":[]}'), sig, 's3cret'), false)
  assert.equal(verifySignature(body, sig, 'wrong'), false)
  assert.equal(verifySignature(body, undefined, 's3cret'), false)
  assert.equal(verifySignature(body, sig, undefined), false)
})

// ── guard ───────────────────────────────────────────────────────────────────
console.log('guard')
await t('screens illegal, contact leaks, and leaves normal text alone', () => {
  assert.equal(screenText('need a mechanic for my Toyota').ok, true)
  assert.equal(screenText('weed removal for my compound').ok, true)
  assert.equal(screenText('he has begun the work').ok, true)
  assert.equal(screenText('12 Aba Road, Port Harcourt').ok, true)
  assert.equal(screenText('I want to buy cocaine').reason, 'illegal')
  assert.equal(screenText('need a fake certificate').reason, 'illegal')
  assert.equal(screenText('call me on 0803 123 4567').reason, 'contact_info')
  assert.equal(screenText('see www.mysite.com').reason, 'contact_info')
  assert.equal(screenText('mail me a@b.com').reason, 'contact_info')
})
await t('parses naira amounts', () => {
  assert.equal(parseNaira('500k').value, 500000)
  assert.equal(parseNaira('1.5m').value, 1500000)
  assert.equal(parseNaira('N2,000,000').value, 2000000)
  assert.equal(parseNaira('skip').skip, true)
  assert.equal(parseNaira('abc').invalid, true)
  assert.equal(parseNaira('5').invalid, true)
})
await t('normalises ids, countries, location tokens', () => {
  assert.equal(normalizeWaId('+234 803 123 4567'), '2348031234567')
  assert.equal(normalizeWaId('12'), null)
  assert.equal(isAllowedCountry('2348031234567', ['234']), true)
  assert.equal(isAllowedCountry('14155550100', ['234']), false)
  assert.equal(isAllowedCountry('14155550100', []), true)
  assert.deepEqual(locationTokens('Rumuola, Port Harcourt State'), ['rumuola', 'port', 'harcourt'])
})

// ── conversation ────────────────────────────────────────────────────────────
console.log('conversation')
await t('first message registers the number and asks for consent', async () => {
  const w = makeWorld()
  await w.text(U, 'hello')
  assert.ok(w.contacts.has(U))
  assert.equal(w.last().kind, 'buttons')
  assert.match(w.last().body, /privacy/i)
  assert.equal(w.contacts.get(U).consent_at, null)
})
await t('nothing is processed before consent', async () => {
  const w = makeWorld()
  await w.text(U, 'I need a mechanic')
  assert.equal(w.requests.length, 0)
  assert.equal(w.last().kind, 'buttons')
})
await t('consent then name then menu', async () => {
  const w = makeWorld()
  await w.text(U, 'hi'); await w.pick(U, 'consent_yes')
  assert.match(w.last().body, /call you/i)
  await w.text(U, '12345')
  assert.match(w.last().body, /letters only/i)
  await w.text(U, 'Chidi')
  assert.equal(w.contacts.get(U).display_name, 'Chidi')
  assert.equal(w.last().kind, 'list')
})
await t('declining consent deletes the contact', async () => {
  const w = makeWorld()
  await w.text(U, 'hi'); await w.pick(U, 'consent_no')
  assert.equal(w.contacts.has(U), false)
})
await t('service search end to end, results are masked', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.pick(U, 'menu_service')
  await w.pick(U, 'svc_mechanic')
  await w.text(U, 'Rumuola, Port Harcourt')
  await w.text(U, 'skip')
  const out = w.all()
  assert.match(out, /Okoro Auto Works/)
  assert.match(out, /https:\/\/app\.test\/marketplace\/mechanics\/listing\/1/)
  assert.doesNotMatch(out, /\b0?8\d{9}\b/)           // no phone numbers
  assert.equal(w.requests.length, 1)
})
await t('free text "I need a plumber" jumps straight to location', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.text(U, 'I need a plumber')
  assert.match(w.last().body, /area/i)
  assert.equal(w.contacts.get(U).flow_data.category_id, 'plumber')
})
await t('home search with budget', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.pick(U, 'menu_home'); await w.pick(U, 'home_rent')
  await w.text(U, 'GRA Port Harcourt')
  await w.text(U, 'xyz')
  assert.match(w.last().body, /could not read/i)
  await w.text(U, '3m')
  assert.match(w.all(), /3 bed flat/)
  assert.equal(w.requests[0].budget_max, 3000000)
})
await t('GUEST contacting a provider gets a single-use verification link', async () => {
  const w = makeWorld({ tier: 'guest' })
  await onboard(w)
  await w.pick(U, 'menu_service'); await w.pick(U, 'svc_mechanic')
  await w.text(U, 'Rumuola'); await w.text(U, 'skip')
  await w.pick(U, 'act_contact')
  const m = w.last()
  assert.equal(m.kind, 'cta')
  assert.match(m.url, /^https:\/\/app\.test\/wa\/link\?t=TESTTOKEN\d$/)
  assert.match(m.body, /only do this once/i)
})
await t('LINKED but unverified user is sent to the identity page, not a new token', async () => {
  const w = makeWorld({ tier: 'linked', identityStatus: 'unverified' })
  await onboard(w)
  await w.text(U, 'verify')
  assert.equal(w.last().url, 'https://app.test/verify-identity')
  assert.equal(w.tokens, 0)
})
await t('submitted documents get a status message, not another upload prompt', async () => {
  const w = makeWorld({ tier: 'linked', identityStatus: 'submitted' })
  await onboard(w)
  await w.text(U, 'verify')
  assert.match(w.last().body, /under review/i)
})
await t('VERIFIED user is never asked to verify again and is handed off securely', async () => {
  const w = makeWorld({ tier: 'verified', identityStatus: 'approved' })
  await onboard(w)
  await w.text(U, 'verify')
  assert.match(w.last().body, /not be asked again/i)
  await w.pick(U, 'menu_service'); await w.pick(U, 'svc_mechanic')
  await w.text(U, 'Rumuola'); await w.text(U, 'skip')
  await w.pick(U, 'act_contact')
  assert.equal(w.last().kind, 'list')
  await w.pick(U, 'pick_1')
  assert.equal(w.last().kind, 'cta')
  assert.equal(w.last().url, 'https://app.test/marketplace/mechanics/listing/2')
  assert.equal(w.tokens, 0)
})
await t('restricted account cannot be handed off', async () => {
  const w = makeWorld({ tier: 'verified', identityStatus: 'approved' })
  w.restricted = true
  await onboard(w)
  await w.pick(U, 'menu_service'); await w.pick(U, 'svc_mechanic')
  await w.text(U, 'Rumuola'); await w.text(U, 'skip')
  await w.pick(U, 'act_contact')
  assert.match(w.last().body, /needs attention/i)
})

// ── abuse controls ──────────────────────────────────────────────────────────
console.log('abuse controls')
await t('Meta retries (same message id) are processed once', async () => {
  const w = makeWorld()
  const msg = { from: U, id: 'wamid.SAME', type: 'text', text: { body: 'hi' } }
  await w.engine.handleMessage(msg, 'X'); await w.engine.handleMessage(msg, 'X'); await w.engine.handleMessage(msg, 'X')
  assert.equal(w.sent.length, 1)
})
await t('three illegal requests suspend the number, then it goes quiet', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.text(U, 'sell drugs'); await w.text(U, 'fake certificate'); await w.text(U, 'I need a hitman')
  assert.equal(w.contacts.get(U).status, 'suspended')
  assert.match(w.last().body, /paused/i)
  const before = w.sent.length
  await w.text(U, 'menu')
  assert.equal(w.sent.length, before)                // notice cooldown: silent now
  assert.equal(w.requests.length, 0)
})
await t('phone numbers and links in free text are refused without a strike', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.pick(U, 'menu_service'); await w.pick(U, 'svc_mechanic')
  await w.text(U, 'call me on 08031234567')
  assert.match(w.last().body, /do not include phone numbers/i)
  assert.equal(w.contacts.get(U).strikes, 0)
  assert.equal(w.contacts.get(U).flow_step, 'location')
})
await t('rate limit stops processing and warns once', async () => {
  const w = makeWorld()
  await onboard(w)
  w.inboundCount = 999
  const before = w.sent.length
  await w.text(U, 'menu'); await w.text(U, 'menu')
  assert.equal(w.sent.length, before + 1)
  assert.match(w.last().body, /very quickly/i)
  assert.equal(w.contacts.get(U).strikes, 1)
})
await t('daily request cap for guests', async () => {
  const w = makeWorld()
  await onboard(w)
  w.requests.push(...Array(5).fill({}))
  await w.pick(U, 'menu_service'); await w.pick(U, 'svc_mechanic')
  await w.text(U, 'Rumuola'); await w.text(U, 'skip')
  assert.match(w.last().body, /request limit/i)
})
await t('foreign numbers cannot open a contact; blocked numbers are ignored', async () => {
  const w = makeWorld()
  await w.text('14155550100', 'hi')
  assert.equal(w.contacts.size, 0); assert.equal(w.sent.length, 0)
  w.blocked.add(U); await w.text(U, 'hi')
  assert.equal(w.sent.length, 0)
})
await t('STOP opts out of notifications but replies keep working', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.text(U, 'STOP')
  assert.equal(w.contacts.get(U).opted_out, true)
  await w.text(U, 'menu')
  assert.equal(w.last().kind, 'list')
})
await t('media messages get a polite text-only reply', async () => {
  const w = makeWorld()
  await onboard(w)
  await w.engine.handleMessage({ from: U, id: 'wamid.img', type: 'image', image: {} }, 'X')
  assert.match(w.last().body, /only read text/i)
})
await t('webhook only handles our own phone number id', async () => {
  const w = makeWorld()
  const e = createEngine({ store: w.store, cloud: w.cloud, appUrl: 'https://app.test', phoneNumberId: 'MINE' })
  const mk = id => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: id }, contacts: [{ wa_id: U, profile: { name: 'A' } }],
    messages: [{ from: U, id: 'wamid.' + id, type: 'text', text: { body: 'hi' } }] } }] }] })
  await e.handleWebhook(mk('OTHER'))
  assert.equal(w.sent.length, 0)
  await e.handleWebhook(mk('MINE'))
  assert.equal(w.sent.length, 1)
})
await t('status-only webhooks (delivery receipts) do nothing', async () => {
  const w = makeWorld()
  const r = await w.engine.handleWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: 'x', status: 'delivered' }] } }] }] })
  assert.equal(r.handled, 0); assert.equal(w.sent.length, 0)
})

console.log(`\n${passed} checks passed${process.exitCode ? ' (with failures above)' : ''}`)
