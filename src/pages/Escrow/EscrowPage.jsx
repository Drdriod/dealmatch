import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Ban, Banknote, CheckCircle, Clipboard, Home, Search, Shield, ShieldCheck, X, Zap } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useVerificationGuard } from '@/hooks/useVerificationGuard'
import { supabase } from '@/lib/supabase'
import { initializeFlutterwavePayment, generateReference } from '@/lib/flutterwave'
import toast from 'react-hot-toast'

const WHATSAPP = '2347057392060'

const HOW_IT_WORKS = [
  { icon: <Banknote size={28} className="text-terracotta" />, title:'Tenant deposits funds',  desc:'The tenant pays the rent or deposit through DealMatch, not directly to the landlord.' },
  { icon: <Search size={28} className="text-terracotta" />, title:'DealMatch records the deal', desc:'The property, the landlord and the tenant are recorded with the payment reference.' },
  { icon: <Home size={28} className="text-terracotta" />, title:'Tenant moves in',        desc:'The tenant confirms move-in, and the funds are released to the landlord. If the tenant does not confirm, they are released 72 hours after move-in unless a dispute is filed.' },
  { icon: <CheckCircle size={22} className="text-terracotta" />, title:'Deal complete',          desc:'DealMatch takes its fee when the funds are released. On rentals, 3.75% comes from each side (7.5% in total). On sales, 1.5% comes from each side (3% in total).' },
]

