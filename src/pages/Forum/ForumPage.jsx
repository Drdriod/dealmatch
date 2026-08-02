import React, { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { MessageSquare, Eye, Pin, CheckCircle2, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const API_BASE = '/api/forum'

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

// ─── New thread composer ────────────────────────────────────────────────────
function NewThreadForm({ categorySlugPath, onCreated }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [threadType, setThreadType] = useState('DISCUSSION')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!isAuthenticated) { navigate('/auth'); return }
    if (!title.trim() || !body.trim()) { toast.error('Title and details are required'); return }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ categorySlug: categorySlugPath, title, body, threadType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create thread')
      toast.success('Posted!')
      setTitle(''); setBody(''); setOpen(false)
      onCreated?.(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary text-sm px-5 py-2.5 mb-6">
        Ask the community
      </button>
    )
  }

  return (
    <div className="mb-6 p-4 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
      <div className="flex gap-3 mb-3">
        {['DISCUSSION', 'QUESTION'].map(t => (
          <button key={t} onClick={() => setThreadType(t)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: threadType === t ? '#C96A3A' : '#FFFAF5',
              color: threadType === t ? '#fff' : '#8A7E78',
            }}>
            {t === 'QUESTION' ? 'Ask a question' : 'Start a discussion'}
          </button>
        ))}
      </div>
      <input
        value={title} onChange={e => setTitle(e.target.value)} maxLength={200}
        placeholder={threadType === 'QUESTION' ? 'e.g. How much is rent in Lekki for a 2-bedroom?' : "What's on your mind?"}
        className="w-full mb-2 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }}
      />
      <textarea
        value={body} onChange={e => setBody(e.target.value)} rows={4}
        placeholder="Details…"
        className="w-full mb-3 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }}
      />
      <div className="flex gap-2">
        <button onClick={submit} disabled={submitting} className="btn-primary text-sm px-5 py-2">
          {submitting ? 'Posting…' : 'Post'}
        </button>
        <button onClick={() => setOpen(false)} className="text-sm px-5 py-2 text-gray-500">Cancel</button>
      </div>
    </div>
  )
}

