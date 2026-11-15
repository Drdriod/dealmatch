import { useCallback, useEffect, useRef, useState } from 'react'
import { draftKey, readDraft, writeDraft, removeDraft, sanitizeDraft, DRAFT_TTL_MS } from '@/lib/formDraft'

/**
 * Keeps a form's state safe on this device.
 *
 *   const draft = useFormDraft('list-property', { step, form }, ({ step, form }) => { setStep(step); setForm(form) }, { userId: user?.id })
 *   ...on successful submit:  draft.clear()
 *   ...to show a notice:      draft.restored ? <DraftNotice draft={draft} onDiscard={...} /> : null
 *
 * `value` is saved shortly after every change. An untouched form saves nothing.
 * `onRestore` is called once, on load, with the saved value.
 */
export function useFormDraft(name, value, onRestore, { userId, enabled = true, omit = [], ttlMs = DRAFT_TTL_MS } = {}) {
  const key = draftKey(name, userId)
  const [restored, setRestored] = useState(false)
  const [hydratedKey, setHydratedKey] = useState(null)
  const startJson = useRef(null)
  const latest = useRef(value)
  const stopped = useRef(false)
  const restoreRef = useRef(onRestore)
  restoreRef.current = onRestore
  latest.current = value
  if (startJson.current === null) startJson.current = JSON.stringify(sanitizeDraft(value, omit))

  // Restore once per key (the key changes when the user id arrives).
  useEffect(() => {
    if (!enabled) return
    stopped.current = false
    const saved = readDraft(key, ttlMs)
    if (saved?.data) {
      try { restoreRef.current?.(saved.data); setRestored(true) } catch { /* a bad draft is ignored */ }
    }
    setHydratedKey(key)
  }, [key, enabled, ttlMs])

  // Save shortly after each change, once restoring has finished.
  const json = JSON.stringify(sanitizeDraft(value, omit))
  useEffect(() => {
    if (!enabled || hydratedKey !== key || stopped.current) return undefined
    const t = setTimeout(() => {
      if (json === startJson.current) removeDraft(key)
      else writeDraft(key, JSON.parse(json))
    }, 400)
    return () => clearTimeout(t)
  }, [json, key, enabled, hydratedKey])

  // Save straight away when the tab is hidden or closed.
  useEffect(() => {
    if (!enabled) return undefined
    const flush = () => {
      if (stopped.current || hydratedKey !== key) return
      const j = JSON.stringify(sanitizeDraft(latest.current, omit))
      if (j !== startJson.current) writeDraft(key, JSON.parse(j))
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [key, enabled, hydratedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Forget the draft (after a successful submit, or "start over").
  const clear = useCallback(() => {
    stopped.current = true
    removeDraft(key)
    setRestored(false)
  }, [key])

  return { restored, clear, dismiss: () => setRestored(false) }
}
