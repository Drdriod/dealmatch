import React from 'react'
import { Link } from 'react-router-dom'
import { Clock, ArrowLeft } from 'lucide-react'

export default function ComingSoon({ title = 'Coming Soon', message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor:'#FFFAF5' }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor:'rgba(212,168,83,0.1)' }}>
        <Clock size={32} style={{ color:'#D4A853' }} />
      </div>
      <h1 className="font-display text-3xl font-black mb-2" style={{ color:'#17211B' }}>{title}</h1>
      <p className="text-sm leading-relaxed mb-2 max-w-xs" style={{ color:'#647068' }}>
        {message || 'We are working on something exciting. This feature will unlock soon on DealMatch.'}
      </p>
      <div className="inline-block px-4 py-1.5 rounded-full text-xs font-bold mb-8"
        style={{ backgroundColor:'rgba(212,168,83,0.12)', color:'#8A6A20' }}>
        Unlocking Soon - Stay Tuned
      </div>
      <Link to="/dashboard" className="flex items-center gap-2 text-sm font-semibold"
        style={{ color:'#C85F2D' }}>
        <ArrowLeft size={16} /> Back to Dashboard
      </Link>
    </div>
  )
}
