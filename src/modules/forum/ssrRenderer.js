// src/modules/forum/ssrRenderer.js
//
// Pure rendering logic for DealMatch's forum "dynamic rendering" — a
// User-Agent-conditioned rewrite in vercel.json sends crawler requests for
// /forum/* to api/platform.js (?render=html), which calls renderForumSSR()
// here and writes the result to the response. Real browsers never hit this
// path — they get index.html and React Router renders the same content
// client-side (see src/pages/Forum/ForumPage.jsx).
//
// This lives outside /api so it doesn't count as a separate Vercel
// serverless function — api/platform.js is the only function file involved.
//
// Why this exists at all: DealMatch is a Vite SPA with no server-side
// rendering. Googlebot executes JavaScript reasonably well, but most other
// crawlers relevant to AEO (answer-engine bots like GPTBot, PerplexityBot,
// ClaudeBot) fetch raw HTML and do not run React. Without this, forum
// content would be functionally invisible to them. This renderer returns
// real, semantic, pre-rendered HTML with structured data for exactly those
// requests.
//
// Route shapes (segments come from the /forum/* path):
//   []                          -> category index
//   [categorySlug]              -> thread list (leaf) or child list (parent group)
//   [categorySlug, childSlug]   -> thread list for a child category
//   [categorySlug, childSlug, threadSlug] -> single thread + replies + JSON-LD

import {
  getForumCategoryTree, getForumCategoryBySlug, listChildCategories,
  listThreads, getThreadBySlug, listPosts,
} from './forumService.js'

const SITE_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'
const SITE_NAME = 'DealMatch'

// ─── HTML helpers ───────────────────────────────────────────────────────────
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function truncate(str, len) {
  const s = String(str ?? '')
  return s.length > len ? s.slice(0, len - 1).trimEnd() + '…' : s
}

