import React from 'react'
import { Link } from 'react-router-dom'
import { ShieldCheck, Search, MessageCircle, Lock, CheckCircle2, Home, Wrench } from 'lucide-react'

// Spec palette - do not substitute the warm tones used elsewhere in the app.
const C = {
  bg:      '#EEE9DE',
  primary: '#C85F2D',
  text:    '#17211B',
  dark:    '#1C1410',
  line:    '#DEDDD6',
}

const STEPS = [
  {
    icon: Search,
    title: '1. Find your match',
    body: 'Tell us what you need or explore available offers. No account needed to look.',
  },
  {
    icon: MessageCircle,
    title: '2. Review and agree',
    body: 'Evaluate the opportunity and say who you are interested in. Contact and chat stay locked until protection is confirmed.',
  },
  {
    icon: Lock,
    title: '3. Pay through DealMatch',
    body: 'Use DealMatch Protection where the transaction is eligible. Your payment is held by DealMatch, not sent to the other side yet.',
  },
  {
    icon: CheckCircle2,
    title: '4. Complete the deal',
    body: 'Once protection is confirmed, chat and contact details unlock. Follow the transaction process and confirm completion.',
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: C.bg }}>
      <div className="max-w-3xl mx-auto px-6">
        <h1 className="font-display font-black text-3xl mb-3" style={{ color: C.dark }}>Simple discovery. Clear agreements. Better deals.</h1>
        <p className="text-base leading-relaxed mb-10" style={{ color: C.text }}>
          DealMatch brings discovery, communication and protected transactions into one marketplace.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mb-12">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl p-5" style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.line}` }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(200,95,45,0.12)' }}>
                <Icon size={18} style={{ color: C.primary }} />
              </div>
              <h2 className="font-display font-bold text-sm mb-1" style={{ color: C.dark }}>{title}</h2>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>{body}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 mb-12" style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.line}` }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={20} style={{ color: C.primary }} />
            <h2 className="font-display font-bold text-base" style={{ color: C.dark }}>Two kinds of verification</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Home size={16} style={{ color: C.primary }} />
                <p className="font-semibold text-sm" style={{ color: C.dark }}>Places</p>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                ID plus proof of the property. A listing stays in draft, unlisted, until both are confirmed.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Wrench size={16} style={{ color: C.primary }} />
                <p className="font-semibold text-sm" style={{ color: C.dark }}>Skilled People</p>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: C.text }}>
                ID plus proof of work - photos of past jobs matter more than certificates. No listing goes live until it's reviewed.
              </p>
            </div>
          </div>
          <p className="text-xs mt-4" style={{ color: C.text, opacity: 0.7 }}>
            A verified badge only ever means our team reviewed it - never a guarantee, and never a substitute for using DealMatch Protection.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/places" className="px-6 py-3 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: C.primary }}>Explore Places</Link>
          <Link to="/providers" className="px-6 py-3 rounded-full text-sm font-semibold"
            style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.line}`, color: C.dark }}>Explore People</Link>
          <Link to="/request" className="px-6 py-3 rounded-full text-sm font-semibold"
            style={{ backgroundColor: '#FFFFFF', border: `1px solid ${C.line}`, color: C.dark }}>Post a Request</Link>
        </div>
      </div>
    </div>
  )
}
