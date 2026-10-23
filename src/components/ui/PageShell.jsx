import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { linkCls } from '@/components/ui/styles'

// Page frame for the trust, transaction and dispute screens. The app shell already supplies the
// navbar and footer, so this only sets the width, the heading and the spacing.
export default function PageShell({ title, subtitle, backTo, backLabel = 'Back', wide = false, actions, children }) {
  return (
    <div className="min-h-[70vh] bg-cream text-deep">
      <div className={`mx-auto px-4 py-8 sm:py-10 ${wide ? 'max-w-5xl' : 'max-w-3xl'}`}>
        {backTo ? (
          <Link to={backTo} className={`mb-4 inline-flex items-center gap-1 text-sm ${linkCls}`}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : null}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-xl text-sm text-warm">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  )
}
