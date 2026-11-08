import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { linkLabels, titleFor, fixLowContrast } from '@/lib/a11y'

const DEFAULT_TITLE = typeof document !== 'undefined' ? document.title : 'DealMatch'

// Renders nothing. Two app-wide accessibility jobs:
//  1. Gives each page its own browser-tab / screen-reader title, taken from the page's <h1>.
//  2. Links form labels to their fields (see linkLabels), including fields rendered later.
//  3. Darkens pale gold and sage text where it sits on a light background (see fixLowContrast).
export default function A11yEffects() {
  const { pathname } = useLocation()

  useEffect(() => {
    const setTitle = () => {
      const h1 = document.querySelector('main h1, h1')
      document.title = titleFor(h1?.textContent) || DEFAULT_TITLE
    }
    // Pages load lazily, so read the heading shortly after navigation, and once more for slow loads.
    const t1 = setTimeout(setTitle, 350)
    const t2 = setTimeout(setTitle, 1500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [pathname])

  useEffect(() => {
    let frame = 0
    const run = () => { frame = 0; linkLabels(document); fixLowContrast(document) }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run) }
    run()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame) }
  }, [])

  return null
}
