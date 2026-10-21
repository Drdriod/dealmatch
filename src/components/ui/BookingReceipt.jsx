import { motion } from 'motion/react'
import { Check, Download, Share2, X } from 'lucide-react'

export default function BookingReceipt({ booking, onClose }) {
  if (!booking) return null

  const handleShare = async () => {
    const text = `DealMatch Booking Confirmed!\n\nProperty: ${booking.property_title}\nGuest: ${booking.guest_name}\nCheck-in: ${booking.checkin_date}\nCheck-out: ${booking.checkout_date}\nRef: ${booking.payment_ref || 'N/A'}`
    if (navigator.share) await navigator.share({ title: 'Booking Receipt', text })
    else await navigator.clipboard.writeText(text)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(23,33,27,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{ backgroundColor: '#FFFAF5' }}>

        {/* Header */}
        <div className="p-5 text-center relative" style={{ backgroundColor: '#17211B' }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <X size={14} color="white" />
          </button>
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3"
            style={{ backgroundColor: 'rgba(122,158,126,0.2)' }}>
            <Check size={24} style={{ color: '#7A9E7E' }} />
          </div>
          <h3 className="font-display font-black text-xl text-white">Booking Confirmed!</h3>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {booking.payment_ref || 'DealMatch Receipt'}
          </p>
        </div>

        {/* Details */}
        <div className="p-5 space-y-3">
          {[
            { label: 'Property',    value: booking.property_title },
            { label: 'Guest',       value: booking.guest_name },
            { label: 'Check-in',    value: booking.checkin_date },
            { label: 'Check-out',   value: booking.checkout_date },
            { label: 'Rooms',       value: booking.rooms_booked || 1 },
            { label: 'Total',       value: booking.total_amount ? `₦${Number(booking.total_amount).toLocaleString()}` : 'Confirm on arrival' },
          ].map(({ label, value }) => value && (
            <div key={label} className="flex justify-between items-center py-2 border-b"
              style={{ borderColor: '#F0E8DC' }}>
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#647068' }}>{label}</span>
              <span className="text-sm font-semibold" style={{ color: '#17211B' }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button onClick={handleShare}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold border"
            style={{ borderColor: '#DEDDD6', color: '#5C4A3A' }}>
            <Share2 size={14} /> Share
          </button>
          <button onClick={onClose} className="btn-primary flex-1 py-3 text-sm">Done</button>
        </div>
      </motion.div>
    </div>
  )
}
