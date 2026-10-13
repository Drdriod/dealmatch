// ============================================================================
// ChartKit: the chart primitives every dashboard in the app builds from.
//
// Design language follows bklit's documented chart tokens (background,
// foreground, grid, crosshair, indicator, and a sequential scale), mapped onto
// DealMatch's own palette so charts sit inside the existing dark and cream
// surfaces. Everything is plain SVG and sized from its container, so there are
// no third-party chart dependencies to install or keep in sync.
// ============================================================================
import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'

// ── Tokens ──────────────────────────────────────────────────────────────────
export const CHART = {
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.38)',
  crosshair: 'rgba(212,168,83,0.55)',
  indicator: '#D4A853',
  surface: '#17211B',
  text: '#FFFAF5',
  palette: ['#7A9E7E', '#D4A853', '#C85F2D', '#F3C96A', '#4A7A4E', '#F0D4BE'],
}

export const fmtNum = (n) => {
  const v = Number(n) || 0
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}B`
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return `${Math.round(v)}`
}
export const fmtNaira = (n) => `₦${Math.round(Number(n) || 0).toLocaleString('en-NG')}`

// Measures the element's width so SVG text stays at true size.
function useWidth(ref) {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    setW(ref.current.clientWidth)
    return () => ro.disconnect()
  }, [ref])
  return w
}

// ── Sparkline ───────────────────────────────────────────────────────────────
export function Sparkline({ values = [], color = CHART.palette[0], height = 36 }) {
  const ref = useRef(null)
  const w = useWidth(ref)
  const path = useMemo(() => {
    if (values.length < 2 || !w) return null
    const max = Math.max(...values, 1), min = Math.min(...values, 0)
    const span = max - min || 1
    const pts = values.map((v, i) => [
      (i / (values.length - 1)) * w,
      height - 4 - ((v - min) / span) * (height - 8),
    ])
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
    return { line, area: `${line} L${w},${height} L0,${height} Z` }
  }, [values, w, height])
  const id = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, [])
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {path && (
        <svg width={w} height={height} className="block">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={path.area} fill={`url(#${id})`} />
          <path d={path.line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}

// ── Area / line chart with crosshair tooltip ────────────────────────────────
// data: [{ label, [seriesKey]: number }]; series: [{ key, label, color }]
export function AreaChart({ data = [], series = [], height = 240, format = fmtNum, stacked = false }) {
  const ref = useRef(null)
  const w = useWidth(ref)
  const [hover, setHover] = useState(null)
  const pad = { t: 12, r: 12, b: 28, l: 44 }
  const innerW = Math.max(w - pad.l - pad.r, 1)
  const innerH = height - pad.t - pad.b

  const totals = useMemo(() => data.map((d) => (
    stacked ? series.reduce((s, se) => s + (Number(d[se.key]) || 0), 0) : Math.max(...series.map((se) => Number(d[se.key]) || 0), 0)
  )), [data, series, stacked])
  const yMax = Math.max(...totals, 1)
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax)
  const x = (i) => pad.l + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const y = (v) => pad.t + innerH - (v / yMax) * innerH

  const paths = useMemo(() => {
    if (!w || data.length < 2) return []
    return series.map((se, si) => {
      let base = new Array(data.length).fill(0)
      if (stacked) for (let k = 0; k < si; k++) base = base.map((b, i) => b + (Number(data[i][series[k].key]) || 0))
      const top = data.map((d, i) => [x(i), y(base[i] + (Number(d[se.key]) || 0))])
      const bottom = data.map((_, i) => [x(i), y(base[i])]).reverse()
      const line = top.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
      const area = `${line} ${bottom.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} Z`
      return { key: se.key, line, area, color: se.color || CHART.palette[si % CHART.palette.length] }
    })
  }, [w, data, series, stacked, yMax]) // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (e) => {
    if (!data.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left - pad.l
    const i = Math.round((px / innerW) * (data.length - 1))
    setHover(Math.min(Math.max(i, 0), data.length - 1))
  }
  const labelEvery = Math.ceil(data.length / Math.max(Math.floor(innerW / 64), 1))

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {w > 0 && data.length > 0 && (
        <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => onMove(e.touches[0])} onTouchEnd={() => setHover(null)}>
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={CHART.grid} strokeDasharray={i === 0 ? '0' : '3 4'} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill={CHART.axis}>{format(t)}</text>
            </g>
          ))}
          {data.map((d, i) => i % labelEvery === 0 && (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="10" fill={CHART.axis}>{d.label}</text>
          ))}
          {paths.map((p) => (
            <g key={p.key}>
              <path d={p.area} fill={p.color} fillOpacity={stacked ? 0.55 : 0.14} />
              <path d={p.line} fill="none" stroke={p.color} strokeWidth="2" strokeLinejoin="round" />
            </g>
          ))}
          {hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} stroke={CHART.crosshair} strokeWidth="1" />
              {series.map((se, si) => {
                const v = Number(data[hover][se.key]) || 0
                const base = stacked ? series.slice(0, si).reduce((s, q) => s + (Number(data[hover][q.key]) || 0), 0) : 0
                return <circle key={se.key} cx={x(hover)} cy={y(base + v)} r="4" fill={CHART.surface} stroke={se.color || CHART.palette[si]} strokeWidth="2" />
              })}
            </g>
          )}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-2 rounded-xl px-3 py-2 text-[11px]"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), Math.max(w - 150, 0)), background: 'rgba(23,33,27,0.96)', border: '1px solid rgba(255,255,255,0.1)', color: CHART.text, minWidth: 140 }}>
          <p className="font-semibold mb-1">{data[hover].label}</p>
          {series.map((se, si) => (
            <p key={se.key} className="flex justify-between gap-3">
              <span style={{ color: se.color || CHART.palette[si] }}>{se.label}</span>
              <span>{format(Number(data[hover][se.key]) || 0)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Grouped / stacked bars ──────────────────────────────────────────────────
export function BarChart({ data = [], series = [], height = 220, format = fmtNum, stacked = false }) {
  const ref = useRef(null)
  const w = useWidth(ref)
  const [hover, setHover] = useState(null)
  const pad = { t: 12, r: 8, b: 28, l: 40 }
  const innerW = Math.max(w - pad.l - pad.r, 1)
  const innerH = height - pad.t - pad.b
  const totals = data.map((d) => (stacked ? series.reduce((s, se) => s + (Number(d[se.key]) || 0), 0) : Math.max(...series.map((se) => Number(d[se.key]) || 0), 0)))
  const yMax = Math.max(...totals, 1)
  const band = innerW / Math.max(data.length, 1)
  const barW = Math.max(Math.min(band * 0.6, 28), 4)
  const y = (v) => pad.t + innerH - (v / yMax) * innerH

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && (
        <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((t, i) => (
            <g key={i}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t * yMax)} y2={y(t * yMax)} stroke={CHART.grid} strokeDasharray={i ? '3 4' : '0'} />
              <text x={pad.l - 6} y={y(t * yMax) + 4} textAnchor="end" fontSize="10" fill={CHART.axis}>{format(t * yMax)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2
            let acc = 0
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={innerH} fill="transparent" />
                {series.map((se, si) => {
                  const v = Number(d[se.key]) || 0
                  const base = stacked ? acc : 0
                  acc += v
                  const top = y(base + v), bottom = y(base)
                  const color = se.color || CHART.palette[si % CHART.palette.length]
                  if (stacked) return <rect key={se.key} x={cx - barW / 2} y={top} width={barW} height={Math.max(bottom - top, 0)} rx={si === series.length - 1 ? 6 : 0} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
                  const sw = barW / series.length
                  return <rect key={se.key} x={cx - barW / 2 + si * sw} y={top} width={Math.max(sw - 2, 2)} height={Math.max(bottom - top, 0)} rx="4" fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />
                })}
                <text x={cx} y={height - 8} textAnchor="middle" fontSize="10" fill={CHART.axis}>{d.label}</text>
              </g>
            )
          })}
        </svg>
      )}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-1 right-1 rounded-xl px-3 py-2 text-[11px]" style={{ background: 'rgba(23,33,27,0.96)', border: '1px solid rgba(255,255,255,0.1)', color: CHART.text }}>
          <p className="font-semibold mb-1">{data[hover].label}</p>
          {series.map((se, si) => <p key={se.key} style={{ color: se.color || CHART.palette[si] }}>{se.label}: {format(Number(data[hover][se.key]) || 0)}</p>)}
        </div>
      )}
    </div>
  )
}

