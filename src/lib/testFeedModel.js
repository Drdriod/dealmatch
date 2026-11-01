// Pure helpers for the tester report form and the owner's live feed.
// No database or browser access here, so they can be unit tested.

export const OUTCOMES = [
  { value: 'passed', label: 'All steps passed' },
  { value: 'problems', label: 'Most steps passed, with problems' },
  { value: 'stuck', label: 'I got stuck and could not finish' },
  { value: 'not_started', label: 'I could not start' },
]

export const SEVERITIES = [
  { value: 'none', label: 'No problem' },
  { value: 'S3', label: 'S3: wrong text or layout' },
  { value: 'S2', label: 'S2: a step cannot be finished' },
  { value: 'S1', label: 'S1: money wrong, or I can see someone else\'s private data' },
]

const trim = (value, max) => String(value ?? '').trim().slice(0, max)

// Returns { ok, error, row } where row is ready to insert into test_reports.
export function buildReport(seat, form, device = '') {
  const name = trim(form.name, 80)
  if (!name) return { ok: false, error: 'Please write your name.' }
  if (!OUTCOMES.some((o) => o.value === form.outcome)) return { ok: false, error: 'Please choose how it went.' }
  const severity = SEVERITIES.some((s) => s.value === form.severity) ? form.severity : 'none'
  const needsDetail = form.outcome !== 'passed' || severity !== 'none'
  const happened = trim(form.happened, 2000)
  if (needsDetail && !happened) return { ok: false, error: 'Please write what happened.' }
  return {
    ok: true,
    row: {
      seat_code: seat.code,
      seat: `${seat.seat} ${seat.title}`.slice(0, 40),
      tester_name: name,
      outcome: form.outcome,
      severity,
      step_no: trim(form.step, 20) || null,
      page_url: trim(form.pageUrl, 500) || null,
      tried: trim(form.tried, 2000) || null,
      happened: happened || null,
      expected: trim(form.expected, 2000) || null,
      device: trim(form.device || device, 200) || null,
      screenshot_url: trim(form.screenshotUrl, 500) || null,
    },
  }
}

const SEVERITY_RANK = { S1: 3, S2: 2, S3: 1, none: 0 }

// One row per seat for the owner's board: progress, number of reports, worst severity, last activity.
export function summariseSeats(seats, progress = [], reports = []) {
  return seats.map((seat) => {
    const prog = progress.find((p) => p.seat_code === seat.code)
    const mine = reports.filter((r) => r.seat_code === seat.code)
    const worst = mine.reduce((acc, r) => (SEVERITY_RANK[r.severity] > SEVERITY_RANK[acc] ? r.severity : acc), 'none')
    const lastTimes = [prog?.updated_at, ...mine.map((r) => r.created_at)].filter(Boolean).sort()
    const total = prog?.total ?? seat.steps.length
    const done = prog ? prog.done.filter((i) => i < total).length : 0
    let state = 'not started'
    if (mine.some((r) => r.outcome === 'passed') && done >= total) state = 'finished'
    else if (mine.length || done > 0) state = 'in progress'
    return {
      code: seat.code,
      seat: seat.seat,
      title: seat.title,
      phase: seat.phase,
      done,
      total,
      reports: mine.length,
      worst,
      state,
      lastActivity: lastTimes.length ? lastTimes[lastTimes.length - 1] : null,
    }
  })
}

export const filterReports = (reports, { seat = 'all', severity = 'all' } = {}) =>
  reports.filter((r) => (seat === 'all' || r.seat_code === seat) && (severity === 'all' || r.severity === severity))
