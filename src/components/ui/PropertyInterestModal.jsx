import React, { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Calendar, Clock, Heart, MessageSquare, X, Zap } from 'lucide-react'
import { upsertPropertyInterest } from '@/data/propertyInterestRepository'
import { useAuth } from '@/context/AuthContext'
import { DEALMATCH_WHATSAPP } from '@/lib/contact'
import toast from 'react-hot-toast'

const INTENTS = [
  { id:'urgent_buyer',     icon: Zap,      label:'Ready to Buy Now',    desc:'I want to move forward immediately', score:40, color:'#C85F2D' },
  { id:'make_offer',       icon: Heart,    label:'Make an Offer',       desc:'I\'d like to submit an offer', score:35, color:'#7A9E7E' },
  { id:'schedule_viewing', icon: Calendar, label:'Schedule Viewing',    desc:'I want to see the property first', score:25, color:'#D4A853' },
  { id:'request_info',     icon: MessageSquare, label:'Get More Info',  desc:'I have questions about this property', score:15, color:'#647068' },
]

const TIMELINES = [
  { id:'immediate', label:'Immediately',    score:30 },
  { id:'1_month',   label:'Within 1 Month', score:20 },
  { id:'3_months',  label:'1–3 Months',     score:10 },
  { id:'6_months',  label:'3–6 Months',     score:5  },
  { id:'just_browsing', label:'Just Browsing', score:0 },
]

