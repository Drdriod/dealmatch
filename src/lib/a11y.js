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
