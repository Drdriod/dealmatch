import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PHASES, findSeat } from '@/data/testSeats'
import { testReportUrl } from '@/lib/testMode'
import { saveProgress } from '@/lib/testReports'
import TestReportForm from './TestReportForm'

const storageKey = (code) => `dm-test-progress-${code}`

function loadDone(code) {
  try {
    const raw = window.localStorage.getItem(storageKey(code))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveDone(code, done) {
  try {
    window.localStorage.setItem(storageKey(code), JSON.stringify(done))
  } catch {
    /* progress just will not be remembered */
  }
}

function CodeEntry() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const submit = (event) => {
    event.preventDefault()
    const seat = findSeat(value)
    if (!seat) {
      setError('That code was not recognised. Check the message you were sent.')
      return
    }
    navigate(`/t/${seat.code}`)
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-deep">Enter your test code</h1>
      <p className="mt-2 text-sm text-deep/70">
        You received a personal code in your message. It takes you straight to your tasks.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-3">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError('') }}
          placeholder="For example T1-RENT-XXXX"
          autoCapitalize="characters"
          autoComplete="off"
          className="w-full rounded-lg border border-deep/20 bg-white px-3 py-3 text-base"
        />
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-deep text-white py-3 font-medium">
          Open my tasks
        </button>
      </form>
    </div>
  )
}

export default function TestSeatPage() {
  const { code } = useParams()
  const seat = findSeat(code)
  const [done, setDone] = useState([])

  useEffect(() => {
    if (seat) setDone(loadDone(seat.code))
  }, [seat])

  if (!code) return <CodeEntry />

  if (!seat) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <h1 className="text-xl font-semibold text-deep">Code not recognised</h1>
        <p className="mt-2 text-sm text-deep/70">Check the code in your message, or ask the person who invited you.</p>
        <Link to="/t" className="mt-4 inline-block underline text-deep">Enter a code</Link>
      </div>
    )
  }

  const phase = PHASES[seat.phase]
  const toggle = (index) => {
    const next = done.includes(index) ? done.filter((i) => i !== index) : [...done, index]
    setDone(next)
    saveDone(seat.code, next)
    saveProgress(seat, next).catch(() => { /* the owner just will not see live progress */ })
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-deep/60">
        {phase.label} · Seat {seat.seat} · {seat.door}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-deep">{seat.title}</h1>

      <div className="mt-4 rounded-xl border border-deep/15 bg-white p-4 space-y-2 text-sm text-deep/80">
        <p><strong>You are:</strong> {seat.signUpAs}.</p>
        <p><strong>When to start:</strong> {seat.startWhen}</p>
        <p><strong>Works with:</strong> {seat.pairWith}.</p>
        <p><strong>Time:</strong> about {seat.minutes} minutes.</p>
        <p className="text-deep/60">{phase.blurb}</p>
      </div>

      <div className="mt-4 rounded-xl bg-[#FEF3C7] border border-[#F59E0B]/40 p-4 text-sm text-deep">
        This is a test system. Use only the sandbox test payment details you are given. Never use a real card, real bank
        login or a real identity document.
      </div>

      <h2 className="mt-8 text-lg font-semibold text-deep">Your tasks</h2>
      <p className="text-sm text-deep/70">
        Do them in order. Tick each one when it worked as described. If it did not, note what happened and keep going.
      </p>

      <ol className="mt-4 space-y-3">
        {seat.steps.map((step, index) => {
          const isDone = done.includes(index)
          return (
            <li key={index} className={`rounded-xl border p-4 ${isDone ? 'border-green-600/40 bg-green-50' : 'border-deep/15 bg-white'}`}>
              <label className="flex gap-3 items-start cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDone}
                  onChange={() => toggle(index)}
                  className="mt-1 h-5 w-5 shrink-0"
                />
                <span className="text-sm text-deep">
                  <span className="font-semibold">{index + 1}. {step.do}</span>
                  <span className="block mt-1 text-deep/70"><strong>You should see:</strong> {step.expect}</span>
                </span>
              </label>
              {step.to && (
                <Link to={step.to} className="mt-3 ml-8 inline-block rounded-lg border border-deep/25 px-3 py-1.5 text-sm text-deep">
                  Open {step.to.split('?')[0]}
                </Link>
              )}
            </li>
          )
        })}
      </ol>

      <p className="mt-4 text-sm text-deep/70">
        Done: {done.filter((i) => i < seat.steps.length).length} of {seat.steps.length}
      </p>

      <div className="mt-8 rounded-xl border border-deep/15 bg-white p-4 text-sm text-deep/80 space-y-2">
        <h2 className="text-base font-semibold text-deep">How to report a problem</h2>
        <p>
          For each problem write: your seat ({seat.seat}), the page link, what you tried, what happened, what you expected,
          a screenshot, your phone or browser, and the time.
        </p>
        <p>
          <strong>Money wrong, or you can see someone else's private data?</strong> Stop and message the owner straight away.
        </p>
        {testReportUrl && (
          <a href={testReportUrl} target="_blank" rel="noreferrer" className="inline-block underline text-deep">
            Open the report sheet
          </a>
        )}
      </div>

      <TestReportForm seat={seat} />
    </div>
  )
}
