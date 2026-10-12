import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCategoryTree } from '@/modules/catalog/catalogService'

// One shared request for the whole session. Every consumer (navbar menus,
// category page) reads the same cached tree instead of refetching it.
let cachedTree = null
let inflight = null

function loadTree() {
  if (cachedTree) return Promise.resolve(cachedTree)
  if (!inflight) {
    inflight = getCategoryTree(supabase)
      .then(tree => { cachedTree = tree; return tree })
      .catch(err => { inflight = null; throw err })
  }
  return inflight
}

/**
 * Active category tree: top-level categories with their children attached.
 * Returns { tree, error }. tree is null while loading.
 */
export default function useCategoryTree() {
  const [tree, setTree] = useState(cachedTree)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (cachedTree) return
    let alive = true
    loadTree()
      .then(t => { if (alive) setTree(t) })
      .catch(e => { if (alive) setError(e) })
    return () => { alive = false }
  }, [])

  return { tree, error }
}
