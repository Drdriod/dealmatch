// Shared class names for the trust, transaction and dispute screens. They are built from the
// brand tokens in tailwind.config.js and the .btn-primary, .btn-secondary and .input classes in
// index.css, so these screens look like the rest of the app. Do not add colours here.
const focus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

export const btnPrimary = `btn-primary text-sm px-5 py-2.5 inline-flex items-center justify-center gap-2 ${focus}`
export const btnSecondary = `btn-secondary text-sm px-5 py-2.5 inline-flex items-center justify-center gap-2 ${focus}`
export const card = 'rounded-2xl border border-line bg-white p-5'
export const inputCls = `input !py-3 !px-4 text-sm ${focus}`
export const linkCls = `rounded font-semibold text-terracotta underline underline-offset-2 hover:text-terracotta-dark ${focus}`
export const chipFocus = focus
