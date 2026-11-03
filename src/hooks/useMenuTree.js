import useCategoryTree from '@/hooks/useCategoryTree'
import { TAXONOMY_FALLBACK } from '@/data/taxonomyFallback'

// The tree the navbar menus show: the live database tree once it has loaded, the bundled copy until
// then (and if the request fails or is blocked). Menus only need names, slugs and grouping, so they
// are never empty. Anything that needs category ids (forms, filters) uses useCategoryTree instead.
export default function useMenuTree() {
  const { tree } = useCategoryTree()
  return { tree: tree || TAXONOMY_FALLBACK, error: null, live: !!tree }
}