export function pageShell({ title, description, canonicalPath, jsonLd = [], bodyHtml, noindex = false }) {
  const canonical = `${SITE_URL}${canonicalPath}`
  // JSON.stringify does not escape '<', so any user content containing a
  // literal "</script>" would otherwise close the tag early and corrupt the
  // page (and is a real XSS vector). \u003c is valid inside a JSON string
  // and renders identically once parsed.
  const ldBlocks = jsonLd
    .map(obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta name="robots" content="${noindex ? 'noindex, nofollow' : 'index, follow'}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
${ldBlocks}
</head>
<body>
<header><a href="${SITE_URL}">${SITE_NAME}</a> &rsaquo; <a href="${SITE_URL}/forum">Forum</a></header>
<main>
${bodyHtml}
</main>
<footer><p><a href="${SITE_URL}">Return to ${SITE_NAME}</a></p></footer>
</body>
</html>`
}

function notFoundResponse(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  return res.status(404).send(pageShell({
    title: 'Not found — DealMatch Forum',
    description: 'This forum page could not be found.',
    canonicalPath: '/forum',
    bodyHtml: '<h1>Not found</h1><p>This page does not exist or is no longer available.</p>',
    noindex: true,
  }))
}

// ─── Page renderers ─────────────────────────────────────────────────────────
async function renderIndex(supabase, res) {
  const tree = await getForumCategoryTree(supabase)

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Ask the People Who've Actually Done the Deal — DealMatch Forum",
    url: `${SITE_URL}/forum`,
    hasPart: tree.flatMap(c => [
      { '@type': 'WebPage', name: c.name, url: `${SITE_URL}/forum/${c.slug}` },
      ...c.children.map(child => ({ '@type': 'WebPage', name: child.name, url: `${SITE_URL}/forum/${c.slug}/${child.slug}` })),
    ]),
  }]

  const bodyHtml = `
<h1>Ask the People Who've Actually Done the Deal</h1>
<p>Real questions about real estate, business services, logistics, events, and more — answered by people who've been through it, not a chatbot guessing.</p>
<ul>
${tree.map(c => `<li><article>
  <h2><a href="${SITE_URL}/forum/${c.slug}">${escapeHtml(c.tagline || c.name)}</a></h2>
  <p>${escapeHtml(c.description || '')}</p>
  ${c.children.length ? `<ul>${c.children.map(child => `<li><a href="${SITE_URL}/forum/${c.slug}/${child.slug}">${escapeHtml(child.tagline || child.name)}</a></li>`).join('')}</ul>` : ''}
</article></li>`).join('\n')}
</ul>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800')
  return res.status(200).send(pageShell({
    title: 'Community Forum — DealMatch',
    description: "Get straight answers on rent prices, hiring artisans, freight rates, event vendors, and more — from DealMatch's community, not a search results page.",
    canonicalPath: '/forum',
    jsonLd,
    bodyHtml,
  }))
}

async function renderParentHub(supabase, res, category, children) {
  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${category.name} — DealMatch Forum`,
    url: `${SITE_URL}/forum/${category.slug}`,
    hasPart: children.map(c => ({ '@type': 'WebPage', name: c.name, url: `${SITE_URL}/forum/${category.slug}/${c.slug}` })),
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Forum', item: `${SITE_URL}/forum` },
      { '@type': 'ListItem', position: 2, name: category.name, item: `${SITE_URL}/forum/${category.slug}` },
    ],
  }]

  const bodyHtml = `
<p class="eyebrow">${escapeHtml(category.name)}</p>
<h1>${escapeHtml(category.tagline || category.name)}</h1>
<p>${escapeHtml(category.description || '')}</p>
<ul>
${children.map(c => `<li><article><h2><a href="${SITE_URL}/forum/${category.slug}/${c.slug}">${escapeHtml(c.tagline || c.name)}</a></h2><p>${escapeHtml(c.description || '')}</p></article></li>`).join('\n')}
</ul>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800')
  return res.status(200).send(pageShell({
    title: `${category.name} — DealMatch Forum`,
    description: truncate(category.description || `${category.name} on DealMatch.`, 155),
    canonicalPath: `/forum/${category.slug}`,
    jsonLd,
    bodyHtml,
  }))
}

async function renderCategory(supabase, res, category, breadcrumbSlugPath) {
  const { threads } = await listThreads(supabase, category.id, { sort: 'active', pageSize: 50 })
  const canonicalPath = `/forum/${breadcrumbSlugPath.join('/')}`

  const jsonLd = [{
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${category.name} — DealMatch Forum`,
    itemListElement: threads.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${canonicalPath}/${t.slug}`,
      name: t.title,
    })),
  }, {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Forum', item: `${SITE_URL}/forum` },
      ...breadcrumbSlugPath.map((slug, i) => ({
        '@type': 'ListItem', position: i + 2, name: i === breadcrumbSlugPath.length - 1 ? category.name : slug,
        item: `${SITE_URL}/forum/${breadcrumbSlugPath.slice(0, i + 1).join('/')}`,
      })),
    ],
  }]

  const bodyHtml = `
<p class="eyebrow">${escapeHtml(category.name)}</p>
<h1>${escapeHtml(category.tagline || category.name)}</h1>
<p>${escapeHtml(category.description || '')}</p>
${threads.length === 0 ? "<p>Nobody's asked yet. Be the first — someone else searching this exact question will thank you.</p>" : `<ul>
${threads.map(t => `<li><article>
  <h2><a href="${SITE_URL}${canonicalPath}/${t.slug}">${escapeHtml(t.title)}</a></h2>
  <p>${t.reply_count} repl${t.reply_count === 1 ? 'y' : 'ies'} · ${t.view_count} view${t.view_count === 1 ? '' : 's'}${t.thread_type === 'QUESTION' ? ' · Question' : ''}</p>
</article></li>`).join('\n')}
</ul>`}`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
  return res.status(200).send(pageShell({
    title: `${category.name} — DealMatch Forum`,
    description: truncate(category.description || `Discussions and questions about ${category.name} on DealMatch.`, 155),
    canonicalPath,
    jsonLd,
    bodyHtml,
  }))
}

