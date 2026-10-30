import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SEATS } from '@/data/testSeats'
import { filterReports, summariseSeats } from '@/lib/testFeedModel'
import { fetchFeed } from '@/lib/testReports'

const KEY_STORE = 'dm-test-feed-key'
const POLL_MS = 10000
const SEV_STYLE = { S1: 'bg-red-100 text-red-800', S2: 'bg-orange-100 text-orange-800', S3: 'bg-yellow-100 text-yellow-800', none: 'bg-green-100 text-green-800' }
const OUTCOME_LABEL = { passed: 'All passed', problems: 'Problems', stuck: 'Stuck', not_started: 'Could not start' }

const ago = (iso) => {
  if (!iso) return 'no activity'
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

function readKey(params) {
  const fromUrl = params.get('key')
  if (fromUrl) {
    try { window.localStorage.setItem(KEY_STORE, fromUrl) } catch { /* ok */ }
    return fromUrl
  }
  try { return window.localStorage.getItem(KEY_STORE) || '' } catch { return '' }
}

export default function TestFeedPage() {
  const [params] = useSearchParams()
  const [key] = useState(() => readKey(params))
  const [data, setData] = useState({ reports: [], progress: [] })
  const [error, setError] = useState('')
  const [updated, setUpdated] = useState(null)
  const [seat, setSeat] = useState('all')
  const [severity, setSeverity] = useState('all')

  const load = useCallback(async () => {
    try {
      setData(await fetchFeed(key))
      setError('')
      setUpdated(new Date())
    } catch {
      setError('Could not load. Check the key in your link, or that the report tables exist.')
    }
  }, [key])

  useEffect(() => {
    if (!key) return undefined
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [key, load])

  const board = useMemo(() => summariseSeats(SEATS, data.progress, data.reports), [data])
  const shown = useMemo(() => filterReports(data.reports, { seat, severity }), [data, seat, severity])

  if (!key) {
    return (
      <div className="max-w-md mx-auto px-4 py-12 text-deep">
        <h1 className="text-xl font-semibold">Owner feed</h1>
        <p className="mt-2 text-sm text-deep/70">Open the private link you were given. It ends with <code>?key=…</code>.</p>
      </div>
    )
  }

  const finished = board.filter((b) => b.state === 'finished').length
  const started = board.filter((b) => b.state !== 'not started').length

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 text-deep">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Live test feed</h1>
        <p className="text-sm text-deep/60">
          {updated ? `Updated ${updated.toLocaleTimeString()}, refreshes every 10 seconds` : 'Loading…'}
        </p>
      </div>
      {error && <div role="alert" className="mt-3 rounded-lg bg-red-50 border border-red-600/40 p-3 text-sm text-red-800">{error}</div>}

      <p className="mt-3 text-sm">
        <strong>{started}</strong> of {board.length} testers started · <strong>{finished}</strong> finished · <strong>{data.reports.length}</strong> reports ·
        <strong className="text-red-700"> {data.reports.filter((r) => r.severity === 'S1').length}</strong> S1
      </p>

      <h2 className="mt-6 text-lg font-semibold">Who has done what</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-deep/15 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-deep/5 text-left">
            <tr><th className="p-2">Seat</th><th className="p-2">Role</th><th className="p-2">Steps</th><th className="p-2">Status</th><th className="p-2">Reports</th><th className="p-2">Worst</th><th className="p-2">Last activity</th></tr>
          </thead>
          <tbody>
            {board.map((b) => (
              <tr key={b.code} className="border-t border-deep/10">
                <td className="p-2 font-semibold">{b.seat}</td>
                <td className="p-2">{b.title}</td>
                <td className="p-2">{b.done}/{b.total}</td>
                <td className="p-2">{b.state}</td>
                <td className="p-2">{b.reports}</td>
                <td className="p-2"><span className={`rounded px-2 py-0.5 text-xs ${SEV_STYLE[b.worst]}`}>{b.worst === 'none' ? '-' : b.worst}</span></td>
                <td className="p-2 text-deep/60">{ago(b.lastActivity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold mr-auto">Reports, newest first</h2>
        <select value={seat} onChange={(e) => setSeat(e.target.value)} className="rounded-lg border border-deep/20 bg-white px-2 py-1.5 text-sm">
          <option value="all">All seats</option>
          {SEATS.map((s) => <option key={s.code} value={s.code}>{s.seat} {s.title}</option>)}
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-deep/20 bg-white px-2 py-1.5 text-sm">
          <option value="all">All severities</option>
          <option value="S1">S1</option><option value="S2">S2</option><option value="S3">S3</option><option value="none">No problem</option>
        </select>
      </div>

      <ul className="mt-3 space-y-3">
        {shown.length === 0 && <li className="text-sm text-deep/60">No reports yet.</li>}
        {shown.map((r) => (
          <li key={r.id} className="rounded-xl border border-deep/15 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{r.seat}</span>
              <span>{r.tester_name}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${SEV_STYLE[r.severity]}`}>{r.severity === 'none' ? 'no problem' : r.severity}</span>
              <span className="text-deep/60">{OUTCOME_LABEL[r.outcome]}</span>
              <span className="ml-auto text-deep/50">{ago(r.created_at)}</span>
            </div>
            {r.step_no && <p className="mt-2"><strong>Step:</strong> {r.step_no}</p>}
            {r.tried && <p className="mt-1"><strong>Tried:</strong> {r.tried}</p>}
            {r.happened && <p className="mt-1"><strong>Happened:</strong> {r.happened}</p>}
            {r.expected && <p className="mt-1"><strong>Expected:</strong> {r.expected}</p>}
            {r.page_url && <p className="mt-1 break-all"><strong>Page:</strong> {r.page_url}</p>}
            {r.screenshot_url && <p className="mt-1 break-all"><strong>Screenshot:</strong> {r.screenshot_url}</p>}
            {r.device && <p className="mt-1 text-deep/50 break-all">{r.device}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
