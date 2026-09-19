import React, { useState, useRef, useEffect } from 'react'
import { Award, Briefcase, Camera, Edit3, HardHat, Heart, Home, LayoutDashboard, LogOut, Save, Shield, ShieldCheck, User } from 'lucide-react'
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
  const [becomingProvider, setBecomingProvider] = useState(false)
  const [providerInfo, setProviderInfo] = useState(null) // { level, submission } once loaded
  const [loadingProvider, setLoadingProvider] = useState(true)

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

  // Provider section data: current tier + most recent Skill submission
  // (approved or otherwise), so someone who's already submitted evidence
  // sees what they submitted rather than a blank form every time.
  useEffect(() => {
    if (!user?.id || !profile?.offers_services) { setLoadingProvider(false); return }
    (async () => {
      const [{ data: vp }, { data: sub }] = await Promise.all([
        supabase.from('verified_providers').select('level, level_data').eq('user_id', user.id).maybeSingle(),
        supabase.from('verification_submissions').select('status, submission_data, created_at')
          .eq('user_id', user.id).eq('level', 2).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      setProviderInfo({ level: vp?.level || 0, submission: sub || null })
      setLoadingProvider(false)
    })()
  }, [user?.id, profile?.offers_services])

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

  // "Become a Provider" is a real, honest toggle (not inferred from
  // verification state) -- see 20260813000000_dashboard_profile_spec.sql.
  // Saying yes here never grants provider status by itself; it opens the
  // door to actually submitting evidence, which staff then review.
  const handleBecomeProvider = async () => {
    if (!user) return
    setBecomingProvider(true)
    const { error } = await supabase.from('profiles').update({ offers_services: true }).eq('id', user.id)
    setBecomingProvider(false)
    if (error) { toast.error('Could not save. Try again.'); return }
    await refreshProfile()
    toast.success("You're on your way to becoming a provider!")
    navigate('/verify-skill')
  }

  const verificationLevel =
    profile?.is_live_verified ? 'live' :
    profile?.avatar_url        ? 'photo' : 'none'

  const isProvider = !!profile?.offers_services
  const skillLevel = providerInfo?.level || 0
  const skillPending = providerInfo?.submission?.status === 'pending'

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
            {/* Email on its own line, smaller -- per spec, separate from role */}
            <p className="text-xs" style={{ color:'rgba(255,255,255,0.4)' }}>{user?.email}</p>

            {profile?.bio && (
              <p className="text-xs mt-2 max-w-xs" style={{ color:'rgba(255,255,255,0.55)' }}>{profile.bio}</p>
            )}

            {/* Verification badges -- Identity always shown; Skill only
                if the person is a provider, per spec 3.1 */}
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full"
                style={{
                  backgroundColor: verificationLevel === 'live'  ? 'rgba(122,158,126,0.2)'  :
                                    verificationLevel === 'photo' ? 'rgba(212,168,83,0.2)'   :
                                    'rgba(201,106,58,0.2)',
                  color:           verificationLevel === 'live'  ? '#7A9E7E' :
                                    verificationLevel === 'photo' ? '#D4A853' : '#C96A3A',
                }}>
                <Shield size={12} />
                <span className="text-xs font-bold">
                  {verificationLevel === 'live'  ? 'Identity Verified' :
                   verificationLevel === 'photo' ? 'Photo Uploaded' : 'Not Verified'}
                </span>
              </div>

              {isProvider && (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full"
                  style={{
                    backgroundColor: skillLevel >= 2 ? 'rgba(212,168,83,0.2)' : 'rgba(255,255,255,0.1)',
                    color:           skillLevel >= 2 ? '#D4A853' : 'rgba(255,255,255,0.5)',
                  }}>
                  <Award size={12} />
                  <span className="text-xs font-bold">
                    {skillLevel >= 3 ? 'Trusted Provider' : skillLevel >= 2 ? 'Skill Verified' : skillPending ? 'Skill: Under Review' : 'Skill Not Verified'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Identity verification status card */}
        {(() => {
          const idStatus = profile?.identity_verification_status
          if (idStatus === 'approved' || profile?.is_live_verified) {
            return (
              <div className="rounded-2xl p-4 mb-5 border flex items-center gap-2"
                style={{ backgroundColor:'rgba(122,158,126,0.08)', borderColor:'rgba(122,158,126,0.3)' }}>
                <ShieldCheck size={16} style={{ color:'#5C8060' }} />
                <p className="font-semibold text-sm" style={{ color:'#5C8060' }}>Identity Verified</p>
              </div>
            )
          }
          if (idStatus === 'submitted') {
            return (
              <div className="rounded-2xl p-4 mb-5 border"
                style={{ backgroundColor:'rgba(212,168,83,0.06)', borderColor:'rgba(212,168,83,0.3)' }}>
                <p className="font-semibold text-sm mb-1" style={{ color:'#8A6A20' }}>Verification under review</p>
                <p className="text-xs leading-relaxed" style={{ color:'#8A7E78' }}>
                  Your ID and selfie have been submitted. Our team will review and notify you here (and by email) within 24-48 hours.
                </p>
              </div>
            )
          }
          if (idStatus === 'rejected') {
            return (
              <div className="rounded-2xl p-4 mb-5 border-2"
                style={{ backgroundColor:'rgba(201,106,58,0.06)', borderColor:'rgba(201,106,58,0.3)' }}>
                <p className="font-semibold text-sm mb-1" style={{ color:'#C96A3A' }}>Verification not approved</p>
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
              <p className="font-semibold text-sm mb-1" style={{ color:'#1A1210' }}>Verify your identity</p>
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

        {/* Provider Section -- only shown if the person offers services or
            wants to. Reuses the most recent Skill submission's data so
            they see what they already told us, rather than a blank form. */}
        {isProvider && (
          <div className="rounded-2xl border mb-5" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor:'#E8DDD2' }}>
              <h3 className="font-display font-black text-base flex items-center gap-2" style={{ color:'#1A1210' }}>
                <Briefcase size={16} className="text-terracotta" /> Provider Details
              </h3>
              <Link to="/verify-skill" className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ borderColor:'#E8DDD2', color:'#5C4A3A' }}>
                <Edit3 size={12} /> {skillLevel >= 2 ? 'Update' : 'Submit'}
              </Link>
            </div>
            <div className="p-4">
              {loadingProvider ? (
                <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#C96A3A' }} /></div>
              ) : !providerInfo?.submission && skillLevel < 1 ? (
                <div className="text-center py-3">
                  <p className="text-xs mb-3" style={{ color:'#8A7E78' }}>
                    You haven't submitted proof of your skills yet. Add photos of your work to get Skill Verified and start appearing in Find a Provider.
                  </p>
                  <Link to="/verify-skill" className="btn-primary text-sm px-5 py-2.5 inline-flex">Submit Verification →</Link>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {providerInfo?.submission?.submission_data?.category && (
                    <div className="flex justify-between"><span style={{ color:'#8A7E78' }}>Category</span><span className="font-semibold" style={{ color:'#1A1210' }}>{providerInfo.submission.submission_data.category}</span></div>
                  )}
                  {providerInfo?.submission?.submission_data?.years_experience != null && (
                    <div className="flex justify-between"><span style={{ color:'#8A7E78' }}>Experience</span><span className="font-semibold" style={{ color:'#1A1210' }}>{providerInfo.submission.submission_data.years_experience} years</span></div>
                  )}
                  {form.city && (
                    <div className="flex justify-between"><span style={{ color:'#8A7E78' }}>Service area</span><span className="font-semibold" style={{ color:'#1A1210' }}>{form.city}{form.state ? `, ${form.state}` : ''}</span></div>
                  )}
                  {providerInfo?.submission?.submission_data?.portfolio_paths?.length > 0 && (
                    <div className="flex justify-between"><span style={{ color:'#8A7E78' }}>Portfolio</span><span className="font-semibold" style={{ color:'#1A1210' }}>{providerInfo.submission.submission_data.portfolio_paths.length} photo{providerInfo.submission.submission_data.portfolio_paths.length === 1 ? '' : 's'} submitted</span></div>
                  )}
                  {skillPending && (
                    <p className="text-xs mt-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(212,168,83,0.1)', color: '#8A6A20' }}>Your latest submission is under review.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bank Details */}
        <div className="rounded-2xl border mb-5" style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
          <div className="p-4 border-b" style={{ borderColor:'#E8DDD2' }}>
            <h3 className="font-display font-black text-base" style={{ color:'#1A1210' }}>Payout Details</h3>
            <p className="text-xs mt-0.5" style={{ color:'#8A7E78' }}>For receiving payments from completed deals</p>
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

        {/* Bottom Navigation / Actions */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { to:'/dashboard',        icon: <LayoutDashboard size={20} className="text-terracotta" />, label:'Dashboard'          },
            { to:'/manage-listings',  icon: <Home size={20} className="text-terracotta" />,            label:'My Listings'        },
            { to:'/matches',          icon: <Heart size={20} className="text-terracotta" />,           label:'My Requests / Matches' },
            ...(isProvider ? [] : [{ onClick: handleBecomeProvider, icon: <Briefcase size={20} className="text-terracotta" />, label: becomingProvider ? 'Saving…' : 'Become a Provider' }]),
          ].map(({ to, onClick, icon, label }) => (
            onClick ? (
              <button key={label} onClick={onClick} disabled={becomingProvider}
                className="flex items-center gap-2 p-3.5 rounded-2xl border transition-all hover:-translate-y-0.5 disabled:opacity-60"
                style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
                <span className="flex-shrink-0">{icon}</span>
                <span className="text-sm font-semibold" style={{ color:'#1A1210' }}>{label}</span>
              </button>
            ) : (
              <Link key={to} to={to}
                className="flex items-center gap-2 p-3.5 rounded-2xl border transition-all hover:-translate-y-0.5"
                style={{ backgroundColor:'#FFFAF5', borderColor:'#E8DDD2' }}>
                <span className="flex-shrink-0">{icon}</span>
                <span className="text-sm font-semibold" style={{ color:'#1A1210' }}>{label}</span>
              </Link>
            )
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
