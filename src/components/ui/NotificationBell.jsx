import React, { useState, useEffect, useRef } from 'react'
import { AlertTriangle, Bell, CheckCircle, Gavel, Lock, Mail, ShieldCheck, ShieldX, Star, TrendingUp, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase' // realtime channel only: reads and writes go through notificationsRepository
import { fetchNotifications, markNotificationsRead } from '@/data/notificationsRepository'

const ICONS = {
  referral_cash:    TrendingUp,
  referral_points:  Star,
  points_redeemed:  CheckCircle,
  listing_approved: CheckCircle,
  booking_conflict: AlertTriangle,
  bid_received:     Mail,
  bid_accepted:     CheckCircle,
  escrow_funded:    Lock,
  job_completed:    CheckCircle,
  dispute_opened:   AlertTriangle,
  identity_approved: ShieldCheck,
  identity_rejected: ShieldX,
  general:          Mail,
}
const COLORS = {
  referral_cash:    '#7A9E7E',
  referral_points:  '#5B8DEF',
  points_redeemed:  '#D4A853',
  listing_approved: '#7A9E7E',
  booking_conflict: '#C94A3A',
  bid_received:     '#C85F2D',
  bid_accepted:     '#7A9E7E',
  escrow_funded:    '#5C8060',
  job_completed:    '#7A9E7E',
  dispute_opened:   '#C94A3A',
  identity_approved: '#7A9E7E',
  identity_rejected: '#C94A3A',
  general:          '#C85F2D',
}

const ago = (ts) => {
  if (!ts) return ''
  const s = (Date.now() - new Date(ts)) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen]               = useState(false)
  const [notifications, setNotifications] = useState([])
  const [toast, setToast]             = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    if (!user?.id) return
    let channel = null

    const init = async () => {
      try {
        await loadNotifications()

        channel = supabase
          .channel('notifications-' + user.id)
          .on('postgres_changes', {
            event:  'INSERT',
            schema: 'public',
            table:  'notifications',
            filter: 'user_id=eq.' + user.id,
          }, (payload) => {
            try {
              setNotifications(prev => [payload.new, ...prev])
              setToast(payload.new)
              setTimeout(() => setToast(t => (t?.id === payload.new.id ? null : t)), 6000)
            } catch { /* payload handling error - non-fatal */ }
          })
          .subscribe()
      } catch (err) {
        console.warn('NotificationBell: notifications table not ready yet:', err.message)
      }
    }

    init()

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* cleanup error - non-fatal */ }
      }
    }
  }, [user?.id])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const loadNotifications = async () => {
    try {
      const { data, error } = await fetchNotifications(user.id)
      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.warn('NotificationBell loadNotifications:', err.message)
      setNotifications([])
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const markAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (!unreadIds.length) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    try {
      await markNotificationsRead(unreadIds)
    } catch { /* non-fatal */ }
  }

  const markOneRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      await markNotificationsRead([id])
    } catch { /* non-fatal */ }
  }

  if (!user) return null

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => { setOpen(o => !o); if (!open) markAllRead() }}
        className="relative w-9 h-9 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: 'rgba(23,33,27,0.06)' }}>
        <Bell size={16} style={{ color: '#5C4A3A' }} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
            style={{ backgroundColor: '#C85F2D', color: '#fff' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto rounded-2xl shadow-xl z-50"
            style={{ backgroundColor: '#FFFAF5', border: '1px solid #DEDDD6' }}>
            <div className="p-4 border-b" style={{ borderColor: '#DEDDD6' }}>
              <p className="text-sm font-bold" style={{ color: '#17211B' }}>Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-xs" style={{ color: '#647068' }}>No notifications yet</p>
              </div>
            ) : (
              <div>
                {notifications.map(n => {
                  const Icon  = ICONS[n.type] || Bell
                  const color = COLORS[n.type] || '#647068'
                  return (
                    <Link key={n.id} to={n.link || '#'} onClick={() => { markOneRead(n.id); setOpen(false) }}
                      className="flex items-start gap-3 p-4 border-b transition-colors"
                      style={{
                        borderColor: '#F0E8DC',
                        backgroundColor: n.read ? 'transparent' : 'rgba(200,95,45,0.04)',
                      }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: color + '15' }}>
                        <Icon size={14} style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold" style={{ color: '#17211B' }}>{n.title}</p>
                        <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#647068' }}>{n.message}</p>
                        <p className="text-[10px] mt-1" style={{ color: '#B5A99C' }}>{ago(n.created_at)}</p>
                      </div>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: '#C85F2D' }} />
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.95 }}
            className="fixed top-20 right-4 left-4 sm:left-auto sm:w-80 rounded-2xl shadow-2xl z-[60] p-4 flex items-start gap-3"
            style={{ backgroundColor: '#17211B' }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: (COLORS[toast.type] || '#647068') + '20' }}>
              {React.createElement(ICONS[toast.type] || Bell, { size: 16, style: { color: COLORS[toast.type] || '#fff' } })}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold" style={{ color: '#FFFFFF' }}>{toast.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{toast.message}</p>
            </div>
            <button onClick={() => setToast(null)} className="flex-shrink-0">
              <X size={14} style={{ color: 'rgba(255,255,255,0.4)' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
