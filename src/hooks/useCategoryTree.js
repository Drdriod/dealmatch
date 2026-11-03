import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCategoryTree } from '@/modules/catalog/catalogService'

// One shared request for the whole session. Every consumer (navbar menus,
// category page, Places and People filters) reads the same cached tree instead of refetching it.
let cachedTree = null
let inflight = null

// Do not wait forever on a weak connection or a stuck request: after this long the menus show a
// retry message instead of a skeleton that never ends.
const LOAD_TIMEOUT_MS = 10000

function loadTree() {
  if (cachedTree) return Promise.resolve(cachedTree)
  if (!inflight) {
    inflight = Promise.race([
      getCategoryTree(supabase),
      new Promise((_, reject) => setTimeout(() => reject(new Error('categories_timeout')), LOAD_TIMEOUT_MS)),
    ])
      .then(tree => { cachedTree = tree; inflight = null; return tree })
      .catch(err => { inflight = null; throw err })
  }
  return inflight
}

/**
 * Active category tree: top-level categories with their children attached.
 * Returns { tree, error, retry }. tree is null while loading; error is set if it could not load.
 */
export default function useCategoryTree() {
  const [tree, setTree] = useState(cachedTree)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cachedTree) { setTree(cachedTree); return }
    let alive = true
    setError(null)
    loadTree()
      .then(t => { if (alive) setTree(t) })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [attempt])

  const retry = useCallback(() => { setTree(null); setError(null); setAttempt(a => a + 1) }, [])

  return { tree, error, retry }
}
