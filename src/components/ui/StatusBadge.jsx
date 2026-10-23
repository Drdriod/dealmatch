import { AlertCircle, Ban, CheckCircle2, Circle, Clock } from 'lucide-react'

// Every status carries text and an icon, never colour alone. Tones map to the brand palette:
// forest for done, gold for in progress, terracotta for needs a look, sand for quiet.
const TONES = {
  neutral: { cls: 'bg-cream-deep text-deep', Icon: Circle },
  progress: { cls: 'bg-gold/25 text-deep', Icon: Clock },
  success: { cls: 'bg-forest-pale text-forest', Icon: CheckCircle2 },
  attention: { cls: 'bg-orange-pale text-terracotta-dark', Icon: AlertCircle },
  muted: { cls: 'bg-line/60 text-warm', Icon: Ban },
}

export default function StatusBadge({ label, tone = 'neutral' }) {
  const { cls, Icon } = TONES[tone] || TONES.neutral
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
