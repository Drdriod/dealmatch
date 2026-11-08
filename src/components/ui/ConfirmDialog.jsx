import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

// Replaces window.confirm with an accessible in-app dialog.
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Remove this offer?', message: 'This cannot be undone.', confirmLabel: 'Remove', danger: true }))) return
const ConfirmContext = createContext(null)

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null)
  const resolver = useRef(null)
  const cancelRef = useRef(null)
  const returnFocus = useRef(null)

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    returnFocus.current = document.activeElement
    resolver.current = resolve
    setState({
      title: options.title || 'Are you sure?',
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'Confirm',
      cancelLabel: options.cancelLabel || 'Cancel',
      danger: !!options.danger,
    })
  }), [])

  const close = useCallback((answer) => {
    resolver.current?.(answer)
    resolver.current = null
    setState(null)
    const el = returnFocus.current
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0)
  }, [])

  useEffect(() => {
    if (!state) return undefined
    cancelRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false) }
      if (e.key === 'Tab') {
        const nodes = document.querySelectorAll('[data-confirm-dialog] button')
        if (!nodes.length) return
        const first = nodes[0]; const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [state, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(23,33,27,0.55)' }}
          onClick={() => close(false)}
        >
          <div
            data-confirm-dialog
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-soft"
          >
            <h2 id="confirm-title" className="font-display text-xl text-deep">{state.title}</h2>
            {state.message && (
              <p id="confirm-message" className="mt-2 text-sm text-warm">{state.message}</p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => close(false)}
                className="flex-1 rounded-full border border-line px-4 py-3 text-sm font-semibold text-deep"
              >
                {state.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold text-white ${state.danger ? 'bg-terracotta-dark' : 'bg-terracotta'}`}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  // Outside the provider (for example in a test), fall back to the browser prompt so nothing breaks.
  return confirm || ((o = {}) => Promise.resolve(window.confirm(o.message || o.title || 'Are you sure?')))
}
