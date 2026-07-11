import React, { useState, useRef } from 'react'
import { ArrowRight, Camera, Edit3, HardHat, Heart, Home, LayoutDashboard, LogOut, Save, Shield, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { uploadAvatar, supabase } from '@/lib/supabase'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

const NIGERIAN_STATES = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Gombe','Imo','Jigawa',
  'Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger',
  'Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe',
  'Zamfara','Abuja (FCT)',
]

export default function ProfilePage() {
  const { user, profile, updateUserProfile, refreshProfile } = useAuth()
  const navigate   = useNavigate()
  const fileRef    = useRef(null)
  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [uploading, setUploading] = useState(false)
  const [signingOut,setSigningOut]= useState(false)
  const [form, setForm] = useState({
    full_name:      profile?.full_name      || '',
    phone:          profile?.phone          || '',
    bio:            profile?.bio            || '',
    state:          profile?.state          || '',
    city:           profile?.city           || '',
    bank_name:      profile?.bank_name      || '',
    account_number: profile?.account_number || '',
    account_name:   profile?.account_name   || '',
    routing_number: profile?.routing_number || '',
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleAvatarChange = async e => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    const { url, error } = await uploadAvatar(user.id, file)
    if (error) { toast.error('Upload failed: ' + error.message); setUploading(false); return }
    await updateUserProfile({ avatar_url: url })
    // Note: is_photo_verified is set only by admin after identity review
    await refreshProfile()
    toast.success('Photo updated!')
    setUploading(false)
  }

  const handleSave = async () => {
    // Basic validation for bank details if any field is filled
    if (form.account_number && !/^\d{10}$/.test(form.account_number)) {
      toast.error('Account number must be exactly 10 digits');
      return;
    }
    
    setSaving(true)
    const { error } = await updateUserProfile(form)
    setSaving(false)
    if (error) { toast.error('Save failed: ' + error.message); return }
    await refreshProfile()
    setEditing(false)
    toast.success('Profile updated!')
  }

  // FIX: Robust sign-out: calls supabase directly, then hard-redirect
  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await supabase.auth.signOut({ scope: 'local' })
      toast.success('Signed out')
      // Hard reload clears all in-memory state and React context
      window.location.href = '/'
    } catch (err) {
      console.error('Sign-out error:', err)
      // Force redirect anyway: worst case the session cookie expires
      window.location.href = '/'
    }
  }

  const verificationLevel =
    profile?.is_live_verified ? 'live' :
    profile?.avatar_url        ? 'photo' : 'none'

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor:'#F5EDE0' }}>
      <div className="max-w-lg mx-auto px-4">

        {/* Profile hero card */}
        <div className="rounded-3xl overflow-hidden mb-5" style={{ backgroundColor:'#1A1210' }}>
          <div className="p-6 flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="relative mb-4">
              <div className="w-24 h-24 rounded-full overflow-hidden border-4"
                style={{ borderColor:'rgba(201,106,58,0.5)' }}>
                {uploading ? (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor:'rgba(255,255,255,0.1)' }}>
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"
                    style={{ backgroundColor:'rgba(201,106,58,0.2)' }}>
                    <User size={32} style={{ color:'#C96A3A' }} />
                  </div>
                )}
              </div>
              <button onClick={() => fileRef.current?.click()}
                className="absolute bottom-0 right-0 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor:'#C96A3A', border:'2px solid #1A1210' }}>
                <Camera size={13} color="white" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={handleAvatarChange} />
            </div>

            <h2 className="font-display font-black text-xl text-white mb-0.5">
              {profile?.full_name || 'Your Name'}
            </h2>
            <p className="text-xs capitalize" style={{ color:'rgba(255,255,255,0.45)' }}>
              {profile?.role || 'User'} · {user?.email}
            </p>

            {/* Tagline */}
            <p className="text-xs mt-2" style={{ color:'rgba(201,106,58,0.7)' }}>
              Every match is a connection
            </p>

            {/* Verification badge */}
            <div className="mt-3 flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                backgroundColor: verificationLevel === 'live'  ? 'rgba(122,158,126,0.2)'  :
                                  verificationLevel === 'photo' ? 'rgba(212,168,83,0.2)'   :
                                  'rgba(201,106,58,0.2)',
                color:           verificationLevel === 'live'  ? '#7A9E7E' :
                                  verificationLevel === 'photo' ? '#D4A853' : '#C96A3A',
              }}>
              <Shield size={12} />
              <span className="text-xs font-bold">
                {verificationLevel === 'live'  ? 'Fully Verified' :
                 verificationLevel === 'photo' ? 'Photo Uploaded' : 'Not Verified'}
              </span>
            </div>
          </div>
        </div>

        {/* Verification nudge */}
        {/* Verification status feedback loop */}
        {(() => {
          const idStatus = profile?.identity_verification_status
          if (idStatus === 'approved' || profile?.is_live_verified) {
            return (
              <div className="rounded-2xl p-4 mb-5 border"
                style={{ backgroundColor:'rgba(122,158,126,0.08)', borderColor:'rgba(122,158,126,0.3)' }}>
                <p className="font-semibold text-sm" style={{ color:'#5C8060' }}> Identity Verified</p>
                <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>Your identity has been approved by DealMatch.</p>
              </div>
            )
          }
          if (idStatus === 'submitted') {
            return (
              <div className="rounded-2xl p-4 mb-5 border-2"
                style={{ backgroundColor:'rgba(212,168,83,0.06)', borderColor:'rgba(212,168,83,0.3)' }}>
                <p className="font-semibold text-sm mb-1" style={{ color:'#8A6A20' }}>⏳ Verification Under Review</p>
                <p className="text-xs leading-relaxed" style={{ color:'#8A7E78' }}>
                  Your ID and selfie have been submitted. Our team will review and notify you via WhatsApp within 24–48 hours.
                </p>
              </div>
            )
          }
          if (idStatus === 'rejected') {
            return (
              <div className="rounded-2xl p-4 mb-5 border-2"
                style={{ backgroundColor:'rgba(201,106,58,0.06)', borderColor:'rgba(201,106,58,0.3)' }}>
                <p className="font-semibold text-sm mb-1" style={{ color:'#C96A3A' }}> Verification Not Approved</p>
                {profile?.identity_rejection_note && (
                  <p className="text-xs mb-2 leading-relaxed" style={{ color:'#8A7E78' }}>
                    Reason: {profile.identity_rejection_note}
                  </p>
                )}
                <Link to="/verify-identity" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all"
                  style={{ backgroundColor:'#C96A3A', color:'#FFFFFF' }}>
                  <Shield size={14} /> Resubmit Verification
                </Link>
              </div>
            )
          }
          // Not submitted yet
          return (
            <div className="rounded-2xl p-4 mb-5 border-2"
              style={{ backgroundColor:'rgba(212,168,83,0.06)', borderColor:'rgba(212,168,83,0.3)' }}>
              <p className="font-semibold text-sm mb-1" style={{ color:'#1A1210' }}> Verify Your Identity</p>
              <p className="text-xs leading-relaxed mb-3" style={{ color:'#8A7E78' }}>
                Upload your government-issued ID and take a selfie. Required for full buy/sell access.
              </p>
              <Link to="/verify-identity" className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ backgroundColor:'#C96A3A', color:'#FFFFFF' }}>
                <Shield size={14} /> Verify My Identity
              </Link>
            </div>
          )
        })()}

        {/* Edit form */}
        <div className="rounded-2xl border mb-5" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor:'#E8DDD2' }}>
            <h3 className="font-display font-black text-base" style={{ color:'#1A1210' }}>Profile Details</h3>
            {editing ? (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                style={{ backgroundColor:'#C96A3A', color:'#FFFFFF' }}>
                <Save size={12} /> {saving ? 'Saving...' : 'Save'}
              </button>
            ) : (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ borderColor:'#E8DDD2', color:'#5C4A3A' }}>
                <Edit3 size={12} /> Edit
              </button>
            )}
          </div>

          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Full Name',  key:'full_name', type:'text',  placeholder:'Your full name' },
                { label:'Phone',      key:'phone',     type:'tel',   placeholder:'+234 800 000 0000' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                    style={{ color:'rgba(26,18,16,0.5)' }}>{field.label}</label>
                  <input type={field.type} value={form[field.key]} onChange={set(field.key)}
                    disabled={!editing} placeholder={field.placeholder} className="input text-sm"
                    style={{ backgroundColor: editing ? '#FFFFFF' : 'rgba(26,18,16,0.03)', color:'#1A1210' }} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(26,18,16,0.5)' }}>State</label>
                <select value={form.state} onChange={set('state')} disabled={!editing}
                  className="select text-sm"
                  style={{ backgroundColor: editing ? '#FFFFFF' : 'rgba(26,18,16,0.03)', color:'#1A1210' }}>
                  <option value="">Select state...</option>
                  {NIGERIAN_STATES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                  style={{ color:'rgba(26,18,16,0.5)' }}>City</label>
                <input type="text" value={form.city} onChange={set('city')}
                  disabled={!editing} placeholder="Your city" className="input text-sm"
                  style={{ backgroundColor: editing ? '#FFFFFF' : 'rgba(26,18,16,0.03)', color:'#1A1210' }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                style={{ color:'rgba(26,18,16,0.5)' }}>Bio</label>
              <textarea value={form.bio} onChange={set('bio')}
                disabled={!editing} placeholder="A short bio..." className="input text-sm min-h-[80px] py-2"
                style={{ backgroundColor: editing ? '#FFFFFF' : 'rgba(26,18,16,0.03)', color:'#1A1210' }} />
            </div>
          </div>
        </div>

        {/* Bank Details Section */}
        <div className="rounded-2xl border mb-5" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
          <div className="p-4 border-b flex items-center justify-between" style={{ borderColor:'#E8DDD2' }}>
            <h3 className="font-display font-black text-base" style={{ color:'#1A1210' }}>Bank Details </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[
                { label:'Bank Name',      key:'bank_name',      type:'text', placeholder:'e.g. Zenith Bank' },
                { label:'Account Name',   key:'account_name',   type:'text', placeholder:'Name on account' },
                { label:'Account Number', key:'account_number', type:'text', placeholder:'10 digits' },
                { label:'Routing/SWIFT',  key:'routing_number', type:'text', placeholder:'Optional' },
              ].map(field => (
                <div key={field.key}>
                  <label className="text-xs font-bold uppercase tracking-wider mb-1.5 block"
                    style={{ color:'rgba(26,18,16,0.5)' }}>{field.label}</label>
                  <input type={field.type} value={form[field.key]} onChange={set(field.key)}
                    disabled={!editing} placeholder={field.placeholder} className="input text-sm"
                    style={{ backgroundColor: editing ? '#FFFFFF' : 'rgba(26,18,16,0.03)', color:'#1A1210' }} />
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { to:'/dashboard',     icon: <LayoutDashboard size={20} className="text-terracotta" />, label:'Dashboard'    },
            { to:'/matches',       icon: <Heart size={20} className="text-terracotta" />,           label:'My Matches'   },
            { to:'/landlord',      icon: <Home size={20} className="text-terracotta" />,            label:'My Listings'  },
            { to:'/professionals', icon: <HardHat size={20} className="text-terracotta" />,         label:'Professionals'},
          ].map(({ to, icon, label }) => (
            <Link key={to} to={to}
              className="flex items-center gap-2 p-3.5 rounded-2xl border transition-all hover:-translate-y-0.5"
              style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
              <span className="flex-shrink-0">{icon}</span>
              <span className="text-sm font-semibold" style={{ color:'#1A1210' }}>{label}</span>
            </Link>
          ))}
        </div>

        {/* Sign out button */}
        <button onClick={handleSignOut} disabled={signingOut}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold border-2 transition-all"
          style={{ borderColor:'rgba(201,106,58,0.4)', color:'#C96A3A', backgroundColor:'rgba(201,106,58,0.05)' }}>
          <LogOut size={16} />
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </div>
  )
}
