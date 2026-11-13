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
      <label className="text-xs font-bold uppercase tracking-wider mb-3 block" style={{ color: 'rgba(23,33,27,0.7)' }}>{label}</label>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {choices.map((c, i) => {
          const selected = value ? value === c.id : i === 0
          return (
            <button key={c.id} type="button" role="radio" aria-checked={selected}
              onClick={() => onChange(c.id)}
              className="px-3.5 py-2 rounded-full text-xs font-semibold border-2 transition-all"
              style={{
                borderColor: selected ? '#B8511E' : '#DEDDD6',
                color: selected ? '#B8511E' : '#5C665F',
                backgroundColor: selected ? 'rgba(200,95,45,0.05)' : '#FFFFFF',
              }}>
              {c.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
