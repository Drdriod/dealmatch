// Server events only. The timeline never invents a step.
export default function Timeline({ items, emptyText = 'No updates yet.' }) {
  if (!items.length) return <p className="text-sm text-warm">{emptyText}</p>
  return (
    <ol className="relative ml-2 space-y-5 border-l-2 border-line">
      {items.map((it, i) => (
        <li key={it.id} className="relative pl-5">
          <span
            aria-hidden="true"
            className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${
              i === items.length - 1 ? 'bg-terracotta' : 'bg-gold'
            }`}
          />
          <p className="text-sm font-semibold">{it.title}</p>
          {it.note ? <p className="mt-0.5 whitespace-pre-line text-sm text-warm">{it.note}</p> : null}
          <time dateTime={it.at} className="mt-0.5 block text-xs text-warm">
            {new Date(it.at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}
            {it.by ? ` by ${it.by}` : ''}
          </time>
        </li>
      ))}
    </ol>
  )
}
