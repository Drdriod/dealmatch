/**
 * DealMatch - Honeypot Trap
 * ===========================
 * File: api/properties-export.js
 *
 * Anti-Scraping Pillar 3 - Honeypot
 *
 * This endpoint is NEVER linked from the real DealMatch UI.
 * It exists purely to catch scrapers and bots who discover it
 * by crawling the codebase, sitemap, or API patterns.
 *
 * Any request here means:
 * - A bot found it through automated discovery
 * - A competitor is trying to bulk-export your listing data
 * - A bad actor is probing your API surface
 *
 * What happens:
 * 1. IP + UA + timestamp logged to console (visible in Vercel logs)
 * 2. 3-second artificial delay (tarpit - wastes scraper's time)
 * 3. Returns convincing but completely empty response
 * 4. Never returns real data - ever
 *
 * To activate: this file being present in /api/ is enough.
 * Vercel will automatically serve it at /api/properties-export
 */

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown'
  const ua = (req.headers['user-agent'] || '').substring(0, 200)
  const ts = new Date().toISOString()

  // Log the intrusion attempt - visible in Vercel function logs and Sentry
  console.error(
    JSON.stringify({
      event:    'HONEYPOT_HIT',
      severity: 'HIGH',
      ip,
      ua,
      method:   req.method,
      path:     req.url,
      headers:  {
        origin:  req.headers['origin']  || null,
        referer: req.headers['referer'] || null,
      },
      ts,
    })
  )

  // Tarpit: artificial delay to waste scraper compute time
  // A real user would never hit this endpoint, so the delay harms no one
  await new Promise(r => setTimeout(r, 3000))

  // Return a convincing but empty response
  // The scraper thinks the API works but finds no data
  return res.status(200).json({
    data:       [],
    total:      0,
    page:       1,
    per_page:   20,
    has_more:   false,
    generated:  ts,
    message:    'No properties match your filters.',
  })
}
