import React, { useState, useEffect, useRef } from 'react'
import { AlertCircle, ArrowLeft, Home, MessageCircle, Send, Star, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'

// ─── Review Modal ─────────────────────────────────────────────
function ReviewModal({ propertyId, landlordId, onClose, onSubmit }) {
  const { user, profile } = useAuth()
  const [rating,  setRating]  = useState(0)
  const [hover,   setHover]   = useState(0)
  const [text,    setText]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const handleSubmit = async () => {
    if (!rating) { toast.error('Please give a rating'); return }
    setSaving(true)
    await supabase.from('property_reviews').insert({
      property_id:   propertyId,
      reviewer_id:   user.id,
      reviewer_name: profile?.full_name || 'Anonymous',
      landlord_id:   landlordId,
      rating,
      review_text:   text || null,
    })
    setSaving(false)
    onSubmit()
    toast.success('Review submitted! ⭐')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor:'rgba(23,33,27,0.85)', backdropFilter:'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ backgroundColor:'#FFFAF5' }}>
        <div className="p-5 border-b" style={{ borderColor:'#DEDDD6' }}>
          <h3 className="font-display font-black text-lg" style={{ color:'#17211B' }}>Leave a Review ⭐</h3>
          <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Rate this property and landlord</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Stars */}
          <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(n => (
              <button key={n} onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
                className="text-4xl transition-transform hover:scale-110">
                <span style={{ color: n <= (hover || rating) ? '#D4A853' : '#DEDDD6' }}><Star size={16} className="text-gold" /></span>
              </button>
            ))}
          </div>
          {rating > 0 && (
            <p className="text-center text-sm font-semibold" style={{ color:'#D4A853' }}>
              {['','Poor','Fair','Good','Very Good','Excellent'][rating]}
            </p>
          )}
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
            placeholder="Share your experience with this property and landlord..."
            className="input resize-none text-sm w-full" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold border"
              style={{ borderColor:'#DEDDD6', color:'#5C4A3A' }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving || !rating}
              className="btn-primary flex-1 py-3 text-sm"
              style={{ opacity: rating ? 1 : 0.5 }}>
              {saving ? 'Submitting...' : 'Submit Review'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Dispute Modal ────────────────────────────────────────────
function DisputeModal({ propertyId, againstId, bookingId, onClose }) {
  const { user, profile } = useAuth()
  const [reason,  setReason]  = useState('')
  const [desc,    setDesc]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const REASONS = ['Property not as described','Landlord unresponsive','Fraudulent listing',
    'Unsafe conditions','Payment issue','Harassment','Other']

  const handleSubmit = async () => {
    if (!reason || !desc) { toast.error('Please fill all fields'); return }
    setSaving(true)
    await supabase.from('disputes').insert({
      property_id:  propertyId,
      reporter_id:  user.id,
      against_id:   againstId,
      booking_id:   bookingId || null,
      reason,
      description:  desc,
      status:       'open',
    })
    setSaving(false)
    toast.success('Dispute filed. DealMatch team will review within 48 hours.')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4"
      style={{ backgroundColor:'rgba(23,33,27,0.88)', backdropFilter:'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ opacity:0, y:40 }} animate={{ opacity:1, y:0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ backgroundColor:'#FFFAF5', maxHeight:'90vh', overflowY:'auto' }}>
        <div className="p-5 border-b" style={{ borderColor:'#DEDDD6' }}>
          <h3 className="font-display font-black text-lg" style={{ color:'#C85F2D' }}>File a Dispute</h3>
          <p className="text-xs mt-0.5" style={{ color:'#647068' }}>DealMatch team will investigate within 48 hours</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Reason *</label>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(r => (
                <button key={r} onClick={() => setReason(r)}
                  className="px-3 py-2 rounded-full text-xs font-medium border-2 transition-all"
                  style={{ borderColor: reason === r ? '#C85F2D' : '#DEDDD6', backgroundColor: reason === r ? '#C85F2D' : '#FFFFFF', color: reason === r ? '#FFFFFF' : '#5C4A3A' }}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color:'rgba(23,33,27,0.5)' }}>Description *</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
              placeholder="Describe what happened in detail..."
              className="input resize-none text-sm w-full" style={{ backgroundColor:'#FFFFFF', color:'#17211B' }} />
          </div>
          <div className="rounded-xl p-3" style={{ backgroundColor:'rgba(200,95,45,0.08)', border:'1px solid rgba(200,95,45,0.2)' }}>
            <p className="text-xs" style={{ color:'#C85F2D' }}>
              Filing a false dispute may result in account suspension. Only file if you have a genuine issue.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-2xl text-sm font-semibold border" style={{ borderColor:'#DEDDD6', color:'#5C4A3A' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving || !reason || !desc}
              className="flex-1 py-3 rounded-2xl text-sm font-bold"
              style={{ backgroundColor:'#C85F2D', color:'#FFFFFF', opacity: (!reason || !desc) ? 0.5 : 1 }}>
              {saving ? 'Filing...' : 'File Dispute'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ─── Message Thread ────────────────────────────────────────────
function MessageThread({ thread, currentUserId, onBack }) {
  const [messages,   setMessages]   = useState([])
  const [newMsg,     setNewMsg]     = useState('')
  const [sending,    setSending]    = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showDispute,setShowDispute]= useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    loadMessages()
    // Real-time subscription
    const sub = supabase.channel(`thread_${thread.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`thread_id=eq.${thread.id}` },
        payload => setMessages(m => [...m, payload.new]))
      .subscribe()
    return () => supabase.removeChannel(sub)
  }, [thread.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
    setMessages(data || [])
    // Mark as read
    await supabase.from('messages').update({ read:true }).eq('thread_id', thread.id).eq('recipient_id', currentUserId)
  }

  const sendMessage = async () => {
    if (!newMsg.trim()) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      thread_id:     thread.id,
      sender_id:     currentUserId,
      sender_name:   thread.my_name,
      recipient_id:  thread.other_user_id,
      property_id:   thread.property_id,
      content:       newMsg.trim(),
    })
    if (!error) setNewMsg('')
    setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{ borderColor:'#DEDDD6', backgroundColor:'#FFFAF5' }}>
        <button onClick={onBack} className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ backgroundColor:'rgba(23,33,27,0.06)' }}>
          <ArrowLeft size={15} style={{ color:'#5C4A3A' }} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color:'#17211B' }}>{thread.other_user_name}</p>
          <p className="text-xs truncate" style={{ color:'#647068' }}>{thread.property_title}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowReview(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor:'rgba(212,168,83,0.1)' }}
            title="Leave a review">
            <Star size={14} style={{ color:'#D4A853' }} />
          </button>
          <button onClick={() => setShowDispute(true)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor:'rgba(200,95,45,0.1)' }}
            title="File a dispute">
            <AlertCircle size={14} style={{ color:'#C85F2D' }} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12" style={{ color:'#647068' }}>
            <div className="flex justify-center mb-2"><MessageCircle size={40} className="text-terracotta" /></div>
            <p className="text-sm">No messages yet. Send a message to start the conversation.</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[78%] px-4 py-2.5 rounded-2xl text-sm"
                style={{
                  backgroundColor: isMe ? '#C85F2D' : '#FFFFFF',
                  color:           isMe ? '#FFFFFF' : '#17211B',
                  borderRadius:    isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  border:          isMe ? 'none' : '1px solid #DEDDD6',
                }}>
                {!isMe && <p className="text-[10px] font-semibold mb-0.5" style={{ color:'#C85F2D' }}>{msg.sender_name}</p>}
                <p className="leading-relaxed">{msg.content}</p>
                <p className="text-[10px] mt-1 text-right" style={{ color: isMe ? 'rgba(255,255,255,0.6)' : '#647068' }}>
                  {new Date(msg.created_at).toLocaleTimeString('en-NG',{ hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 p-4 border-t" style={{ borderColor:'#DEDDD6', backgroundColor:'#FFFAF5' }}>
        <input type="text" value={newMsg} onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Type a message..."
          className="flex-1 px-4 py-3 rounded-2xl border text-sm outline-none"
          style={{ backgroundColor:'#FFFFFF', color:'#17211B', borderColor:'#DEDDD6' }} />
        <button onClick={sendMessage} disabled={sending || !newMsg.trim()}
          className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all"
          style={{ backgroundColor: newMsg.trim() ? '#C85F2D' : 'rgba(23,33,27,0.08)', color: newMsg.trim() ? '#FFFFFF' : '#647068' }}>
          <Send size={16} />
        </button>
      </div>

      <AnimatePresence>
        {showReview  && <ReviewModal  propertyId={thread.property_id} landlordId={thread.other_user_id} onClose={() => setShowReview(false)}  onSubmit={() => {}} />}
        {showDispute && <DisputeModal propertyId={thread.property_id} againstId={thread.other_user_id}  onClose={() => setShowDispute(false)} />}
      </AnimatePresence>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────
export default function MessagesPage() {
  const { user, profile } = useAuth()
  const [params]      = useSearchParams()
  const navigate      = useNavigate()
  const [threads,     setThreads]      = useState([])
  const [loading,     setLoading]      = useState(true)
  const [activeThread,setActiveThread] = useState(null)

  useEffect(() => {
    if (!user) return
    loadThreads()
    
    // Swift communication: Real-time subscription for new messages
    const channel = supabase
      .channel('messages_global')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new.recipient_id === user.id || payload.new.sender_id === user.id) {
          loadThreads()
        }
      })
      .subscribe()

    // Auto-open thread from URL param
    const tid = params.get('thread')
    if (tid) setActiveThread({ id: tid, other_user_name:'...', property_title:'...', other_user_id:'', property_id:'', my_name: profile?.full_name || '' })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const loadThreads = async () => {
    try {
      setLoading(true)
      // Get latest message per thread
      const { data, error } = await supabase
        .from('messages')
        .select('thread_id, content, created_at, sender_id, sender_name, recipient_id, property_id, read')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false })

      if (error) throw error
      if (!data) { setThreads([]); return }

      // Group by thread_id, get latest per thread
      const seen = new Set()
      const unique = data.filter(m => { if (seen.has(m.thread_id)) return false; seen.add(m.thread_id); return true })

      // Fetch property titles
      const propertyIds = [...new Set(unique.map(m => m.property_id).filter(Boolean))]
      let propMap = {}
      if (propertyIds.length) {
        const { data: props } = await supabase.from('properties').select('id, title, seller_id').in('id', propertyIds)
        propMap = Object.fromEntries((props || []).map(p => [p.id, p]))
      }

      const threadsFormatted = unique.map(m => {
        const isMe      = m.sender_id === user.id
        const otherId   = isMe ? m.recipient_id : m.sender_id
        const otherName = isMe ? '...' : (m.sender_name || 'User')
        const prop      = propMap[m.property_id]
        return {
          id:              m.thread_id,
          other_user_id:   otherId,
          other_user_name: otherName,
          property_id:     m.property_id,
          property_title:  prop?.title || 'Property',
          last_message:    m.content,
          created_at:      m.created_at,
          unread:          !m.read && m.recipient_id === user.id,
          my_name:         profile?.full_name || 'Me',
        }
      })
      setThreads(threadsFormatted)
    } catch (err) {
      console.error('Error loading threads:', err)
      toast.error('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }

  if (activeThread) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor:'#F7F4ED' }}>
        <div className="flex-1 flex flex-col overflow-hidden" style={{ paddingTop:64 }}>
          <MessageThread thread={activeThread} currentUserId={user.id} onBack={() => { setActiveThread(null); loadThreads() }} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-lg mx-auto px-4">
        <div className="mb-6">
          <h1 className="font-display text-2xl font-black" style={{ color:'#17211B' }}>Messages</h1>
          <p className="text-xs mt-0.5" style={{ color:'#647068' }}>Your conversations with landlords and tenants</p>
        </div>

        {loading ? (
          <div className="text-center py-16" style={{ color:'#647068' }}>Loading messages...</div>
        ) : threads.length === 0 ? (
          <div className="rounded-2xl p-10 text-center border" style={{ backgroundColor:'#FFFAF5', borderColor:'#DEDDD6' }}>
            <div className="flex justify-center mb-3"><MessageCircle size={40} className="text-terracotta" /></div>
            <p className="font-semibold text-sm" style={{ color:'#17211B' }}>No messages yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color:'#647068' }}>Messages with landlords and tenants appear here.</p>
            <button onClick={() => navigate('/rentals')} className="btn-primary px-6 py-3 text-sm">Browse Rentals</button>
          </div>
        ) : (
          <div className="space-y-2">
            {threads.map(t => (
              <button key={t.id} onClick={() => setActiveThread(t)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all hover:-translate-y-0.5"
                style={{ backgroundColor: t.unread ? 'rgba(200,95,45,0.04)' : '#FFFAF5', borderColor: t.unread ? 'rgba(200,95,45,0.25)' : '#DEDDD6' }}>
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 font-black text-lg"
                  style={{ backgroundColor:'rgba(200,95,45,0.1)', color:'#C85F2D' }}>
                  {t.other_user_name[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="font-semibold text-sm truncate" style={{ color:'#17211B', fontWeight: t.unread ? 700 : 500 }}>
                      {t.other_user_name}
                    </p>
                    <p className="text-[10px] flex-shrink-0" style={{ color:'#647068' }}>
                      {new Date(t.created_at).toLocaleDateString('en-NG',{ day:'2-digit', month:'short' })}
                    </p>
                  </div>
                  <p className="text-xs truncate" style={{ color:'#647068' }}>{t.property_title}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: t.unread ? '#17211B' : '#647068', fontWeight: t.unread ? 600 : 400 }}>
                    {t.last_message}
                  </p>
                </div>
                {t.unread && (
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor:'#C85F2D' }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