// ─── Reply composer ─────────────────────────────────────────────────────────
function ReplyForm({ threadId, onPosted }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!isAuthenticated) { navigate('/auth'); return }
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ threadId, body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not post reply')
      setBody('')
      onPosted?.(data)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4">
      <textarea
        value={body} onChange={e => setBody(e.target.value)} rows={3}
        placeholder={isAuthenticated ? 'Write a reply…' : 'Sign in to reply'}
        className="w-full mb-2 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }}
      />
      <button onClick={submit} disabled={submitting} className="btn-primary text-sm px-5 py-2">
        {submitting ? 'Posting…' : 'Reply'}
      </button>
    </div>
  )
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────
function Breadcrumb({ items }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-gray-500 mb-4 flex-wrap">
      <Link to="/forum" className="hover:underline">Forum</Link>
      {items.map((item, i) => (
        <React.Fragment key={item.slug}>
          <ChevronRight size={12} />
          <Link to={`/forum/${items.slice(0, i + 1).map(x => x.slug).join('/')}`} className="hover:underline">
            {item.name}
          </Link>
        </React.Fragment>
      ))}
    </nav>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ForumPage() {
  const location = useLocation()
  const [state, setState] = useState({ loading: true, data: null, error: null })

  const path = location.pathname.replace(/^\/forum\/?/, '')

  const load = useCallback(async () => {
    setState({ loading: true, data: null, error: null })
    try {
      const res = await fetch(`${API_BASE}/resolve?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      if (!res.ok) { setState({ loading: false, data: null, error: data.error || 'Not found' }); return }
      setState({ loading: false, data, error: null })
    } catch (err) {
      setState({ loading: false, data: null, error: 'Could not load forum content' })
    }
  }, [path])

  useEffect(() => { load() }, [load])

  if (state.loading) {
    return <div className="min-h-[50vh] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  }
  if (state.error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 pt-16">
        <h1 className="font-display text-2xl font-black" style={{ color: '#1A1210' }}>Not found</h1>
        <Link to="/forum" className="text-sm text-terracotta">Back to Forum</Link>
      </div>
    )
  }

  const { kind } = state.data

  if (kind === 'index') return <IndexView tree={state.data.tree} />
  if (kind === 'group') return <GroupView category={state.data.category} childCategories={state.data.children} />
  if (kind === 'category') return <CategoryView {...state.data} onCreated={load} />
  if (kind === 'thread') return <ThreadView {...state.data} onPosted={load} />
  return null
}

function IndexView({ tree }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-black mb-2" style={{ color: '#1A1210' }}>Ask the People Who've Actually Done the Deal</h1>
      <p className="text-sm text-gray-500 mb-8">Real questions about real estate, business services, logistics, events, and more — answered by people who've been through it, not a chatbot guessing.</p>
      <div className="grid gap-4">
        {tree.map(cat => (
          <div key={cat.slug} className="p-4 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
            <Link to={`/forum/${cat.slug}`} className="font-bold text-lg" style={{ color: '#1A1210' }}>{cat.tagline || cat.name}</Link>
            <p className="text-sm text-gray-500 mt-1">{cat.description}</p>
            {cat.children?.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {cat.children.map(child => (
                  <Link key={child.slug} to={`/forum/${cat.slug}/${child.slug}`}
                    className="text-xs px-3 py-1 rounded-full" style={{ background: '#FFFAF5', color: '#8A7E78' }}>
                    {child.tagline || child.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupView({ category, childCategories }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumb items={[category]} />
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#C96A3A' }}>{category.name}</p>
      <h1 className="font-display text-2xl font-black mb-2" style={{ color: '#1A1210' }}>{category.tagline || category.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{category.description}</p>
      <div className="grid gap-3">
        {childCategories.map(c => (
          <Link key={c.slug} to={`/forum/${category.slug}/${c.slug}`}
            className="p-4 rounded-2xl border flex items-center justify-between" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
            <div>
              <div className="font-semibold" style={{ color: '#1A1210' }}>{c.tagline || c.name}</div>
              <div className="text-xs text-gray-500">{c.description}</div>
            </div>
            <ChevronRight size={18} className="text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function CategoryView({ category, breadcrumb, threads, onCreated }) {
  const slugPath = breadcrumb.map(b => b.slug).join('/')
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumb items={breadcrumb.slice(1)} />
      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: '#C96A3A' }}>{category.name}</p>
      <h1 className="font-display text-2xl font-black mb-2" style={{ color: '#1A1210' }}>{category.tagline || category.name}</h1>
      <p className="text-sm text-gray-500 mb-6">{category.description}</p>
      <NewThreadForm categorySlugPath={slugPath} onCreated={onCreated} />
      {threads.length === 0 ? (
        <p className="text-sm text-gray-400">Nobody's asked yet. Be the first — someone else searching this exact question will thank you.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: '#E8DDD2' }}>
          {threads.map(t => (
            <Link key={t.id} to={`/forum/${slugPath}/${t.slug}`} className="flex items-center justify-between py-4">
              <div>
                <div className="flex items-center gap-2 font-semibold" style={{ color: '#1A1210' }}>
                  {t.is_pinned && <Pin size={14} className="text-terracotta" />}
                  {t.title}
                  {t.thread_type === 'QUESTION' && <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: '#FFFAF5', color: '#C96A3A' }}>Q</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">{timeAgo(t.last_activity_at)}</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><MessageSquare size={13} />{t.reply_count}</span>
                <span className="flex items-center gap-1"><Eye size={13} />{t.view_count}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function ThreadView({ category, breadcrumb, thread, posts, onPosted }) {
  const { user } = useAuth()
  const isAuthor = user?.id === thread.user_id
  const [localPosts, setLocalPosts] = useState(posts)

  const acceptAnswer = async (postId) => {
    try {
      const res = await fetch(`${API_BASE}/accept-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ threadId: thread.id, postId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Marked as accepted answer')
      onPosted?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <Breadcrumb items={[...breadcrumb.slice(1), thread]} />
      <article className="mb-8">
        <h1 className="font-display text-2xl font-black mb-3" style={{ color: '#1A1210' }}>{thread.title}</h1>
        <p className="text-sm whitespace-pre-wrap" style={{ color: '#3a2f2a' }}>{thread.body}</p>
      </article>
      <h2 className="text-sm font-bold text-gray-500 mb-3">{localPosts.length} repl{localPosts.length === 1 ? 'y' : 'ies'}</h2>
      <div className="space-y-4">
        {localPosts.map(p => (
          <div key={p.id} className="p-4 rounded-2xl border" style={{
            borderColor: p.id === thread.accepted_post_id ? '#7A9E7E' : '#E8DDD2',
            background: p.id === thread.accepted_post_id ? '#F3F8F3' : '#fff',
          }}>
            {p.id === thread.accepted_post_id && (
              <div className="flex items-center gap-1 text-xs font-semibold mb-2" style={{ color: '#7A9E7E' }}>
                <CheckCircle2 size={14} /> Accepted answer
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap" style={{ color: '#3a2f2a' }}>{p.body}</p>
            {isAuthor && thread.thread_type === 'QUESTION' && p.id !== thread.accepted_post_id && (
              <button onClick={() => acceptAnswer(p.id)} className="text-xs text-terracotta mt-2 font-semibold">
                Mark as accepted answer
              </button>
            )}
          </div>
        ))}
      </div>
      <ReplyForm threadId={thread.id} onPosted={(newPost) => setLocalPosts(p => [...p, newPost])} />
    </div>
  )
}
