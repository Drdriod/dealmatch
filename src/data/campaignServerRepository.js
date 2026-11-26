// Server-side access to campaign pages. Takes a service-role client; never imported by the browser.
// The three functions below are callable only by service_role in the database
// (see supabase/migrations/20261126100000_campaign_pages.sql).

export async function saveCampaignLead(svc, lead) {
  const { data, error } = await svc.rpc('submit_campaign_lead', {
    p_slug: lead.slug,
    p_name: lead.name,
    p_phone: lead.phone || null,
    p_email: lead.email || null,
    p_message: lead.message || null,
    p_consent: lead.consent === true,
    p_source: lead.source || 'direct',
    p_utm: lead.utm || {},
  })
  return { data, error }
}

export async function countCampaignVisit(svc, slug, source) {
  const { error } = await svc.rpc('record_campaign_visit', { p_slug: slug, p_source: source || 'direct' })
  return { error }
}

export async function findPublishedCampaign(svc, slug) {
  const { data, error } = await svc.rpc('get_published_campaign', { p_slug: slug })
  return { data, error }
}
