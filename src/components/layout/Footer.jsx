import { Link } from 'react-router-dom'
import { Facebook, Instagram } from 'lucide-react'
import { usePlatformSettings } from '@/hooks/usePlatformSettings'

export default function Footer() {
  const { settings } = usePlatformSettings()

  const socialLinks = [
    { key: 'social_facebook',  Icon: Facebook,  label: 'Facebook'  },
    { key: 'social_instagram', Icon: Instagram, label: 'Instagram' },
  ].filter(s => settings[s.key]) // only show icons the admin has actually configured

  return (
    <footer className="bg-deep text-white">
      <div className="max-w-7xl mx-auto px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="font-display text-3xl font-black mb-4">
              Deal<span className="text-terracotta">Match</span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed max-w-xs">
              DealMatch matches real demand with trusted supply: property, talent, equipment, expertise. Every listing matched, not just posted.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex gap-3 mt-6">
                {socialLinks.map(({ key, Icon, label }) => (
                  <a key={key} href={settings[key]} target="_blank" rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-white/8 hover:bg-white/15 flex items-center justify-center transition-colors">
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-white/30 mb-5">Platform</h4>
            <ul className="space-y-3">
              {[
                { label: 'Browse Deals',    to: '/browse' },
                { label: 'My Matches',      to: '/matches' },
                { label: 'Post a Listing',  to: '/marketplace' },
                { label: 'Deal Alerts',     to: '/dashboard' },
                { label: 'How It Works',    to: '/' },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-sm text-white/50 hover:text-blush transition-colors">{item.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-bold tracking-widest uppercase text-white/30 mb-5">Categories</h4>
            <ul className="space-y-3">
              {[
                { label: 'Real Estate & Housing',            to: '/browse' },
                { label: 'Skilled Artisans',                 to: '/marketplace/artisans' },
                { label: 'Automotive',                       to: '/marketplace/automotive' },
                { label: 'Professional & Business Services', to: '/forum/professional-business-services' },
                { label: 'Community Forum',                  to: '/forum' },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-sm text-white/50 hover:text-blush transition-colors">{item.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/8 pt-8 flex flex-col md:flex-row justify-between gap-4 text-xs text-white/25">
          <div>
          <p>© {new Date().getFullYear()} DealMatch. All rights reserved.</p>
          <p className="mt-1 text-xs" style={{color:'rgba(255,255,255,0.2)'}}>Every listing matched, not just posted</p>
        </div>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-white/50 transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white/50 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
      {/* Legal links */}
        <div className="border-t mt-8 pt-6 flex flex-wrap justify-center gap-4 text-xs" style={{borderColor:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.3)'}}>
        <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
        <span>·</span>
        <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
        <span>·</span>
        <Link to="/escrow" className="hover:text-white transition-colors">Escrow</Link>
        <span>·</span>
        <span>© {new Date().getFullYear()} DealMatch</span>
      </div>
    </footer>
  )
}
