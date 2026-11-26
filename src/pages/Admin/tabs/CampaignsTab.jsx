/**
 * Campaigns: create and edit landing pages for ads and outreach, with no code change.
 * Pages live at /l/<slug>. Enquiries and per-source counts are shown here.
 */
import React, { useState, useEffect, useCallback } from 'react'
import { Plus, RefreshCw, Copy, Trash2, Upload, ExternalLink, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/context/AuthContext'
import {
  fetchCampaignPages, insertCampaignPage, updateCampaignPage, fetchCampaignLeads,
  updateCampaignLead, fetchCampaignStats, uploadCampaignPhoto, removeCampaignPhoto,
} from '@/data/campaignRepository'
import { CAMPAIGN_TEMPLATES, slugify, isValidSlug, isValidEmail, campaignPhotoUrl, cleanSource } from '@/lib/campaign'
import { Spinner, Badge, TableWrap, TR, EmptyRow, ago } from '../shared'

const SITE = 'https://www.dealmatch.com.ng'
const FIELD = { backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }
const LABEL = { color: 'rgba(255,255,255,0.5)' }
const STATUS_COLOR = { published: '#7A9E7E', draft: '#D4A853', archived: '#888888' }
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed']

const EMPTY = {
  id: null, slug: '', template: 'property_sale', status: 'draft', title: '', headline: '', subheadline: '',
  description: '', facts: [], documentsText: '', photos: [], disclosure: '', cta_label: 'Send an enquiry',
  consent_text: 'I agree that DealMatch may contact me about this enquiry and keep my details for that purpose.',
  notify_email: '', show_support_whatsapp: false, trust_claims_approved: false,
}

const toForm = (p) => ({
  ...EMPTY, ...p,
  subheadline: p.subheadline || '', description: p.description || '', disclosure: p.disclosure || '',
  notify_email: p.notify_email || '', facts: Array.isArray(p.facts) ? p.facts : [],
  documentsText: (Array.isArray(p.documents) ? p.documents : []).join('\n'), photos: p.photos || [],
})

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="text-xs font-bold mb-1.5 block" style={LABEL}>{label}</label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>{hint}</p>}
    </div>
  )
}

const inputProps = { className: 'w-full rounded-xl px-4 py-3 text-sm outline-none', style: FIELD }

