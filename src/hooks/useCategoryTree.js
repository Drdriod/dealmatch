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
    // Do not wait forever on a weak or blocked connection: give up after 10 seconds so pages can show
    // their retry message, and let the next visit try again.
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('categories timeout')), 10000))
    inflight = Promise.race([getCategoryTree(supabase), timeout])
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
