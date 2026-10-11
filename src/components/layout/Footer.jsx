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
      <div className="max-w-[1184px] mx-auto px-5 sm:px-7 pt-16 pb-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 font-display text-3xl font-black mb-4">
              <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-9 w-auto" />
              Deal<span className="text-terracotta">Match</span>
            </div>
            <p className="text-white/55 text-sm leading-relaxed max-w-xs">
              DealMatch matches real demand with trusted supply: property, talent, equipment, expertise. Every listing matched, not just posted.
            </p>
            {socialLinks.length > 0 && (
              <div className="flex gap-3 mt-6">
                {socialLinks.map(({ key, Icon, label }) => (
                  <a key={key} href={settings[key]} target="_blank" rel="noopener noreferrer"
                    aria-label={label}
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                    <Icon size={16} />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-body text-xs font-extrabold tracking-[0.14em] uppercase text-white/45 mb-5">Platform</h4>
            <ul className="space-y-3">
              {[
                { label: 'Find a Place',    to: '/places' },
                { label: 'Find a Provider', to: '/providers' },
                { label: 'Post a Request',  to: '/request' },
                { label: 'My Matches',      to: '/matches' },
                { label: 'How It Works',    to: '/how-it-works' },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-sm text-white/65 hover:text-white transition-colors">{item.label}</Link></li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-body text-xs font-extrabold tracking-[0.14em] uppercase text-white/45 mb-5">Place &amp; People</h4>
            <ul className="space-y-3">
              {[
                { label: 'Place (properties, stays, assets)', to: '/places' },
                { label: 'People (skills, services, experts)', to: '/providers' },
                { label: 'Community Forum',                  to: '/forum' },
              ].map(item => (
                <li key={item.label}><Link to={item.to} className="text-sm text-white/65 hover:text-white transition-colors">{item.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs text-white/50">
          <div>
            <p>© {new Date().getFullYear()} DealMatch. All rights reserved.</p>
            <p className="mt-1 text-white/40">Every listing matched, not just posted</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/how-it-works" className="hover:text-white transition-colors">How It Works</Link>
            <Link to="/escrow" className="hover:text-white transition-colors">Protection</Link>
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
