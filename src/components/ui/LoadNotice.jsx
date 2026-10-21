import { RefreshCw } from 'lucide-react'
import Notice from '@/components/ui/Notice'

// Tells the person when a dashboard could not load everything, instead of showing zeros as if
// they were real. `error` means the main data failed; `issues` names figures that failed while
// the rest loaded. It sits in a cream card so it reads on the dark dashboards too.
export default function LoadNotice({ error, issues = [], onRetry, what = 'this page', className = '' }) {
  if (!error && issues.length === 0) return null
  const failed = !!error
  return (
    <div className={`rounded-2xl ${className}`} style={{ backgroundColor: '#FFFAF5' }}>
      <Notice
        variant={failed ? 'error' : 'warning'}
        title={failed ? `We couldn't load ${what}` : 'Some figures could not be loaded'}
        action={onRetry && (
          <button
            type="button"
            onClick={() => onRetry()}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold"
            style={{ borderColor: 'rgba(23,33,27,0.2)', color: '#17211B' }}
          >
            <RefreshCw size={13} /> Try again
          </button>
        )}
      >
        {failed
          ? 'Check your connection and try again. Figures on this page may be missing or out of date.'
          : `Not loaded: ${issues.join(', ')}. They show as 0 until they load.`}
      </Notice>
    </div>
  )
}
