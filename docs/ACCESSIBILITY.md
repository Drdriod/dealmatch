# Accessibility and design conventions

What the app does globally (so pages do not each have to):

- **Keyboard focus** is always visible (`src/index.css`, `:focus-visible`, 2px terracotta-dark ring; gold on dark areas).
- **Reduced motion**: CSS animations and transitions are switched off by the OS setting (`index.css`), and Motion animations by `<MotionConfig reducedMotion="user">` in `App.jsx`.
- **Page titles**: `A11yEffects` sets `document.title` from each page's `<h1>` ("My Offers | DealMatch").
- **Form labels**: `A11yEffects` links any `<label>` without `for` to the field that follows it. New forms should still prefer `htmlFor`/`id` or a wrapping label.
- **Confirmations**: use `useConfirm()` (`components/ui/ConfirmDialog.jsx`), never `window.confirm`.
- **Colour**: brand terracotta is `#B8511E` (white text 4.96:1, and 4.52:1 as text on cream). Text on dark uses at least `rgba(255,255,255,0.5)`.
- Clickable non-button elements must have `role="button"`, `tabIndex={0}` and Enter/Space handling.

- **Pale gold and sage text**: `fixLowContrast` (in `A11yEffects`) darkens gold/sage text only where the real background is light, and leaves it alone on dark screens. For new work, still prefer dark text colours on light backgrounds.
- **Form field errors**: the shared sign-up `Field` sets `aria-invalid`, `aria-required`, `aria-describedby` and announces errors with `role="alert"`. Other screens report errors with toasts, which screen readers already announce.
- **Colours in code**: `index.css` defines `--dm-*` CSS variables for the brand palette. `src/lib/colorBudget.test.mjs` stops hard-coded hex colours in `.jsx` files from growing (about 2,978 today). Migrate page by page to Tailwind tokens or `var(--dm-*)`, comparing before and after screenshots, then lower the baseline in that test.
- **Dark mode**: not offered. `ThemeContext` and some `.dark` rules exist, but no toggle is shown anywhere, and most screens use fixed light colours, so enabling it would look broken. Treat it as a future feature, not a bug.

Known gaps: about 150 labels use text of 11px or smaller; most inline styles still bypass the tokens (see above).
