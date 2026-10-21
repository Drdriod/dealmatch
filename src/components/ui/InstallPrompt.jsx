import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Home, X } from 'lucide-react'

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [show, setShow]                     = useState(false)

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      const dismissed = localStorage.getItem('dm-pwa-dismissed')
      if (!dismissed) setTimeout(() => setShow(true), 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  const handleDismiss = () => {
    setShow(false)
    localStorage.setItem('dm-pwa-dismissed', '1')
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 80 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 80 }}
          className="fixed bottom-20 left-4 right-4 z-50 max-w-sm mx-auto"
        >
          <div className="rounded-2xl p-4 flex items-center gap-4 shadow-2xl"
            style={{ backgroundColor: '#17211B', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: 'rgba(200,95,45,0.2)' }}>
              <Home size={24} className="text-terracotta" />
            </div>
            <div className="flex-1">
              <p className="font-display font-black text-sm text-white">Add to Home Screen</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Get quick access to DealMatch
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <button onClick={handleInstall}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ backgroundColor: '#C85F2D', color: '#FFFFFF' }}>
                Install
              </button>
              <button onClick={handleDismiss}
                className="flex items-center justify-center w-full py-1"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                <X size={12} />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
