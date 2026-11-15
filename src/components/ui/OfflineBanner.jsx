import React, { useEffect, useState } from 'react'

// Tells people when the connection drops, and that nothing they typed is lost.
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  if (online) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-3 z-[10000] w-[calc(100%-32px)] max-w-md -translate-x-1/2 rounded-[22px_22px_22px_6px] border border-white/40 bg-forest-dark/85 px-4 py-3 text-center text-[13px] font-semibold text-white shadow-lg backdrop-blur-xl"
    >
      You are offline. What you have filled in is saved on this device, so you will not lose it.
    </div>
  )
}
