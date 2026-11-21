/**
 * Admin > Tax. The owner sets the VAT and withholding-tax rates here (no code change needed),
 * sees tax collected and owed, and chooses who may read the tax figures.
 *
 * Reading the ledger is limited by the database to the owner and to accounts the owner adds under
 * "Who can see tax figures" (for example the accountant). Ordinary admins and agents cannot.
 */
import React, { useState, useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Trash2 } from 'lucide-react'
import {
  fetchTaxSettings, setTaxSetting, canReadTax, fetchTaxHistory, fetchTaxLedger,
  markTaxRemitted, listTaxAccess, setTaxAccess, findUserByEmail,
} from '@/data/taxRepository'
import { ago, Badge, TableWrap, TR, EmptyRow, FEE_INPUT_STYLE, FEE_LABEL_STYLE } from '../shared'

const naira = (kobo) => '₦' + (Number(kobo || 0) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const KIND_LABEL = { vat: 'VAT collected', wht: 'Withholding tax held' }

export function TaxTab({ isSuperAdmin }) {
  const [settings, setSettings] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [canRead, setCanRead] = useState(null)
  const [ledger, setLedger] = useState([])
  const [history, setHistory] = useState([])
  const [access, setAccess] = useState([])
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    const [{ data: s }, readable] = await Promise.all([fetchTaxSettings(), canReadTax()])
    setSettings(s || [])
    setDrafts(Object.fromEntries((s || []).map(r => [r.key, { rate: String(r.rate_pct), on: r.is_active }])))
    setCanRead(readable)
    if (readable) {
      const [{ data: l }, { data: h }] = await Promise.all([fetchTaxLedger(), fetchTaxHistory()])
      setLedger(l || []); setHistory(h || [])
    }
    if (isSuperAdmin) {
      const { data: a } = await listTaxAccess()
      setAccess(a || [])
    }
  }, [isSuperAdmin])
  useEffect(() => { load() }, [load])

  const save = async (key) => {
    const d = drafts[key]
    const rate = Number(d.rate)
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return toast.error('Enter a rate between 0 and 100')
    setBusy(key)
    const { error } = await setTaxSetting({ key, ratePct: rate, isActive: d.on })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success('Saved. It applies to new payments only.')
    load()
  }

  const remit = async (kind) => {
    setBusy('remit-' + kind)
    const { data, error } = await markTaxRemitted({ kind, until: new Date().toISOString(), note: 'Marked as paid to the tax authority from the admin panel' })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success(`${data} entries marked as paid to the tax authority`)
    load()
  }

  const addReader = async () => {
    if (!email.trim()) return toast.error('Enter the account email')
    setBusy('access')
    const { data: found } = await findUserByEmail(email)
    if (!found || !found[0]) { setBusy(null); return toast.error('No account with that email. They must sign up first.') }
    const { error } = await setTaxAccess({ userId: found[0].id, allow: true, note: found[0].full_name || email })
    setBusy(null)
    if (error) return toast.error(error.message)
    setEmail(''); toast.success('Added. They can now read tax figures.'); load()
  }

  const removeReader = async (userId) => {
    setBusy('access')
    const { error } = await setTaxAccess({ userId, allow: false })
    setBusy(null)
    if (error) return toast.error(error.message)
    toast.success('Access removed'); load()
  }

  const owed = (kind) => ledger.filter(r => r.kind === kind && r.status === 'owed').reduce((n, r) => n + Number(r.tax_kobo), 0)
  const muted = { color: 'rgba(255,255,255,0.45)' }

  return (
    <div className="space-y-5">
      <p className="text-xs max-w-2xl" style={muted}>
        Set the tax rates here. A change applies to new payments only. VAT is added on top of DealMatch&apos;s own fees at checkout and shown to the payer;
        it is not DealMatch income. Withholding tax is held back from referral cash before it reaches the wallet. Both are switched off until your accountant confirms the rates.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {(settings || []).map(r => {
          const d = drafts[r.key] || { rate: '', on: false }
          return (
            <div key={r.key} className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-white">{r.label}</p>
                <Badge label={r.is_active ? 'ON' : 'OFF'} color={r.is_active ? '#7A9E7E' : '#888'} />
              </div>
              <p className="text-xs" style={muted}>{r.description}</p>
              <div>
                <label className="text-xs block mb-1" style={FEE_LABEL_STYLE}>Rate (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={d.rate} disabled={!isSuperAdmin}
                  onChange={e => setDrafts(x => ({ ...x, [r.key]: { ...d, rate: e.target.value } }))}
                  className="w-full rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE} />
              </div>
              <label className="flex items-center gap-2 text-xs text-white">
                <input type="checkbox" checked={d.on} disabled={!isSuperAdmin}
                  onChange={e => setDrafts(x => ({ ...x, [r.key]: { ...d, on: e.target.checked } }))} />
                Charge / deduct this tax
              </label>
              {isSuperAdmin
                ? <button onClick={() => save(r.key)} disabled={busy === r.key} className="w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--dm-gold)', color: 'var(--dm-deep)' }}>{busy === r.key ? 'Saving...' : 'Save'}</button>
                : <p className="text-xs" style={muted}>Only the owner can change tax rates.</p>}
              <p className="text-[11px]" style={muted}>Last changed {ago(r.updated_at)}</p>
            </div>
          )
        })}
        {!settings && <p className="text-xs" style={muted}>Loading...</p>}
      </div>

      {canRead === false && (
        <div className="rounded-2xl p-4 text-xs" style={{ backgroundColor: 'rgba(200,95,45,0.06)', border: '1px solid rgba(200,95,45,0.25)', color: 'rgba(255,255,255,0.7)' }}>
          Tax figures are visible only to the owner and to accountants the owner has added. Your account can see the rates above but not the amounts collected.
        </div>
      )}

      {canRead && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {['vat', 'wht'].map(kind => (
              <div key={kind} className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-xs" style={muted}>{KIND_LABEL[kind]}, not yet paid to the tax authority</p>
                <p className="text-2xl font-black text-white mt-1">{naira(owed(kind))}</p>
                {isSuperAdmin && owed(kind) > 0 && (
                  <button onClick={() => remit(kind)} disabled={busy === 'remit-' + kind}
                    className="mt-3 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-50" style={{ backgroundColor: 'rgba(122,158,126,0.15)', color: 'var(--dm-sage)' }}>
                    {busy === 'remit-' + kind ? 'Saving...' : 'Mark everything up to now as paid to the authority'}
                  </button>
                )}
              </div>
            ))}
          </div>

          <TableWrap cols={['When', 'Tax', 'On', 'Rate', 'Amount', 'Status']}>
            {ledger.slice(0, 50).map(r => (
              <TR key={r.id}>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={muted}>{ago(r.created_at)}</td>
                <td className="px-4 py-3 text-xs text-white">{r.kind === 'vat' ? 'VAT' : 'Withholding'}</td>
                <td className="px-4 py-3 text-xs text-white">{String(r.purpose || '').replace(/_/g, ' ')}<span className="block" style={muted}>{naira(r.base_kobo)}</span></td>
                <td className="px-4 py-3 text-xs text-white">{Number(r.rate_pct)}%</td>
                <td className="px-4 py-3 text-sm text-white">{naira(r.tax_kobo)}</td>
                <td className="px-4 py-3"><Badge label={r.status.toUpperCase()} color={r.status === 'owed' ? '#D4A853' : r.status === 'remitted' ? '#7A9E7E' : '#888'} /></td>
              </TR>
            ))}
            {ledger.length === 0 && <EmptyRow cols={6} msg="No tax recorded yet." />}
          </TableWrap>

          <div className="rounded-2xl p-4" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-bold mb-3 text-white">Rate changes</p>
            {history.length === 0 && <p className="text-xs" style={muted}>No changes yet.</p>}
            <div className="space-y-2">
              {history.map((h, i) => (
                <p key={i} className="text-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  <span className="text-white">{h.key === 'vat' ? 'VAT' : 'Withholding tax'}</span>{' '}
                  {Number(h.old_rate) !== Number(h.new_rate) ? `rate ${h.old_rate}% to ${h.new_rate}%` : `${h.new_rate}%`}
                  {h.old_active !== h.new_active ? `, switched ${h.new_active ? 'on' : 'off'}` : ''} · {ago(h.changed_at)}
                </p>
              ))}
            </div>
          </div>
        </>
      )}

      {isSuperAdmin && (
        <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-sm font-bold text-white">Who can see tax figures</p>
            <p className="text-xs mt-1" style={muted}>You always can. Add your accountant here so they can read the tax ledger without being given control of the platform. Admins and agents cannot see it unless added.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Account email" className="flex-1 min-w-[12rem] rounded-xl px-3 py-2.5 text-xs outline-none" style={FEE_INPUT_STYLE} />
            <button onClick={addReader} disabled={busy === 'access'} className="px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--dm-gold)', color: 'var(--dm-deep)' }}>Add</button>
          </div>
          {access.length === 0 && <p className="text-xs" style={muted}>Nobody added yet.</p>}
          {access.map(a => (
            <div key={a.user_id} className="flex items-center justify-between gap-3 text-xs text-white">
              <span>{a.note || a.email}<span className="block" style={muted}>{a.email} · added {ago(a.granted_at)}</span></span>
              <button onClick={() => removeReader(a.user_id)} aria-label="Remove access" className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(200,95,45,0.12)', color: 'var(--dm-terracotta)' }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
