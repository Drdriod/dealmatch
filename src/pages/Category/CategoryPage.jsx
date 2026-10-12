import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'motion/react'
import { ChevronRight } from 'lucide-react'
import useCategoryTree from '@/hooks/useCategoryTree'
import { supabase } from '@/lib/supabase'
import PersonCard from '@/components/cards/PersonCard'
import Notice from '@/components/ui/Notice'
import { PILLARS, categoryHref, pillarOfRoot } from '@/lib/taxonomy'

const ease = [0.22, 1, 0.36, 1]

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease } },
}

// Locate a category in the active tree. Returns the category, its top-level
// root, and whether it is a child (parent set) or a root (parent null).
function findCategory(tree, slug) {
  if (!tree) return null
  for (const root of tree) {
    if (root.slug === slug) return { category: root, root, isRoot: true }
    const child = root.children?.find(c => c.slug === slug)
    if (child) return { category: child, root, isRoot: false }
  }
  return null
}

// People come only from verified providers (level 2 or higher), matching
// the PersonCard rule. Category is a text label on the provider record, so it
// is matched by the category name.
async function loadPeople(categoryName) {
  const { data: vp, error } = await supabase
    .from('verified_providers')
    .select('user_id, level, level_data')
    .gte('level', 2)
    .eq('level_data->>category', categoryName)
    .limit(24)
  if (error) throw error
  if (!vp?.length) return []

  const ids = vp.map(v => v.user_id)
  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, city, state')
    .in('id', ids)

  return vp.map(v => {
    const p = profiles?.find(x => x.id === v.user_id)
    return {
      id: v.user_id,
      name: p?.full_name || 'DealMatch provider',
      avatar: p?.avatar_url || null,
      area: v.level_data?.area || (p?.city ? `${p.city}, ${p.state}` : p?.state) || null,
      category: v.level_data?.category || null,
      trusted: v.level >= 3,
      openPrice: v.level_data?.open_price !== false,
      priceCents: v.level_data?.price_cents || null,
    }
  })
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="h-56 animate-pulse rounded-[19px] bg-[#EFE6D8]" />
      ))}
    </div>
  )
}

export default function CategoryPage() {
  const { slug } = useParams()
  const { tree, error: treeError } = useCategoryTree()
  const found = useMemo(() => findCategory(tree, slug), [tree, slug])
  const pillarSlug = found ? pillarOfRoot(found.root.slug) : null
  const pillar = PILLARS.find(p => p.slug === pillarSlug) || null
  const categoryId = found?.category.id
  const categoryName = found?.category.name

  const [people, setPeople] = useState(null)
  const [peopleError, setPeopleError] = useState(null)

  useEffect(() => {
    if (!categoryName || pillarSlug !== 'people') return
    let alive = true
    setPeople(null)
    setPeopleError(null)
    loadPeople(categoryName)
      .then(rows => { if (alive) setPeople(rows) })
      .catch(err => { if (alive) { setPeopleError(err); setPeople([]) } })
    return () => { alive = false }
  }, [categoryId, categoryName, pillarSlug])

  if (treeError) {
    return (
      <Page>
        <Notice variant="error" title="We couldn't load this category">
          Please refresh the page. If it keeps happening, try again shortly.
        </Notice>
      </Page>
    )
  }

  if (!tree) {
    return <Page><Skeleton /></Page>
  }

  if (!found) {
    return (
      <Page>
        <Notice variant="warning" title="This category isn't available"
          action={<Link to="/" className="text-sm font-semibold text-[#C85F2D] hover:text-[#A8441D]">Back to home →</Link>}>
          It may have been renamed or hidden. Try searching from the home page.
        </Notice>
      </Page>
    )
  }

  const { category, root, isRoot } = found

  return (
    <Page>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }}>
        <nav aria-label="Breadcrumb" className="mb-3 flex flex-wrap items-center gap-1 text-xs font-semibold text-[#647068]">
          {pillar && (
            <>
              <Link to={pillar.route} className="hover:text-[#C85F2D]">{pillar.name}</Link>
              <ChevronRight size={12} aria-hidden="true" />
            </>
          )}
          {!isRoot && (
            <>
              <Link to={categoryHref(root.slug)} className="hover:text-[#C85F2D]">{root.name}</Link>
              <ChevronRight size={12} aria-hidden="true" />
            </>
          )}
          <span aria-current="page" className="text-[#17211B]">{category.name}</span>
        </nav>

        <h1 className="font-display text-3xl sm:text-4xl" style={{ color: '#17211B' }}>{category.name}</h1>
      </motion.div>

      {isRoot && category.children?.length > 0 && (
        <motion.div variants={listVariants} initial="hidden" animate="show"
          className="mt-5 flex flex-wrap gap-2" aria-label="Groups in this category">
          {category.children.map(child => (
            <motion.div key={child.id} variants={itemVariants}>
              <Link to={categoryHref(child.slug)}
                className="inline-flex items-center rounded-full border border-[#DEDDD6] bg-[#FFFDF8] px-4 py-2 text-sm font-semibold text-[#17211B] transition-colors hover:border-[#C85F2D] hover:text-[#C85F2D]">
                <motion.span whileHover={{ x: 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
                  {child.name}
                </motion.span>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}

      <div className="mt-8">
        {!pillar && (
          <Notice variant="info" title="Not in Place or People yet">
            This category is not assigned to a section yet, so it has no listings page.
          </Notice>
        )}

        {pillarSlug === 'place' && (
          <Notice variant="info" title="Place listings are not linked to categories yet"
            action={<Link to="/places" className="text-sm font-semibold text-[#C85F2D] hover:text-[#A8441D]">Browse all places →</Link>}>
            Places are not yet grouped by category, so this page cannot list them. They will appear here once they are assigned.
          </Notice>
        )}

        {pillarSlug === 'people' && (
          <>
            {people === null ? (
              <Skeleton />
            ) : peopleError ? (
              <Notice variant="error" title="We couldn't load people in this group">
                Please refresh the page. If it keeps happening, try again shortly.
              </Notice>
            ) : people.length === 0 ? (
              <Notice variant="info" title="No verified providers in this group yet"
                action={<Link to="/providers" className="text-sm font-semibold text-[#C85F2D] hover:text-[#A8441D]">Browse all people →</Link>}>
                Providers appear here once they are identity and skill verified for this group.
              </Notice>
            ) : (
              <motion.div variants={listVariants} initial="hidden" animate="show"
                className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {people.map(person => (
                  <motion.div key={person.id} variants={itemVariants}>
                    <PersonCard person={person} />
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>
    </Page>
  )
}

function Page({ children }) {
  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-8 md:px-7 md:py-12" style={{ backgroundColor: '#F7F4ED', minHeight: '60vh' }}>
      {children}
    </main>
  )
}
