import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { fetchPublicCampaign } from '@/data/campaignRepository'
import { campaignPhotoUrl, cleanSource, pickUtm, validateLead } from '@/lib/campaign'
import { whatsappLink } from '@/lib/supportContacts'
import { btnPrimary, btnSecondary, inputCls, linkCls } from '@/components/ui/styles'

const LABELS = {
  property_sale: { facts: 'Key facts', list: 'Documents available' },
  platform_signup: { facts: 'At a glance', list: "What's included" },
}

function setMeta(name, content, attr = 'name') {
  if (typeof document === 'undefined') return
  let el = document.head.querySelector(`meta[${attr}="${name}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el) }
  el.setAttribute('content', content)
}

export default function CampaignPage() {
  const { slug } = useParams()
  const { search } = useLocation()
  const [state, setState] = useState({ status: 'loading', page: null })
  const [active, setActive] = useState(0)
  const [form, setForm] = useState({ name: '', phone: '', email: '', message: '', consent: false, website: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const counted = useRef('')
  const source = cleanSource(new URLSearchParams(search).get('src'))

  useEffect(() => {
    let live = true
    setState({ status: 'loading', page: null })
    fetchPublicCampaign(slug).then(({ data, error: err }) => {
      if (!live) return
      if (err || !data) setState({ status: 'missing', page: null })
      else setState({ status: 'ready', page: data })
    })
    return () => { live = false }
  }, [slug])

  const page = state.page

  // Title and link-preview tags for people who open the page in a browser.
  useEffect(() => {
    if (!page) return
    const previous = document.title
    document.title = page.title
    setMeta('description', page.subheadline || page.headline)
    setMeta('og:title', page.title, 'property')
    setMeta('og:description', page.subheadline || page.headline, 'property')
    if (page.photos?.[0]) setMeta('og:image', campaignPhotoUrl(import.meta.env.VITE_SUPABASE_URL, page.photos[0]), 'property')
    return () => { document.title = previous }
  }, [page])

  // Count one visit per page and source, once.
  useEffect(() => {
    if (!page) return
    const key = `${page.slug}:${source}`
    if (counted.current === key) return
    counted.current = key
    fetch('/api/platform?resource=campaign-visit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: page.slug, source }),
    }).catch(() => {})
  }, [page, source])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    const problem = validateLead(form)
    if (problem) { setError(problem); return }
    setSending(true)
    try {
      const res = await fetch('/api/platform?resource=campaign-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, slug: page.slug, source, utm: pickUtm(search) }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setError(body.error || 'We could not send your enquiry. Please try again.')
      else setSent(true)
    } catch {
      setError('We could not send your enquiry. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  const wa = page?.show_support_whatsapp ? whatsappLink(`Hello DealMatch, I am asking about: ${page.title}`) : ''
  const labels = LABELS[page?.template] || LABELS.property_sale
  const photos = (page?.photos || []).map((p) => campaignPhotoUrl(import.meta.env.VITE_SUPABASE_URL, p))
  const paragraphs = String(page?.description || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)

  return (
    <div className="min-h-screen bg-cream text-deep">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-display text-xl text-forest">DealMatch</Link>
          <span className="text-xs text-warm">Uyo, Akwa Ibom</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:py-10">
        {state.status === 'loading' && <p className="py-20 text-center text-sm text-warm" role="status">Loading…</p>}

        {state.status === 'missing' && (
          <div className="py-20 text-center">
            <h1 className="font-display text-3xl">This page is not available</h1>
            <p className="mt-2 text-sm text-warm">It may have ended or moved.</p>
            <Link to="/" className={`mt-4 inline-block ${linkCls}`}>Go to DealMatch</Link>
          </div>
        )}

        {state.status === 'ready' && page && (
          <>
            <section>
              {photos.length > 0 && (
                <div className="mb-4 space-y-2">
                  <img src={photos[Math.min(active, photos.length - 1)]} alt={page.headline}
                       className="aspect-[4/3] w-full rounded-2xl border border-line object-cover" />
                  {photos.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Photos">
                      {photos.map((src, i) => (
                        <button key={src} type="button" role="listitem" onClick={() => setActive(i)}
                                aria-label={`Show photo ${i + 1}`} aria-current={i === active}
                                className={`h-16 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${i === active ? 'border-terracotta' : 'border-line'}`}>
                          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <h1 className="font-display text-3xl leading-tight sm:text-4xl">{page.headline}</h1>
              {page.subheadline && <p className="mt-2 text-base text-warm">{page.subheadline}</p>}
              <a href="#enquire" className={`${btnPrimary} mt-4`}>{page.cta_label}</a>
            </section>

            {page.facts?.length > 0 && (
              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-3 text-base font-bold">{labels.facts}</h2>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {page.facts.map((f, i) => (
                    <div key={i} className="flex justify-between gap-3 border-b border-line/60 pb-2">
                      <dt className="text-warm">{f.label}</dt>
                      <dd className="text-right font-semibold">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {paragraphs.length > 0 && (
              <section className="space-y-3 text-sm leading-relaxed">
                {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              </section>
            )}

            {page.documents?.length > 0 && (
              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-2 text-base font-bold">{labels.list}</h2>
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {page.documents.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </section>
            )}

            {page.disclosure && (
              <p className="rounded-2xl border border-line bg-sand p-4 text-sm text-bark">{page.disclosure}</p>
            )}

            <section id="enquire" className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-1 text-base font-bold">{page.cta_label}</h2>
              {sent ? (
                <p className="text-sm" role="status">Thank you. We have your enquiry and will contact you using the details you gave.</p>
              ) : (
                <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
                  <div>
                    <label htmlFor="c-name" className="mb-1 block text-sm font-semibold">Your name</label>
                    <input id="c-name" className={inputCls} value={form.name} onChange={set('name')} autoComplete="name" maxLength={100} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="c-phone" className="mb-1 block text-sm font-semibold">Phone</label>
                      <input id="c-phone" type="tel" inputMode="tel" className={inputCls} value={form.phone} onChange={set('phone')} autoComplete="tel" />
                    </div>
                    <div>
                      <label htmlFor="c-email" className="mb-1 block text-sm font-semibold">Email <span className="font-normal text-warm">(or phone)</span></label>
                      <input id="c-email" type="email" className={inputCls} value={form.email} onChange={set('email')} autoComplete="email" maxLength={200} />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="c-msg" className="mb-1 block text-sm font-semibold">Message <span className="font-normal text-warm">(optional)</span></label>
                    <textarea id="c-msg" rows={3} className={inputCls} value={form.message} onChange={set('message')} maxLength={2000} />
                  </div>
                  {/* Spam trap: people never see or fill this. */}
                  <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', height: 0, overflow: 'hidden' }}>
                    <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={form.consent} onChange={set('consent')} />
                    <span>{page.consent_text}</span>
                  </label>
                  {error && <p role="alert" className="text-sm font-semibold text-danger">{error}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button type="submit" disabled={sending} className={btnPrimary}>{sending ? 'Sending…' : page.cta_label}</button>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={btnSecondary}>Chat with DealMatch support</a>}
                  </div>
                </form>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="border-t border-line bg-white py-5 text-center text-xs text-warm">
        <p>DealMatch Technology Limited · Uyo, Akwa Ibom, Nigeria</p>
        <p className="mt-1"><Link to="/privacy" className={linkCls}>Privacy</Link> · <Link to="/terms" className={linkCls}>Terms</Link></p>
      </footer>
    </div>
  )
}
