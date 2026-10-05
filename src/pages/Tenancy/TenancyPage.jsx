import { Link } from 'react-router-dom'
import { CheckCircle, Clipboard, FileText, Home, Search, Shield } from 'lucide-react'

const STEPS = [
  { icon: <Search size={28} className="text-terracotta" />, title:'Find Your Property', desc:'Browse verified rentals and book an inspection through DealMatch.' },
  { icon: <Clipboard size={28} className="text-terracotta" />, title:'Sign Agreement', desc:'Complete your tenancy agreement digitally through DealMatch: protected and recorded.' },
  { icon: <Shield size={28} className="text-terracotta" />, title:'Pay via Protection', desc:'Deposit your rent into DealMatch Protection. Funds released to landlord after move-in confirmation.' },
  { icon: <Home size={28} className="text-terracotta" />, title:'Move In', desc:'Confirm move-in and DealMatch releases funds to your landlord. Deal done.' },
]

export default function TenancyPage() {
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#F5EDE0' }}>
      <div className="max-w-2xl mx-auto px-4">

        <div className="rounded-3xl p-8 mb-8 text-center relative overflow-hidden" style={{ backgroundColor: '#17211B' }}>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(122,158,126,0.2) 0%, transparent 70%)' }} />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(122,158,126,0.2)' }}>
              <FileText size={28} style={{ color: '#7A9E7E' }} />
            </div>
            <h1 className="font-display font-black text-3xl mb-3" style={{ color: '#FFFFFF' }}>Tenancy Protection </h1>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Rent confidently with DealMatch. Your agreement is secured, your deposit is protected, and your rights are guaranteed.
            </p>
          </div>
        </div>

        <div className="rounded-2xl p-6 border mb-6" style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
          <h2 className="font-display font-black text-xl mb-5" style={{ color: '#17211B' }}>How It Works</h2>
          <div className="space-y-5">
            {STEPS.map((s, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
                  style={{ backgroundColor: 'rgba(23,33,27,0.05)', border: '1px solid #DEDDD6' }}>
                  {s.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{s.title}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#647068' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {[
          { icon: <Shield size={28} className="text-terracotta" />, title:'Deposit Protection', desc:'Your deposit is held by DealMatch until you confirm the property is as described.' },
          { icon: <Clipboard size={28} className="text-terracotta" />, title:'Legal Agreement', desc:'Every tenancy is backed by a written agreement: disputes have a paper trail.' },
          { icon: <CheckCircle size={22} className="text-terracotta" />, title:'Verified Landlords', desc:'Only verified landlords can receive protection payments through DealMatch.' },
        ].map(b => (
          <div key={b.title} className="rounded-2xl p-4 border flex gap-3 mb-3"
            style={{ backgroundColor: '#FFFAF5', borderColor: '#DEDDD6' }}>
            <span className="flex-shrink-0">{b.icon}</span>
            <div>
              <p className="font-semibold text-sm" style={{ color: '#17211B' }}>{b.title}</p>
              <p className="text-xs mt-0.5" style={{ color: '#647068' }}>{b.desc}</p>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 mt-6">
          <Link to="/rentals" className="btn-primary py-4 text-sm text-center">Browse Rentals →</Link>
          <Link to="/escrow" className="py-4 rounded-2xl text-sm font-semibold text-center border-2 transition-all"
            style={{ borderColor: '#C85F2D', color: '#C85F2D', backgroundColor: 'rgba(200,95,45,0.04)' }}>
            Get Protected
          </Link>
        </div>
      </div>
    </div>
  )
}
