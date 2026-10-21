import { motion } from 'motion/react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'

const ease = [0.22, 1, 0.36, 1]

// Tones stay inside the DealMatch palette. Warnings and errors use
// role="alert" so screen readers announce them; confirmations and info use
// role="status" so they do not interrupt.
const VARIANTS = {
  info: {
    icon: Info, role: 'status', tone: '#17211B',
    bg: 'rgba(23,33,27,0.04)', border: 'rgba(23,33,27,0.14)',
  },
  success: {
    icon: CheckCircle2, role: 'status', tone: '#3F6B46',
    bg: 'rgba(122,158,126,0.12)', border: 'rgba(122,158,126,0.4)',
  },
  warning: {
    icon: AlertTriangle, role: 'alert', tone: '#7A4F0E',
    bg: 'rgba(214,160,60,0.14)', border: 'rgba(214,160,60,0.45)',
  },
  error: {
    icon: XCircle, role: 'alert', tone: '#A8441D',
    bg: 'rgba(200,95,45,0.10)', border: 'rgba(200,95,45,0.4)',
  },
}

/**
 * Inline feedback block for something the person should notice: a missing
 * requirement, a correction, a success, or an error. Animates in, and the
 * icon springs into place so the state is visible at a glance.
 */
export default function Notice({ variant = 'info', title, children, action, className = '' }) {
  const v = VARIANTS[variant] || VARIANTS.info
  const Icon = v.icon

  return (
    <motion.div
      role={v.role}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease }}
      className={`flex gap-3 rounded-2xl border p-4 ${className}`}
      style={{ backgroundColor: v.bg, borderColor: v.border }}
    >
      <motion.span
        initial={{ scale: 0.6, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="mt-0.5 flex-shrink-0"
        style={{ color: v.tone }}
        aria-hidden="true"
      >
        <Icon size={18} />
      </motion.span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-bold" style={{ color: v.tone }}>{title}</p>}
        {children && <div className="mt-0.5 text-sm leading-relaxed text-[#3A4740]">{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </motion.div>
  )
}
