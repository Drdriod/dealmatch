import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { Ban, Banknote, CheckCircle, Clipboard, Home, Search, Shield, Zap } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { fetchFundedEscrowsForTenant, recordMoveInConfirmation } from '@/data/escrowViewRepository'
import { usePlatformFees, escrowFeeSentence } from '@/lib/platformFees'
import toast from 'react-hot-toast'

const HOW_IT_WORKS = [
  { icon: <Banknote size={28} className="text-terracotta" />, title:'Tenant deposits funds',  desc:'The tenant pays the rent or deposit through DealMatch, not directly to the landlord.' },
  { icon: <Search size={28} className="text-terracotta" />, title:'DealMatch records the deal', desc:'The property, the landlord and the tenant are recorded with the payment reference.' },
  { icon: <Home size={28} className="text-terracotta" />, title:'Tenant moves in',        desc:'The tenant confirms move-in, and the funds are released to the landlord. If the tenant does not confirm, they are released 72 hours after move-in unless a dispute is filed.' },
  { icon: <CheckCircle size={22} className="text-terracotta" />, title:'Deal complete',          fee: true },
]

// ─── Main Page ────────────────────────────────────────────
// Move-in confirmation component
function ActiveEscrowSection() {
  const { user } = useAuth()
  const [escrows, setEscrows] = React.useState([])
  const [confirming, setConfirming] = React.useState(null)

  React.useEffect(() => {
    if (!user) return
    fetchFundedEscrowsForTenant(user.id)
      .then(({ data }) => setEscrows(data || []))
  }, [user])

  const confirmMoveIn = async (escrowId) => {
    setConfirming(escrowId)
    const { error } = await recordMoveInConfirmation(escrowId, user.id)
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
  const { fees } = usePlatformFees()
  // Rates come from the platform fee registry. Until they load, show Loading.
  const feeSentence = escrowFeeSentence(fees)
  const feeLine = feeSentence
    ? `DealMatch takes its fee when the funds are released: ${feeSentence}`
    : 'Loading the current fee...'

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
            <Link to="/rentals" className="btn-primary inline-block px-8 py-4 text-base">
              Find a place to protect →
            </Link>
            <p className="text-xs mt-3" style={{ color:'rgba(255,255,255,0.45)' }}>
              Protection starts when you pay for a specific place, so you pick the place first.
            </p>
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
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color:'#647068' }}>{s.fee ? feeLine : s.desc}</p>
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

        <Link to="/rentals" className="btn-primary block w-full py-4 text-center text-base mt-3">
          Find a place to protect →
        </Link>
      </div>

    </div>
  )
}