// ─── Request Modal ────────────────────────────────────────
function EscrowRequestModal({ onClose }) {
  const { user, profile } = useAuth()
  const { requireVerification } = useVerificationGuard()
  const [form, setForm] = useState({
    type: 'rental', property_title: '', property_address: '',
    landlord_name: '', landlord_phone: '',
    tenant_name:  profile?.full_name || '',
    tenant_phone: profile?.phone     || '',
    tenant_email: user?.email        || '',
    amount: '', move_in_date: '', duration: '12',
  })
  const [submitted,  setSubmitted]  = useState(false)
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  // Fee per side depends on the deal: rentals 3.75% each (7.5% total),
  // sales 1.5% each (3% total). Matches the escrow release rules in the database.
  const isSale            = form.type === 'sale'
  const feeRate           = isSale ? 0.015 : 0.0375
  const feeLabelPerSide   = isSale ? '1.5%' : '3.75%'
  const feeLabelTotal     = isSale ? '3%' : '7.5%'
  const gross             = form.amount ? Number(form.amount) : 0
  const fee_per_party     = gross ? Math.round(gross * feeRate) : 0
  const platform_fee      = fee_per_party * 2   // total collected
  const landlordReceives  = gross ? gross - fee_per_party : 0
  const rawFee            = fee_per_party        // legacy compat
  const platform_fee_each = fee_per_party

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.property_title || !form.landlord_phone || !form.amount) {
      toast.error('Please fill all required fields'); return
    }
    const email = form.tenant_email || user?.email || ''
    if (!email) { toast.error('Please provide your email for payment'); return }
    if (!(await requireVerification('escrow'))) return

    await initializeFlutterwavePayment({
      email, amount: Number(form.amount),
      reference: generateReference(),
      metadata: {
        type: 'escrow_payment', user_id: user?.id, property_title: form.property_title,
        property_address: form.property_address, landlord_name: form.landlord_name,
        landlord_phone: form.landlord_phone, tenant_name: form.tenant_name,
        tenant_phone: form.tenant_phone, move_in_date: form.move_in_date,
        duration: form.duration, platform_fee, landlord_receives: landlordReceives,
      },
      onSuccess: response => {
        const msg = encodeURIComponent(
          '*Protection Payment Received: DealMatch*\n\n' +
          'Property: ' + form.property_title + '\n' +
          'Tenant: ' + form.tenant_name + ' | ' + form.tenant_phone + '\n' +
          'Landlord: ' + form.landlord_name + ' | ' + form.landlord_phone + '\n' +
          'Amount: ₦' + Number(form.amount).toLocaleString() + '\n' +
          'Payment Ref: ' + response.reference
        )
        window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank')
        setSubmitted(true)
      },
      onClose: () => toast('Payment cancelled.'),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor:'rgba(23,33,27,0.85)', backdropFilter:'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-lg rounded-3xl overflow-hidden flex flex-col"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'92vh' }}>

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between flex-shrink-0" style={{ borderColor:'#DEDDD6' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor:'rgba(122,158,126,0.15)' }}>
              <Shield size={18} style={{ color:'#7A9E7E' }} />
            </div>
            <div>
              <h3 className="font-display text-lg font-black" style={{ color:'#17211B' }}>Request Protection</h3>
              <p className="text-xs" style={{ color:'#647068' }}>Protected transaction</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor:'rgba(23,33,27,0.08)' }}>
            <X size={14} style={{ color:'#5C4A3A' }} />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <div className="flex justify-center mb-4"><ShieldCheck size={48} className="text-terracotta" /></div>
            <h4 className="font-display font-black text-xl mb-2" style={{ color:'#17211B' }}>Protection Initiated!</h4>
            <p className="text-sm leading-relaxed mb-6" style={{ color:'#647068' }}>
              Payment received. Your protection is being set up, and DealMatch will contact both parties on WhatsApp.
            </p>
            <button onClick={onClose} className="btn-primary w-full py-3">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-5 space-y-4">
            {/* Transaction type */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Transaction Type</label>
              <div className="grid grid-cols-2 gap-2">
                {[['rental','Monthly Rental'],['sale','Property Sale']].map(([v,l]) => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, type:v }))}
                    className="py-3 rounded-2xl text-sm font-semibold border-2 transition-all"
                    style={{
                      borderColor:     form.type === v ? '#C85F2D' : '#DEDDD6',
                      backgroundColor: form.type === v ? 'rgba(200,95,45,0.05)' : '#FFFFFF',
                      color:           form.type === v ? '#C85F2D' : '#647068',
                    }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {[
              { label:'Property Title *',  key:'property_title',   type:'text', placeholder:'e.g. 3-Bed Apartment, Lekki' },
              { label:'Property Address',  key:'property_address', type:'text', placeholder:'Full address' },
              { label:'Landlord Name',     key:'landlord_name',    type:'text', placeholder:'Full name' },
              { label:'Landlord Phone *',  key:'landlord_phone',   type:'tel',  placeholder:'0800 000 0000' },
              { label:'Your Name',         key:'tenant_name',      type:'text', placeholder:'Your name' },
              { label:'Your Phone',        key:'tenant_phone',     type:'tel',  placeholder:'Your phone' },
              { label:'Your Email',        key:'tenant_email',     type:'email',placeholder:'For payment receipt' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>{f.label}</label>
                <input type={f.type} value={form[f.key]} onChange={set(f.key)} placeholder={f.placeholder}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>
            ))}

            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Amount (₦) *</label>
              <input type="number" value={form.amount} onChange={set('amount')} placeholder="e.g. 1200000"
                className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
            </div>

            {form.amount && (
              <div className="rounded-2xl p-4" style={{ backgroundColor:'rgba(122,158,126,0.08)', border:'1px solid rgba(122,158,126,0.2)' }}>
                <p className="text-xs font-bold mb-2" style={{ color:'#5C8060' }}>Breakdown</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span style={{ color:'#647068' }}>Total</span><strong style={{ color:'#17211B' }}>₦{Number(form.amount).toLocaleString()}</strong></div>
                  <div className="flex justify-between"><span style={{ color:'#647068' }}>Platform Fee ({feeLabelPerSide} per side = {feeLabelTotal} total)</span><strong style={{ color:'#C85F2D' }}>-₦{platform_fee.toLocaleString()}</strong></div>
                  <div className="flex justify-between border-t pt-1" style={{ borderColor:'rgba(122,158,126,0.2)' }}>
                    <span style={{ color:'#5C8060', fontWeight:700 }}>Landlord receives</span>
                    <strong style={{ color:'#5C8060' }}>₦{landlordReceives.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Move-in Date</label>
                <input type="date" value={form.move_in_date} onChange={set('move_in_date')}
                  className="input text-sm" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
              </div>
              {form.type === 'rental' && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Duration</label>
                  <select value={form.duration} onChange={set('duration')} className="select text-sm"
                    style={{ backgroundColor:'#FFFFFF', color:'#17211B' }}>
                    {[1,3,6,12,24].map(n => <option key={n} value={n}>{n} month{n>1?'s':''}</option>)}
                  </select>
                </div>
              )}
            </div>

            <button type="submit" className="btn-primary w-full py-4">Pay with Card / Bank →</button>
            <p className="text-xs text-center" style={{ color:'#647068' }}>Funds held until you confirm move-in.</p>
          </form>
        )}
      </motion.div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────
// Move-in confirmation component
function ActiveEscrowSection() {
  const { user } = useAuth()
  const [escrows, setEscrows] = React.useState([])
  const [confirming, setConfirming] = React.useState(null)

  React.useEffect(() => {
    if (!user) return
    supabase.from('escrow_transactions')
      .select('*,properties(title,city)')
      .eq('tenant_id', user.id)
      .eq('status', 'funded')
      .order('created_at', { ascending: false })
      .then(({ data }) => setEscrows(data || []))
  }, [user])

  const confirmMoveIn = async (escrowId) => {
    setConfirming(escrowId)
    const { error } = await supabase.from('escrow_transactions')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', escrowId)
      .eq('tenant_id', user.id)
    if (error) toast.error('Could not confirm. Please try again.')
    else toast.success('Move-in confirmed! Funds released to landlord.')
    setConfirming(null)
  }

  if (!escrows.length) return null
  return (
    <div className="mt-8 px-4 max-w-lg mx-auto">
      <h3 className="font-display text-lg font-black mb-4" style={{color:'#17211B'}}>Active Protection</h3>
      {escrows.map(e => (
        <div key={e.id} className="rounded-3xl p-4 mb-3" style={{backgroundColor:'white',border:'1px solid #DEDDD6'}}>
          <p className="font-bold text-sm" style={{color:'#17211B'}}>{e.properties?.title}</p>
          <p className="text-xs mb-3" style={{color:'#647068'}}>{e.properties?.city} · ₦{Number(e.gross_amount).toLocaleString()}</p>
          {e.move_in_date && (
            <p className="text-xs mb-2" style={{color:'#647068'}}>
              Move-in date: {new Date(e.move_in_date).toLocaleDateString()}
              {' · '}Auto-releases 72h after if no dispute filed
            </p>
          )}
          <button onClick={() => confirmMoveIn(e.id)} disabled={!!confirming}
            className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{backgroundColor:'#7A9E7E',color:'white'}}>
            <CheckCircle size={16} /> {confirming === e.id ? 'Confirming...' : 'Confirm Move-In & Release Funds'}
          </button>
          <p className="text-xs text-center mt-2" style={{color:'rgba(23,33,27,0.35)'}}>
            Only confirm after you have physically moved in and are satisfied with the property.
          </p>
        </div>
      ))}
    </div>
  )
}

