import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Bell, Check, Home } from 'lucide-react'

export default function ComingSoonPage({
  title = 'Coming Soon',
  message = "We're working on this feature. Check back soon.",
  icon: Icon = Home,
}) {
  return (
    <div className="min-h-screen pt-20 pb-16 flex items-center justify-center" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-sm mx-auto px-4 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
          style={{ backgroundColor: 'rgba(201,106,58,0.1)' }}>
          <Icon size={28} style={{ color: '#C96A3A' }} />
        </div>
        <h1 className="font-display text-2xl font-black mb-2" style={{ color: '#1A1210' }}>
          {title}
        </h1>
        <p className="text-sm mb-8" style={{ color: '#8A7E78' }}>
          {message}
        </p>
        <Link to="/" className="btn-primary px-6 py-3 text-sm inline-flex items-center gap-2">
          <ArrowLeft size={16} /> Back to Home
        </Link>
      </div>
    </div>
  )
}