export default function PropertyInterestModal({ property, onClose, onComplete }) {
  const { user, profile } = useAuth()
  const [step, setStep]     = useState(0) // 0=intent, 1=timeline, 2=contact, 3=done
  const [intent, setIntent] = useState('')
  const [timeline, setTimeline] = useState('')
  const [phone, setPhone]   = useState(profile?.phone || '')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedIntent   = INTENTS.find(i => i.id === intent)
  const selectedTimeline = TIMELINES.find(t => t.id === timeline)

  const calculateScore = () => {
    const intentScore   = selectedIntent?.score   || 0
    const timelineScore = selectedTimeline?.score || 0
    const phoneBonus    = phone ? 10 : 0
    return intentScore + timelineScore + phoneBonus
  }

  const getLeadType = (score) => {
    if (score >= 70) return { label:'Immediate Buyer',  color:'#C85F2D' }
    if (score >= 50) return { label:'Decision Maker',   color:'#7A9E7E' }
    if (score >= 30) return { label:'Interested Lead',  color:'#D4A853' }
    if (score >= 15) return { label:'Potential Buyer',  color:'#647068' }
    return                  { label:'Browsing',         color:'#B0A8A0' }
  }

  const handleSubmit = async () => {
    if (!intent)   return toast.error('Please select your intent')
    if (!timeline) return toast.error('Please select your timeline')
    setSaving(true)
    const score = calculateScore()
    const { error } = await upsertPropertyInterest({
      user_id:     user.id,
      property_id: property.id,
      intent,
      timeline,
      phone:       phone || null,
      message:     message || null,
      lead_score:  score,
      status:      'new',
    })
    setSaving(false)
    if (error) { toast.error('Failed to save. Please try again.'); return }
    setStep(3)
    if (onComplete) onComplete()
  }

  const handleWhatsApp = () => {
    // Always the DealMatch gateway. The seller's number is not on the row any visitor can read.
    const clean = DEALMATCH_WHATSAPP
    const msg = encodeURIComponent(
      `Hi, I'm interested in *"${property.title}"* on DealMatch.\n\n` +
      `Intent: ${selectedIntent?.label}\nTimeline: ${selectedTimeline?.label}\n` +
      `Price: ₦${Number(property.price).toLocaleString()}\nLocation: ${property.city}, ${property.state}\n\n` +
      (message ? `Message: ${message}` : 'Could we discuss further?')
    )
    window.open('https://wa.me/' + clean + '?text=' + msg, '_blank')
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{backgroundColor:'rgba(23,33,27,0.7)'}}>
        <motion.div initial={{y:80,opacity:0}} animate={{y:0,opacity:1}} exit={{y:80,opacity:0}}
          className="w-full max-w-md rounded-3xl overflow-hidden"
          style={{backgroundColor:'#FFFAF5', maxHeight:'90vh', overflowY:'auto'}}>

          {/* Header */}
          <div className="p-5 border-b flex items-start justify-between" style={{borderColor:'#DEDDD6'}}>
            <div>
              <p className="font-display font-black text-lg" style={{color:'#17211B'}}>
                {step === 3 ? 'Interest Registered!' : 'Express Interest'}
              </p>
              <p className="text-xs mt-0.5 line-clamp-1" style={{color:'#647068'}}>{property.title}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{backgroundColor:'rgba(23,33,27,0.06)'}}>
              <X size={15} style={{color:'#5C4A3A'}} />
            </button>
          </div>

          <div className="p-5">
            {/* Step 0: Intent */}
            {step === 0 && (
              <div>
                <p className="text-sm font-semibold mb-4" style={{color:'#17211B'}}>What would you like to do?</p>
                <div className="space-y-2.5">
                  {INTENTS.map(item => {
                    const Icon = item.icon
                    return (
                      <button key={item.id} onClick={() => { setIntent(item.id); setStep(1) }}
                        className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all hover:border-[#C85F2D]"
                        style={{ borderColor: intent === item.id ? item.color : '#DEDDD6', backgroundColor: intent === item.id ? `${item.color}0F` : '#FFFFFF' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{backgroundColor:`${item.color}15`}}>
                          <Icon size={16} style={{color:item.color}} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{color:'#17211B'}}>{item.label}</p>
                          <p className="text-xs" style={{color:'#647068'}}>{item.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Step 1: Timeline */}
            {step === 1 && (
              <div>
                <button onClick={() => setStep(0)} className="flex items-center gap-1.5 text-xs font-semibold mb-4" style={{color:'#647068'}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <p className="text-sm font-semibold mb-4" style={{color:'#17211B'}}>When are you looking to proceed?</p>
                <div className="space-y-2">
                  {TIMELINES.map(t => (
                    <button key={t.id} onClick={() => { setTimeline(t.id); setStep(2) }}
                      className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all hover:border-[#C85F2D]"
                      style={{ borderColor: timeline === t.id ? '#C85F2D' : '#DEDDD6' }}>
                      <Clock size={14} style={{color:'#647068'}} />
                      <p className="text-sm font-semibold" style={{color:'#17211B'}}>{t.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Contact + message */}
            {step === 2 && (
              <div>
                <button onClick={() => setStep(1)} className="flex items-center gap-1.5 text-xs font-semibold mb-4" style={{color:'#647068'}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  Back
                </button>
                <p className="text-sm font-semibold mb-4" style={{color:'#17211B'}}>How should the seller reach you?</p>
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{color:'rgba(23,33,27,0.5)'}}>Phone (for faster response)</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                      placeholder="e.g. 08012345678"
                      className="w-full px-4 py-3 rounded-2xl border-2 text-sm outline-none transition-all focus:border-[#C85F2D]"
                      style={{borderColor:'#DEDDD6', backgroundColor:'#FFFFFF', color:'#17211B'}} />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block" style={{color:'rgba(23,33,27,0.5)'}}>Message (optional)</label>
                    <textarea value={message} onChange={e => setMessage(e.target.value)}
                      placeholder="Anything specific you'd like to know..."
                      rows={3}
                      className="w-full px-4 py-3 rounded-2xl border-2 text-sm outline-none transition-all focus:border-[#C85F2D] resize-none"
                      style={{borderColor:'#DEDDD6', backgroundColor:'#FFFFFF', color:'#17211B'}} />
                  </div>
                </div>
                <button onClick={handleSubmit} disabled={saving}
                  className="w-full py-3.5 rounded-2xl font-bold text-white mb-3 transition-all hover:opacity-90 disabled:opacity-50"
                  style={{backgroundColor:'#C85F2D'}}>
                  {saving ? 'Saving...' : 'Confirm Interest'}
                </button>
                <button onClick={handleWhatsApp}
                  className="w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{backgroundColor:'#25D366', color:'#FFFFFF'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Contact on WhatsApp
                </button>
              </div>
            )}

            {/* Step 3: Done */}
            {step === 3 && (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{backgroundColor:'rgba(122,158,126,0.15)'}}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7A9E7E" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                {(() => { const lt = getLeadType(calculateScore()); return (
                  <>
                    <p className="font-display font-black text-xl mb-1" style={{color:'#17211B'}}>Interest Registered</p>
                    <p className="text-xs mb-4" style={{color:'#647068'}}>The seller will be notified. Expect contact soon.</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-4"
                      style={{backgroundColor:`${lt.color}15`, border:`1px solid ${lt.color}30`}}>
                      <div className="w-2 h-2 rounded-full" style={{backgroundColor:lt.color}} />
                      <p className="text-xs font-bold" style={{color:lt.color}}>{lt.label}</p>
                    </div>
                    <p className="text-xs" style={{color:'#647068'}}>Lead score: <strong style={{color:'#17211B'}}>{calculateScore()}/80</strong></p>
                  </>
                )})()}
                <button onClick={handleWhatsApp}
                  className="w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 mt-5"
                  style={{backgroundColor:'#25D366', color:'#FFFFFF'}}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  Contact Seller on WhatsApp
                </button>
                <button onClick={onClose} className="w-full py-3 rounded-2xl font-semibold mt-2 text-sm" style={{color:'#647068'}}>
                  Close
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
