import React, { useEffect, useRef, useState } from 'react'
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

// Photo grid for the listing flows: add, remove, choose the main photo.
// `images` is a list of { url, file, is_primary, remoteUrl? }; `onChange` takes the next list
// (or a function from the current list to the next one). Previews are released when a photo is
// removed or the page closes. Storage accepts images only, up to 10 MB each.
const MAX_BYTES = 10 * 1024 * 1024

export default function PhotoPicker({ images, onChange, max = 12, invalid = false, upload }) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const latest = useRef(images)
  latest.current = images
  useEffect(() => () => latest.current.forEach((i) => i.url?.startsWith('blob:') && URL.revokeObjectURL(i.url)), [])

  const add = async (fileList) => {
    const picked = Array.from(fileList || [])
    const room = Math.max(max - images.length, 0)
    const ok = picked.filter((f) => {
      if (!f.type.startsWith('image/')) { toast.error(`${f.name} is not a photo.`); return false }
      if (f.size > MAX_BYTES) { toast.error(`${f.name} is over 10 MB.`); return false }
      return true
    })
    if (ok.length > room) toast(`You can add up to ${max} photos.`)
    const take = ok.slice(0, room)
    if (!take.length) return
    // With `upload`, each photo goes to storage straight away and the list holds its web address.
    if (upload) {
      setBusy(true)
      const done = []
      for (const file of take) {
        try { done.push(await upload(file)) } catch { toast.error(`We couldn't upload ${file.name}. Check your connection and try again.`) }
      }
      setBusy(false)
      if (done.length) onChange((list) => [...list, ...done.map((url, i) => ({ url, is_primary: list.length === 0 && i === 0 }))])
      return
    }
    onChange((list) => [
      ...list,
      ...take.map((file, i) => ({ url: URL.createObjectURL(file), file, is_primary: list.length === 0 && i === 0 })),
    ])
  }

  const remove = (idx) => onChange((list) => {
    const gone = list[idx]
    if (gone?.url?.startsWith('blob:')) URL.revokeObjectURL(gone.url)
    const rest = list.filter((_, j) => j !== idx)
    if (rest.length && !rest.some((i) => i.is_primary)) rest[0] = { ...rest[0], is_primary: true }
    return rest
  })

  const makeMain = (idx) => onChange((list) => list.map((x, j) => ({ ...x, is_primary: j === idx })))

  return (
    <>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {images.map((img, i) => (
          <div key={img.url} className={`relative aspect-square overflow-hidden rounded-2xl border-2 ${img.is_primary ? 'border-terracotta' : 'border-line'}`}>
            <img src={img.url} alt={`Photo ${i + 1}${img.is_primary ? ', main photo' : ''}`} className="h-full w-full object-cover" />
            <button type="button" onClick={() => remove(i)} aria-label={`Remove photo ${i + 1}`}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-deep/75 text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            {img.is_primary ? (
              <span className="absolute inset-x-0 bottom-0 bg-terracotta py-1 text-center text-[11px] font-bold text-white">Main photo</span>
            ) : (
              <button type="button" onClick={() => makeMain(i)}
                className="absolute inset-x-0 bottom-0 bg-deep/70 py-1 text-center text-[11px] font-bold text-white backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                Make main
              </button>
            )}
          </div>
        ))}
        {images.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${invalid ? 'border-terracotta bg-orange-pale text-terracotta-dark' : 'border-forest/40 bg-forest-pale text-forest hover:border-forest'}`}>
            <PhotoIcon className={`h-7 w-7 ${busy ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {busy ? 'Uploading…' : images.length ? 'Add more' : 'Add photos'}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { add(e.target.files); e.target.value = '' }} />
    </>
  )
}
