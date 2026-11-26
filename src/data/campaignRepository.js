// Browser-side access to campaign pages. Public reads go through one database function that returns
// only published pages and no private fields. Everything else is staff-only and checked by RLS.
import { supabase } from '@/lib/supabase'

export function fetchPublicCampaign(slug) {
  return supabase.rpc('get_published_campaign', { p_slug: String(slug || '').toLowerCase() })
}

const PAGE_COLUMNS = 'id, slug, template, status, title, headline, subheadline, description, facts, documents, photos, '
  + 'disclosure, cta_label, consent_text, notify_email, show_support_whatsapp, trust_claims_approved, created_at, updated_at, published_at'

export function fetchCampaignPages() {
  return supabase.from('campaign_pages').select(PAGE_COLUMNS).order('created_at', { ascending: false })
}

export function insertCampaignPage(page) {
  return supabase.from('campaign_pages').insert(page).select().single()
}

export function updateCampaignPage(id, patch) {
  return supabase.from('campaign_pages').update(patch).eq('id', id).select().single()
}

export function fetchCampaignLeads() {
  return supabase.from('campaign_leads')
    .select('id, campaign_id, name, phone, email, message, source, status, created_at, campaign_pages(title, slug)')
    .order('created_at', { ascending: false }).limit(300)
}

export function updateCampaignLead(id, patch) {
  return supabase.from('campaign_leads').update(patch).eq('id', id)
}

export function fetchCampaignStats() {
  return supabase.rpc('admin_campaign_stats')
}

export async function uploadCampaignPhoto(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('campaign-images').upload(path, file, { contentType: file.type, upsert: false })
  return { path, error }
}

export function removeCampaignPhoto(path) {
  return supabase.storage.from('campaign-images').remove([path])
}
