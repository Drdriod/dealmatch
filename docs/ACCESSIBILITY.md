# Accessibility and design conventions

What the app does globally (so pages do not each have to):

- **Keyboard focus** is always visible (`src/index.css`, `:focus-visible`, 2px terracotta-dark ring; gold on dark areas).
- **Reduced motion**: CSS animations and transitions are switched off by the OS setting (`index.css`), and Motion animations by `<MotionConfig reducedMotion="user">` in `App.jsx`.
- **Page titles**: `A11yEffects` sets `document.title` from each page's `<h1>` ("My Offers | DealMatch").
- **Form labels**: `A11yEffects` links any `<label>` without `for` to the field that follows it. New forms should still prefer `htmlFor`/`id` or a wrapping label.
- **Confirmations**: use `useConfirm()` (`components/ui/ConfirmDialog.jsx`), never `window.confirm`.
- **Colour**: brand terracotta is `#B8511E` (white text 4.96:1, and 4.52:1 as text on cream). Text on dark uses at least `rgba(255,255,255,0.5)`.
- Clickable non-button elements must have `role="button"`, `tabIndex={0}` and Enter/Space handling.

Known gaps (not yet fixed): gold (`#D4A853`) and sage (`#7A9E7E`) text on cream fails AA (use them for icons and decoration only, or on dark); about 2,700 inline styles and hard-coded hex values bypass the Tailwind tokens; no per-field `aria-invalid` on form errors; about 150 labels use text of 11px or smaller; dark mode is not supported.
