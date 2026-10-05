import React from 'react'
import { Home } from 'lucide-react'

/**
 * TEMP_PLACEHOLDER - stands in for a real photograph until one is supplied.
 * Not stock photography, not a fake room: an honest, clearly-a-placeholder
 * gradient + icon, so nothing on the homepage looks broken or half-built
 * in the meantime. Swap the two usages of this (Hero, Places-row empty
 * state) for real photos per the asset spec (2400x1350 WebP + 800px mobile
 * source for the hero) - search this codebase for TEMP_PLACEHOLDER.
 */
export default function PhotoPlaceholder({ className = '', iconSize = 40 }) {
  return (
    <div
      className={`relative w-full h-full flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: 'linear-gradient(135deg, #F0D4BE 0%, #DEDDD6 45%, #D9C4A8 100%)' }}
    >
      <div className="absolute inset-0 opacity-30" style={{
        backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(200,95,45,0.25) 0%, transparent 45%), radial-gradient(circle at 80% 75%, rgba(122,158,126,0.2) 0%, transparent 45%)',
      }} />
      <Home size={iconSize} style={{ color: 'rgba(23,33,27,0.25)' }} />
    </div>
  )
}
