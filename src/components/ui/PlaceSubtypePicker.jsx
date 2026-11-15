import useCategoryTree from '@/hooks/useCategoryTree'
import { subtypeChoices } from '@/lib/placeCategories'

// "What kind of place is it?" Shown on the listing forms once the listing type is known.
// Picking one files the listing under that Place subcategory. Leaving it alone is fine: the
// database files it under the sensible default for the listing type.
// value is a category id (number) or null; onChange receives a category id or null.
export default function PlaceSubtypePicker({ category, propertyType, value, onChange, label = 'What kind of place is it?' }) {
  const { tree } = useCategoryTree()
  const choices = subtypeChoices(tree, { category, propertyType })
  if (choices.length < 2) return null

  return (
    <div>
      <p className="mb-2 text-sm font-bold">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {choices.map((c, i) => {
          const selected = value ? value === c.id : i === 0
          return (
            <button key={c.id} type="button" role="radio" aria-checked={selected}
              onClick={() => onChange(c.id)}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${selected ? 'border-terracotta bg-orange-pale text-terracotta-dark' : 'border-line bg-white text-deep hover:border-deep/30'}`}>
              {c.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