// ── Donut ───────────────────────────────────────────────────────────────────
export function Donut({ slices = [], size = 160, thickness = 22, center, centerSub }) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1
  const r = size / 2 - thickness / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.grid} strokeWidth={thickness} />
        {slices.map((s, i) => {
          const len = (Number(s.value) || 0) / total * c
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color || CHART.palette[i % CHART.palette.length]}
              strokeWidth={thickness} strokeDasharray={`${Math.max(len - 2, 0)} ${c}`} strokeDashoffset={-offset} strokeLinecap="butt" />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {center && <p className="text-xl font-bold text-white leading-none">{center}</p>}
        {centerSub && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{centerSub}</p>}
      </div>
    </div>
  )
}

// ── Radial progress ring ────────────────────────────────────────────────────
export function Radial({ value = 0, max = 100, size = 120, color = CHART.palette[0], label, sub }) {
  const pct = Math.min(Math.max(value / (max || 1), 0), 1)
  const t = 10, r = size / 2 - t / 2, c = 2 * Math.PI * r
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={CHART.grid} strokeWidth={t} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={t} strokeLinecap="round"
          strokeDasharray={`${pct * c} ${c}`} style={{ transition: 'stroke-dasharray 700ms ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-lg font-bold text-white leading-none">{label ?? `${Math.round(pct * 100)}%`}</p>
        {sub && <p className="text-[10px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{sub}</p>}
      </div>
    </div>
  )
}

// ── Ranked horizontal bars (leaderboards, breakdowns) ───────────────────────
export function HBars({ items = [], format = fmtNum }) {
  const max = Math.max(...items.map((i) => Number(i.value) || 0), 1)
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={it.label}>
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-white truncate pr-3">{it.label}</span>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{format(it.value)}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: CHART.grid }}>
            <div className="h-full rounded-full" style={{ width: `${((Number(it.value) || 0) / max) * 100}%`, background: it.color || CHART.palette[i % CHART.palette.length], transition: 'width 600ms ease' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Funnel (pipeline stages) ────────────────────────────────────────────────
export function Funnel({ stages = [] }) {
  const max = Math.max(...stages.map((s) => Number(s.value) || 0), 1)
  return (
    <div className="space-y-2">
      {stages.map((s, i) => {
        const pct = (Number(s.value) || 0) / max
        return (
          <div key={s.label} className="relative h-11 rounded-xl overflow-hidden flex items-center justify-between px-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <div className="absolute inset-y-0 left-0 rounded-xl" style={{ width: `${Math.max(pct * 100, 6)}%`, background: CHART.palette[i % CHART.palette.length], opacity: 0.22 }} />
            <span className="relative text-xs text-white">{s.label}</span>
            <span className="relative text-xs font-bold text-white">{fmtNum(s.value)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── KPI tile ────────────────────────────────────────────────────────────────
export function KpiTile({ label, value, delta, deltaLabel, spark, color = CHART.palette[0], icon: Icon }) {
  const up = Number(delta) >= 0
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</p>
        {Icon && <Icon size={15} style={{ color }} />}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        {delta !== undefined && delta !== null && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: up ? 'rgba(122,158,126,0.15)' : 'rgba(200,95,45,0.15)', color: up ? '#7A9E7E' : '#C85F2D' }}>
            {up ? '+' : ''}{delta}%{deltaLabel ? ` ${deltaLabel}` : ''}
          </span>
        )}
      </div>
      {spark && <Sparkline values={spark} color={color} height={32} />}
    </div>
  )
}

// ── Panel shell used by every dashboard ─────────────────────────────────────
export function Panel({ title, sub, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl p-5 ${className}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-4">
          <div>
            {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
            {sub && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}
