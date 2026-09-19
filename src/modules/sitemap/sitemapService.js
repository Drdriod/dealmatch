// src/modules/sitemap/sitemapService.js
//
// Builds sitemap.xml content. Lives outside /api so it doesn't count as a
// separate Vercel serverless function - api/platform.js calls buildSitemapXml()
// and writes the result to the response itself.

import { getForumCategoryTree, listThreadSlugsForSitemap } from '../forum/forumService.js'

const SITE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'

// Static marketing pages already allowed in robots.txt
const STATIC_PATHS = [
  { path: '/',              changefreq: 'daily',   priority: '1.0' },
  { path: '/places',        changefreq: 'hourly',  priority: '0.9' },
  { path: '/providers',     changefreq: 'hourly',  priority: '0.9' },
  { path: '/rentals',       changefreq: 'daily',   priority: '0.7' },
  { path: '/hotels',        changefreq: 'daily',   priority: '0.7' },
  { path: '/how-it-works',  changefreq: 'monthly', priority: '0.5' },
  { path: '/forum',         changefreq: 'daily',   priority: '0.8' },
  // /student-hostels intentionally omitted: it's a Coming Soon page with no
  // real content yet, and /professionals is the legacy advanced-filter
  // page, not something to send search traffic to as a primary listing.
]

export function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function urlEntry(loc, { lastmod, changefreq, priority } = {}) {
  return `<url>
<loc>${xmlEscape(loc)}</loc>
${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}
${priority ? `<priority>${priority}</priority>` : ''}
</url>`
}

async function threadEntriesFor(supabase, categoryId, urlPrefix) {
  const threads = await listThreadSlugsForSitemap(supabase, categoryId)

  return (threads || []).map(t => urlEntry(`${urlPrefix}/${t.slug}`, {
    lastmod: t.updated_at, changefreq: 'weekly', priority: '0.5',
  }))
}

export async function buildSitemapXml(supabase) {
  const entries = STATIC_PATHS.map(p => urlEntry(`${SITE_URL}${p.path}`, p))

  try {
    const tree = await getForumCategoryTree(supabase)

    for (const root of tree) {
      const rootUrl = `${SITE_URL}/forum/${root.slug}`
      entries.push(urlEntry(rootUrl, { changefreq: 'daily', priority: '0.6' }))

      if (root.children.length > 0) {
        for (const child of root.children) {
          const childUrl = `${rootUrl}/${child.slug}`
          entries.push(urlEntry(childUrl, { changefreq: 'daily', priority: '0.6' }))
          entries.push(...await threadEntriesFor(supabase, child.id, childUrl))
        }
      } else {
        entries.push(...await threadEntriesFor(supabase, root.id, rootUrl))
      }
    }
  } catch (err) {
    console.error('[sitemap] forum entries failed, continuing with static paths only:', err.message)
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`
}
