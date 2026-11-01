import { useState } from 'react'
import { OUTCOMES, SEVERITIES, buildReport } from '@/lib/testFeedModel'
import { submitReport } from '@/lib/testReports'

const inputCls = 'w-full rounded-lg border border-deep/20 bg-white px-3 py-2.5 text-base'
const NAME_KEY = 'dm-test-name'

function savedName() {
  try { return window.localStorage.getItem(NAME_KEY) || '' } catch { return '' }
}

export default function TestReportForm({ seat }) {
  const [form, setForm] = useState({ name: savedName(), outcome: '', severity: 'none', step: '', pageUrl: '', tried: '', happened: '', expected: '', device: '', screenshotUrl: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const device = typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 150) : ''
    const result = buildReport(seat, form, device)
    if (!result.ok) { setError(result.error); setStatus('error'); return }
    setStatus('sending'); setError('')
    try {
      await submitReport(result.row)
      try { window.localStorage.setItem(NAME_KEY, form.name) } catch { /* not remembered */ }
      setCount((c) => c + 1)
      setStatus('sent')
      setForm((f) => ({ ...f, outcome: '', severity: 'none', step: '', pageUrl: '', tried: '', happened: '', expected: '', screenshotUrl: '' }))
    } catch {
      setStatus('error')
      setError('Could not send. Check your internet and try again, or send it to the owner on WhatsApp.')
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-xl border border-deep/15 bg-white p-4 space-y-4 text-sm text-deep">
      <div>
        <h2 className="text-base font-semibold">Send your report</h2>
        <p className="mt-1 text-deep/70">One entry per problem. If everything worked, send one entry and choose "All steps passed". The owner sees it straight away.</p>
      </div>

      {status === 'sent' && (
        <div role="status" className="rounded-lg bg-green-50 border border-green-600/40 p-3">
          Thank you! Report received{count > 1 ? ` (${count} sent)` : ''}. You can send another one any time.
        </div>
      )}
      {status === 'error' && <div role="alert" className="rounded-lg bg-red-50 border border-red-600/40 p-3 text-red-800">{error}</div>}

      <label className="block">Your name
        <input className={inputCls} value={form.name} onChange={set('name')} autoComplete="name" maxLength={80} />
      </label>

      <fieldset>
        <legend className="mb-1">How did it go?</legend>
        {OUTCOMES.map((o) => (
          <label key={o.value} className="flex items-center gap-2 py-1">
            <input type="radio" name="outcome" value={o.value} checked={form.outcome === o.value} onChange={set('outcome')} />
            {o.label}
          </label>
        ))}
      </fieldset>

      {form.outcome && form.outcome !== 'passed' && (
        <>
          <label className="block">How serious is it?
            <select className={inputCls} value={form.severity} onChange={set('severity')}>
              {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
          <label className="block">Which step number (for example 4)?
            <input className={inputCls} value={form.step} onChange={set('step')} maxLength={20} inputMode="numeric" />
          </label>
          <label className="block">Page link (copy from the address bar)
            <input className={inputCls} value={form.pageUrl} onChange={set('pageUrl')} maxLength={500} inputMode="url" />
          </label>
          <label className="block">What did you try?
            <textarea className={inputCls} rows={2} value={form.tried} onChange={set('tried')} maxLength={2000} />
          </label>
          <label className="block">What happened?
            <textarea className={inputCls} rows={3} value={form.happened} onChange={set('happened')} maxLength={2000} />
          </label>
          <label className="block">What did you expect?
            <textarea className={inputCls} rows={2} value={form.expected} onChange={set('expected')} maxLength={2000} />
          </label>
          <label className="block">Screenshot link (optional)
            <input className={inputCls} value={form.screenshotUrl} onChange={set('screenshotUrl')} maxLength={500} inputMode="url" />
          </label>
          <p className="text-deep/60">Money wrong, or you can see someone else's private data? Choose S1 and also message the owner straight away.</p>
        </>
      )}

      <button type="submit" disabled={status === 'sending'} className="w-full rounded-lg bg-deep text-white py-3 font-medium disabled:opacity-60">
        {status === 'sending' ? 'Sending…' : 'Send report'}
      </button>
      <p className="text-xs text-deep/50">We note your phone or browser type automatically.</p>
    </form>
  )
}