async function renderThread(supabase, res, category, threadSlug, breadcrumbSlugPath) {
  let thread
  try {
    thread = await getThreadBySlug(supabase, category.id, threadSlug)
  } catch {
    return notFoundResponse(res)
  }

  if (thread.status === 'HIDDEN') return notFoundResponse(res)

  const canonicalPath = `/forum/${breadcrumbSlugPath.join('/')}/${thread.slug}`
  const { posts } = await listPosts(supabase, thread.id, { pageSize: 100 })
  const acceptedPost = thread.accepted_post_id
    ? posts.find(p => p.id === thread.accepted_post_id)
    : null

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Forum', item: `${SITE_URL}/forum` },
      ...breadcrumbSlugPath.map((slug, i) => ({
        '@type': 'ListItem', position: i + 2, name: slug,
        item: `${SITE_URL}/forum/${breadcrumbSlugPath.slice(0, i + 1).join('/')}`,
      })),
      { '@type': 'ListItem', position: breadcrumbSlugPath.length + 2, name: thread.title, item: `${SITE_URL}${canonicalPath}` },
    ],
  }

  let mainLd
  if (thread.thread_type === 'QUESTION' && acceptedPost) {
    // Highest-value AEO shape: a directly quotable, machine-readable Q&A pair.
    mainLd = {
      '@context': 'https://schema.org',
      '@type': 'QAPage',
      mainEntity: {
        '@type': 'Question',
        name: thread.title,
        text: thread.body,
        answerCount: posts.length,
        dateCreated: thread.created_at,
        acceptedAnswer: {
          '@type': 'Answer',
          text: acceptedPost.body,
          dateCreated: acceptedPost.created_at,
        },
        suggestedAnswer: posts
          .filter(p => p.id !== acceptedPost.id)
          .slice(0, 5)
          .map(p => ({ '@type': 'Answer', text: p.body, dateCreated: p.created_at })),
      },
    }
  } else {
    mainLd = {
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: thread.title,
      articleBody: thread.body,
      datePublished: thread.created_at,
      dateModified: thread.updated_at,
      interactionStatistic: {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/CommentAction',
        userInteractionCount: posts.length,
      },
      comment: posts.slice(0, 20).map(p => ({
        '@type': 'Comment',
        text: p.body,
        dateCreated: p.created_at,
      })),
    }
  }

  const postsHtml = posts.map((p, i) => `
<article ${p.id === thread.accepted_post_id ? 'data-accepted="true"' : ''}>
  <h3>${p.id === thread.accepted_post_id ? '✓ Accepted answer' : `Reply ${i + 1}`}</h3>
  <p>${escapeHtml(p.body)}</p>
</article>`).join('\n')

  const bodyHtml = `
<nav>
  <a href="${SITE_URL}/forum/${breadcrumbSlugPath.join('/')}">${escapeHtml(category.name)}</a>
</nav>
<article>
  <h1>${escapeHtml(thread.title)}</h1>
  <p>${escapeHtml(thread.body)}</p>
</article>
<section>
  <h2>${posts.length} repl${posts.length === 1 ? 'y' : 'ies'}</h2>
  ${postsHtml || '<p>No replies yet.</p>'}
</section>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  return res.status(200).send(pageShell({
    title: `${thread.title} — DealMatch Forum`,
    description: truncate(thread.body, 155),
    canonicalPath,
    jsonLd: [breadcrumbLd, mainLd],
    bodyHtml,
  }))
}

// ─── Entry point ────────────────────────────────────────────────────────────
// Disambiguates the URL shape: segment[0] might be a leaf category (in which
// case segment[1] is a thread slug) or a parent group (in which case
// segment[1] is a child category slug, and segment[2] if present is a thread
// slug within that child).
//
// Returns { status, contentType, body } — api/platform.js is responsible for
// actually writing that to the HTTP response. The internal render* functions
// above still call res.status()/setHeader()/send(), so we hand them a tiny
// capture object that mimics that shape instead of the real Vercel `res`.
function makeCapture() {
  const cap = { _status: 200, _headers: {}, _body: '' }
  cap.status = (code) => { cap._status = code; return cap }
  cap.setHeader = (k, v) => { cap._headers[k] = v }
  cap.send = (body) => { cap._body = body; return cap }
  return cap
}

export async function renderForumSSR(supabase, segments) {
  const res = makeCapture()

  try {
    if (segments.length === 0) {
      await renderIndex(supabase, res)
    } else {
      let category
      try {
        category = await getForumCategoryBySlug(supabase, segments[0])
      } catch {
        notFoundResponse(res)
        return { status: res._status, contentType: res._headers['Content-Type'], body: res._body }
      }

      const children = await listChildCategories(supabase, category.id)

      if (children.length > 0) {
        // segments[0] is a parent group
        if (segments.length === 1) {
          await renderParentHub(supabase, res, category, children)
        } else {
          const child = children.find(c => c.slug === segments[1])
          if (!child) {
            notFoundResponse(res)
          } else if (segments.length === 2) {
            await renderCategory(supabase, res, child, [segments[0], segments[1]])
          } else if (segments.length === 3) {
            await renderThread(supabase, res, child, segments[2], [segments[0], segments[1]])
          } else {
            notFoundResponse(res)
          }
        }
      } else {
        // segments[0] is a leaf category
        if (segments.length === 1) {
          await renderCategory(supabase, res, category, [segments[0]])
        } else if (segments.length === 2) {
          await renderThread(supabase, res, category, segments[1], [segments[0]])
        } else {
          notFoundResponse(res)
        }
      }
    }
  } catch (err) {
    console.error('[forum ssr] error:', err.message)
    notFoundResponse(res)
  }

  return { status: res._status, contentType: res._headers['Content-Type'], body: res._body }
}