export default function EscrowPage() {
  const [showModal, setShowModal] = useState(false)

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        {/* Hero */}
        <div className="rounded-3xl p-8 mb-6 text-center relative overflow-hidden" style={{ backgroundColor:'#17211B' }}>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background:'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(122,158,126,0.2) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor:'rgba(122,158,126,0.2)' }}>
              <Shield size={32} style={{ color:'#7A9E7E' }} />
            </div>
            <h1 className="font-display font-black text-3xl mb-3" style={{ color:'#FFFFFF' }}>
              DealMatch Protection
            </h1>
            <p className="text-sm leading-relaxed mb-6" style={{ color:'rgba(255,255,255,0.55)' }}>
              Pay your rent or property deposit safely through DealMatch. Funds are held until you confirm move-in, so your money is protected until you have moved in.
            </p>
            <button onClick={() => setShowModal(true)} className="btn-primary px-8 py-4 text-base">
              Request Protection →
            </button>
          </div>
        </div>

        <ActiveEscrowSection />

        {/* How it works */}
        <div className="rounded-2xl p-6 mb-6 border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
          <h2 className="font-display font-black text-xl mb-5" style={{ color:'#17211B' }}>How it works</h2>
          <div className="space-y-4">
            {HOW_IT_WORKS.map((s, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor:'rgba(23,33,27,0.04)', border:'1px solid #DEDDD6' }}>
                  {s.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color:'#17211B' }}>{s.title}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color:'#647068' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Benefits */}
        {[
          { icon: <Shield size={28} className="text-terracotta" />, title:'Your money is safe',      desc:'DealMatch holds the funds until you confirm move-in. The landlord does not receive them before then.' },
          { icon: <Clipboard size={22} className="text-terracotta" />, title:'A clear record',            desc:'Every protected payment is recorded with its payment reference, the property and both parties.' },
          { icon: <Ban size={22} className="text-terracotta" />, title:'Paid through DealMatch',    desc:'Keeping the payment on DealMatch means it is recorded and covered by this protection.' },
          { icon: <Zap size={22} className="text-terracotta" />, title:'Release on move-in',        desc:'Once you confirm move-in, the funds are released to the landlord.' },
        ].map(b => (
          <div key={b.title} className="rounded-2xl p-4 border flex gap-3 mb-3"
            style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
            <span className="flex-shrink-0">{b.icon}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color:'#17211B' }}>{b.title}</p>
              <p className="text-xs mt-0.5 leading-relaxed" style={{ color:'#647068' }}>{b.desc}</p>
            </div>
          </div>
        ))}

        <button onClick={() => setShowModal(true)} className="btn-primary w-full py-4 text-base mt-3">
          Get Protected →
        </button>
      </div>

      <AnimatePresence>
        {showModal && <EscrowRequestModal onClose={() => setShowModal(false)} />}
      </AnimatePresence>
    </div>
  )
}