export function CampaignsTab() {
  const { user: admin } = useAuth()
  const [pages, setPages] = useState([])
  const [stats, setStats] = useState([])
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [src, setSrc] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [p, s, l] = await Promise.all([fetchCampaignPages(), fetchCampaignStats(), fetchCampaignLeads()])
    if (p.error) toast.error('Could not load campaigns: ' + p.error.message)
    setPages(p.data || []); setStats(s.data || []); setLeads(l.data || [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const totals = (id) => stats.filter((r) => r.campaign_id === id)
    .reduce((a, r) => ({ visits: a.visits + Number(r.visits || 0), leads: a.leads + Number(r.leads || 0) }), { visits: 0, leads: 0 })

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  function onTitle(e) {
    const title = e.target.value
    setForm((f) => ({ ...f, title, slug: f.id ? f.slug : slugify(title) }))
  }

  async function onPhotos(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    if (form.photos.length + files.length > 12) { toast.error('A page can have up to 12 photos'); return }
    setUploading(true)
    const added = []
    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { toast.error(`${file.name}: use JPG, PNG or WebP`); continue }
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} is over 5 MB`); continue }
      const { path, error } = await uploadCampaignPhoto(file)
      if (error) toast.error(`${file.name}: ${error.message}`); else added.push(path)
    }
    setForm((f) => ({ ...f, photos: [...f.photos, ...added] }))
    setUploading(false)
  }

  async function dropPhoto(path) {
    setForm((f) => ({ ...f, photos: f.photos.filter((p) => p !== path) }))
    const { error } = await removeCampaignPhoto(path)
    if (error) console.error('photo removal failed', error.message)
  }

  const makeFirst = (path) => setForm((f) => ({ ...f, photos: [path, ...f.photos.filter((p) => p !== path)] }))
  const setFact = (i, k, v) => setForm((f) => ({ ...f, facts: f.facts.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  async function save() {
    if (!isValidSlug(form.slug)) { toast.error('The web address needs 3 to 60 letters, numbers and single dashes'); return }
    if (form.title.trim().length < 3 || form.headline.trim().length < 3) { toast.error('Fill in the page title and the headline'); return }
    if (form.notify_email && !isValidEmail(form.notify_email)) { toast.error('The enquiry email does not look right'); return }
    const facts = form.facts.filter((f) => f.label?.trim() && f.value?.trim()).map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
    const documents = form.documentsText.split('\n').map((d) => d.trim()).filter(Boolean)
    const row = {
      slug: form.slug, template: form.template, status: form.status, title: form.title.trim(), headline: form.headline.trim(),
      subheadline: form.subheadline.trim() || null, description: form.description.trim() || null, facts, documents,
      photos: form.photos, disclosure: form.disclosure.trim() || null, cta_label: form.cta_label.trim(),
      consent_text: form.consent_text.trim(), notify_email: form.notify_email.trim() || null,
      show_support_whatsapp: form.show_support_whatsapp, trust_claims_approved: form.trust_claims_approved,
    }
    setSaving(true)
    const { data, error } = form.id
      ? await updateCampaignPage(form.id, row)
      : await insertCampaignPage({ ...row, created_by: admin?.id })
    setSaving(false)
    if (error) {
      toast.error(error.code === '23505' ? 'That web address is already used by another page' : error.message)
      return
    }
    toast.success(form.status === 'published' ? 'Saved. The page is live.' : 'Saved')
    setForm(toForm(data)); load()
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast.success('Link copied') } catch { toast.error('Copy failed. Select the link and copy it.') }
  }

  async function setLeadStatus(id, status) {
    const { error } = await updateCampaignLead(id, { status })
    if (error) toast.error(error.message); else setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status } : l)))
  }

  if (loading) return <Spinner />

  if (form) {
    const link = `${SITE}/l/${form.slug}${src ? `?src=${cleanSource(src)}` : ''}`
    return (
      <div className="space-y-4 max-w-3xl">
        <button onClick={() => setForm(null)} className="flex items-center gap-1.5 text-xs font-semibold" style={LABEL}><ArrowLeft size={13} /> All campaigns</button>
        <h3 className="text-white font-bold">{form.id ? 'Edit campaign page' : 'New campaign page'}</h3>

        <div className="rounded-2xl p-5 space-y-3" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Template">
              <select {...inputProps} value={form.template} onChange={set('template')}>
                {CAMPAIGN_TEMPLATES.map((t) => <option key={t.value} value={t.value} style={{ backgroundColor: '#17211B' }}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Status" hint="Only Published pages are visible to the public.">
              <select {...inputProps} value={form.status} onChange={set('status')}>
                {['draft', 'published', 'archived'].map((s) => <option key={s} value={s} style={{ backgroundColor: '#17211B' }}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Page title" hint="Shown in the browser tab and in link previews.">
            <input {...inputProps} value={form.title} onChange={onTitle} maxLength={120} />
          </Field>
          <Field label="Web address" hint={form.id ? 'Fixed once created, so shared links keep working.' : 'Made from the title. Letters, numbers and dashes.'}>
            <div className="flex items-center gap-2">
              <span className="text-xs whitespace-nowrap" style={LABEL}>{SITE.replace('https://', '')}/l/</span>
              <input {...inputProps} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} disabled={!!form.id} maxLength={60} />
            </div>
          </Field>
          <Field label="Headline"><input {...inputProps} value={form.headline} onChange={set('headline')} maxLength={140} /></Field>
          <Field label="Subheadline (optional)"><input {...inputProps} value={form.subheadline} onChange={set('subheadline')} maxLength={240} /></Field>
          <Field label="Description" hint="Leave a blank line between paragraphs.">
            <textarea {...inputProps} rows={6} value={form.description} onChange={set('description')} maxLength={4000} />
          </Field>

          <Field label="Key facts (price, size, area…)">
            <div className="space-y-2">
              {form.facts.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input {...inputProps} placeholder="Label, e.g. Size" value={f.label || ''} onChange={(e) => setFact(i, 'label', e.target.value)} />
                  <input {...inputProps} placeholder="Value, e.g. about 700 sqm" value={f.value || ''} onChange={(e) => setFact(i, 'value', e.target.value)} />
                  <button type="button" aria-label="Remove fact" onClick={() => setForm((x) => ({ ...x, facts: x.facts.filter((_, j) => j !== i) }))} className="px-2"><Trash2 size={14} style={LABEL} /></button>
                </div>
              ))}
              {form.facts.length < 12 && (
                <button type="button" onClick={() => setForm((x) => ({ ...x, facts: [...x.facts, { label: '', value: '' }] }))} className="text-xs font-semibold" style={{ color: '#D4A853' }}>+ Add a fact</button>
              )}
            </div>
          </Field>

          <Field label="Documents available or what is included (one per line)">
            <textarea {...inputProps} rows={4} value={form.documentsText} onChange={set('documentsText')} />
          </Field>

          <Field label={`Photos (${form.photos.length}/12)`} hint="JPG, PNG or WebP, up to 5 MB each. The first photo is the cover and the link preview image. Use photos with no people in them.">
            <div className="flex flex-wrap gap-2">
              {form.photos.map((p, i) => (
                <div key={p} className="relative w-24">
                  <img src={campaignPhotoUrl(import.meta.env.VITE_SUPABASE_URL, p)} alt="" className="h-20 w-24 rounded-lg object-cover" />
                  <div className="flex justify-between mt-1 text-[11px]">
                    {i === 0 ? <span style={{ color: '#D4A853' }}>Cover</span> : <button type="button" onClick={() => makeFirst(p)} style={LABEL}>Make cover</button>}
                    <button type="button" aria-label="Remove photo" onClick={() => dropPhoto(p)}><Trash2 size={12} style={LABEL} /></button>
                  </div>
                </div>
              ))}
              <label className="flex h-20 w-24 cursor-pointer flex-col items-center justify-center rounded-lg text-xs" style={{ ...FIELD, borderStyle: 'dashed' }}>
                <Upload size={16} />{uploading ? 'Uploading…' : 'Add'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPhotos} disabled={uploading} />
              </label>
            </div>
          </Field>

          <Field label="Disclosure line (optional)" hint='Example: "Listed by the family of the DealMatch founder."'>
            <input {...inputProps} value={form.disclosure} onChange={set('disclosure')} maxLength={300} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Button wording"><input {...inputProps} value={form.cta_label} onChange={set('cta_label')} maxLength={40} /></Field>
            <Field label="Email enquiries to" hint="A DealMatch address. Enquiries are also kept in this tab.">
              <input {...inputProps} type="email" value={form.notify_email} onChange={set('notify_email')} />
            </Field>
          </div>
          <Field label="Consent wording shown beside the tick box"><textarea {...inputProps} rows={2} value={form.consent_text} onChange={set('consent_text')} maxLength={400} /></Field>

          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={form.show_support_whatsapp} onChange={set('show_support_whatsapp')} /> Show a "Chat with DealMatch support" button (needs the support WhatsApp number to be set)</label>
          <label className="flex items-start gap-2 text-sm text-white"><input type="checkbox" className="mt-1" checked={form.trust_claims_approved} onChange={set('trust_claims_approved')} />
            <span>Allow the words "escrow", "verified" or "guarantee" on this page. <span style={LABEL}>Tick only if each claim is true for this page today. Escrow funding is currently off.</span></span>
          </label>

          <div className="flex gap-3 pt-1">
            <button onClick={() => setForm(null)} className="flex-1 py-3 rounded-2xl text-sm font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>Close</button>
            <button onClick={save} disabled={saving || uploading} className="flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-50" style={{ backgroundColor: '#D4A853', color: '#17211B' }}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>

        {form.id && (
          <div className="rounded-2xl p-5 space-y-2" style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 className="text-white font-bold text-sm">Link for your ads and emails</h4>
            <Field label="Source tag (optional)" hint="Use a different tag for each batch or ad, for example email1 or fb-ad. The counts below split by this tag.">
              <input {...inputProps} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="email1" />
            </Field>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs break-all text-white">{link}</code>
              <button type="button" onClick={() => copy(link)} aria-label="Copy link" className="p-2 rounded-lg" style={FIELD}><Copy size={14} /></button>
              <a href={link} target="_blank" rel="noopener noreferrer" aria-label="Open page" className="p-2 rounded-lg" style={FIELD}><ExternalLink size={14} /></a>
            </div>
            {form.status !== 'published' && <p className="text-xs" style={{ color: '#D4A853' }}>This page is {form.status}. The public cannot open it until it is Published.</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h3 className="text-white font-bold">Campaigns</h3><p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>Landing pages for ads and outreach. Each lives at /l/&lt;address&gt;.</p></div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}><RefreshCw size={12} /> Refresh</button>
          <button onClick={() => { setSrc(''); setForm({ ...EMPTY }) }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold" style={{ backgroundColor: '#D4A853', color: '#17211B' }}><Plus size={14} /> New page</button>
        </div>
      </div>

      <TableWrap cols={['Page', 'Status', 'Visits', 'Enquiries', 'By source', '']}>
        {pages.map((p) => {
          const t = totals(p.id)
          const by = stats.filter((r) => r.campaign_id === p.id && r.source).map((r) => `${r.source}: ${r.visits} visits, ${r.leads} enquiries`)
          return (
            <TR key={p.id}>
              <td className="px-4 py-3"><div className="text-white text-sm font-semibold">{p.title}</div><div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>/l/{p.slug}</div></td>
              <td className="px-4 py-3"><Badge label={p.status} color={STATUS_COLOR[p.status]} /></td>
              <td className="px-4 py-3 text-white text-sm">{t.visits}</td>
              <td className="px-4 py-3 text-white text-sm">{t.leads}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{by.length ? by.map((b) => <div key={b}>{b}</div>) : 'N/A'}</td>
              <td className="px-4 py-3"><button onClick={() => { setSrc(''); setForm(toForm(p)) }} className="text-xs font-bold" style={{ color: '#D4A853' }}>Edit</button></td>
            </TR>
          )
        })}
        {pages.length === 0 && <EmptyRow cols={6} msg="No campaign pages yet. Press New page." />}
      </TableWrap>

      <div>
        <h4 className="text-white font-bold text-sm mb-2">Enquiries</h4>
        <TableWrap cols={['Who', 'Contact', 'Page', 'Source', 'Message', 'Status', 'When']}>
          {leads.map((l) => (
            <TR key={l.id}>
              <td className="px-4 py-3 text-white text-sm font-semibold">{l.name}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>{l.phone && <div>{l.phone}</div>}{l.email && <div>{l.email}</div>}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{l.campaign_pages?.title || 'N/A'}</td>
              <td className="px-4 py-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{l.source}</td>
              <td className="px-4 py-3 text-xs max-w-[200px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{l.message || 'N/A'}</td>
              <td className="px-4 py-3">
                <select value={l.status} onChange={(e) => setLeadStatus(l.id, e.target.value)} className="rounded-lg px-2 py-1 text-xs" style={FIELD} aria-label={`Status for ${l.name}`}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s} style={{ backgroundColor: '#17211B' }}>{s}</option>)}
                </select>
              </td>
              <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.35)' }}>{ago(l.created_at)}</td>
            </TR>
          ))}
          {leads.length === 0 && <EmptyRow cols={7} msg="No enquiries yet" />}
        </TableWrap>
      </div>
    </div>
  )
}
