// Small accessibility helpers used by <A11yEffects/> (src/components/ui/A11yEffects.jsx).

const SITE = 'DealMatch'

// "Create an Offer" -> "Create an Offer | DealMatch". Empty text keeps the default site title.
export function titleFor(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean || clean.toLowerCase() === SITE.toLowerCase()) return null
  return `${clean.slice(0, 70)} | ${SITE}`
}

let counter = 0

// Links every <label> that has no `for` and does not wrap its control to the next form control
// that follows it (a sibling, or inside a following sibling), so screen readers announce the
// label and tapping the label focuses the field. Safe to run repeatedly.
export function linkLabels(root = document) {
  const labels = root.querySelectorAll('label:not([for])')
  labels.forEach((label) => {
    if (label.querySelector('input, select, textarea')) return
    let el = label.nextElementSibling
    while (el && el.tagName !== 'LABEL') {
      const control = el.matches('input, select, textarea')
        ? el
        : el.querySelector('input:not([type="hidden"]), select, textarea')
      if (control && control.type !== 'hidden') {
        if (!control.id) control.id = `dm-field-${++counter}`
        label.setAttribute('for', control.id)
        return
      }
      el = el.nextElementSibling
    }
  })
}

// ─── Contrast guard ──────────────────────────────────────────────────────────
// Gold (#D4A853) and sage (#7A9E7E) are fine on dark screens but too pale as text on light ones
// (about 2:1 and 2.7:1). fixLowContrast() darkens that text only when the real background behind it
// makes it unreadable, so dark screens keep the original colours.

export function parseRgb(value) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/.exec(value || '')
  if (!m) return null
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] }
}

export function relLuminance({ r, g, b }) {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastRatio(a, b) {
  const la = relLuminance(a); const lb = relLuminance(b)
  const hi = Math.max(la, lb); const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

// Returns a darker (or lighter, on dark backgrounds) version of fg that reaches `min` contrast on bg,
// or null when fg already passes.
export function readableOn(fg, bg, min = 4.5) {
  if (contrastRatio(fg, bg) >= min) return null
  const toward = relLuminance(bg) > 0.5 ? 0 : 255
  for (let step = 1; step <= 20; step++) {
    const t = step / 20
    const c = {
      r: Math.round(fg.r + (toward - fg.r) * t),
      g: Math.round(fg.g + (toward - fg.g) * t),
      b: Math.round(fg.b + (toward - fg.b) * t),
    }
    if (contrastRatio(c, bg) >= min) return c
  }
  return { r: toward, g: toward, b: toward }
}

const BRAND_PALE = [{ r: 212, g: 168, b: 83 }, { r: 122, g: 158, b: 126 }]
const isBrandPale = (c) => BRAND_PALE.some((p) => p.r === c.r && p.g === c.g && p.b === c.b)

function effectiveBackground(el) {
  // Composite semi-transparent layers from the element upwards until one is opaque.
  const layers = []
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return null // gradients and photos: leave alone
    const c = parseRgb(cs.backgroundColor)
    if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break }
  }
  let base = { r: 247, g: 244, b: 237 } // page cream
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]
    base = { r: l.r * l.a + base.r * (1 - l.a), g: l.g * l.a + base.g * (1 - l.a), b: l.b * l.a + base.b * (1 - l.a) }
  }
  return base
}

const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())

export function fixLowContrast(root = document) {
  const nodes = root.querySelectorAll('[style*="212, 168, 83"], [style*="122, 158, 126"], .text-gold, .text-sage')
  nodes.forEach((el) => {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml' || !hasOwnText(el)) return
    const fg = parseRgb(getComputedStyle(el).color)
    if (!fg || !isBrandPale(fg)) return
    const bg = effectiveBackground(el)
    if (!bg) return
    const better = readableOn(fg, bg)
    if (better) el.style.setProperty('color', `rgb(${better.r}, ${better.g}, ${better.b})`, 'important')
  })
}
