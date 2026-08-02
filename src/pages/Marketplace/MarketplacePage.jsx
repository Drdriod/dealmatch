import React, { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Search, MapPin, ChevronRight, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const API_BASE = '/api'
const INTENT_LABELS = {
  SERVICE: 'Need a Service',
  ASSET: 'Buy or Rent',
  SUPPLY_DEMAND: 'Get Matched',
}

async function authHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

function formatPrice(cents) {
  if (cents == null) return null
  return `₦${(cents / 100).toLocaleString()}`
}

// ─── Schema-driven field renderer, used by both the composer and the filter bar ──
function SchemaField({ name, schema, value, onChange }) {
  const label = name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  if (schema.enum) {
    return (
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#8A7E78' }}>{label}</label>
        <select value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}
          className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }}>
          <option value="">Any</option>
          {schema.enum.map(opt => <option key={opt} value={opt}>{String(opt).replace(/_/g, ' ')}</option>)}
        </select>
      </div>
    )
  }
  if (schema.type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm" style={{ color: '#3a2f2a' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        {label}
      </label>
    )
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    return (
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#8A7E78' }}>{label}</label>
        <input type="number" value={value ?? ''} min={schema.minimum} max={schema.maximum}
          onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
      </div>
    )
  }
  if (schema.type === 'array') {
    return (
      <div>
        <label className="block text-xs font-semibold mb-1" style={{ color: '#8A7E78' }}>{label}</label>
        <input type="text" placeholder="Comma-separated" value={(value || []).join(', ')}
          onChange={e => onChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
          className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
      </div>
    )
  }
  return (
    <div>
      <label className="block text-xs font-semibold mb-1" style={{ color: '#8A7E78' }}>{label}</label>
      <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value || undefined)}
        className="w-full px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
    </div>
  )
}

// ─── Universal search bar ───────────────────────────────────────────────────
function SearchBar({ autoFocus }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/marketplace/search?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <form onSubmit={submit} className="flex gap-2 mb-8">
      <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
        <Search size={18} className="text-gray-400" />
        <input autoFocus={autoFocus} value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search everything: a flat, a plumber, a truck, a lawyer..."
          className="flex-1 outline-none text-sm" />
      </div>
      <button type="submit" className="btn-primary px-6">Search</button>
    </form>
  )
}

// ─── Search results view ────────────────────────────────────────────────────
function SearchResultsView({ query }) {
  const [state, setState] = useState({ loading: true, results: [] })

  useEffect(() => {
    if (!query) { setState({ loading: false, results: [] }); return }
    setState({ loading: true, results: [] })
    fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => setState({ loading: false, results: data.results || [] }))
      .catch(() => setState({ loading: false, results: [] }))
  }, [query])

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <SearchBar />
      <h1 className="font-display text-xl font-black mb-1" style={{ color: '#1A1210' }}>
        Results for "{query}"
      </h1>
      {state.loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8"><Loader2 size={16} className="animate-spin" /> Searching...</div>
      ) : state.results.length === 0 ? (
        <p className="text-sm text-gray-400 py-8">Nothing matched that search. Try a broader term.</p>
      ) : (
        <div className="divide-y mt-4" style={{ borderColor: '#E8DDD2' }}>
          {state.results.map(r => (
            <Link key={`${r.source}-${r.item_id}`} to={r.url_path} className="flex items-center justify-between py-4">
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: '#C96A3A' }}>{r.category_name}</div>
                <div className="font-semibold" style={{ color: '#1A1210' }}>{r.title}</div>
                <div className="text-xs text-gray-400 mt-1">{r.snippet}</div>
              </div>
              <div className="text-right">
                {r.price_cents != null && <div className="text-sm font-bold" style={{ color: '#1A1210' }}>{formatPrice(r.price_cents)}</div>}
                {r.location_name && <div className="text-xs text-gray-400 flex items-center gap-1 justify-end"><MapPin size={11} />{r.location_name}</div>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Marketplace index: search + categories grouped by intent ──────────────
function IndexView() {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    fetch(`${API_BASE}/categories`).then(r => r.json()).then(d => setCategories(d.categories || []))
  }, [])

  const groups = ['SERVICE', 'ASSET', 'SUPPLY_DEMAND'].map(intent => ({
    intent,
    label: INTENT_LABELS[intent],
    items: categories.filter(c => c.intent_filter === intent),
  })).filter(g => g.items.length > 0)

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-black mb-2" style={{ color: '#1A1210' }}>Tell Us What You Need</h1>
      <p className="text-sm text-gray-500 mb-6">Search across every category, or browse by what you're trying to do.</p>
      <SearchBar autoFocus />
      {groups.map(g => (
        <div key={g.intent} className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#C96A3A' }}>{g.label}</h2>
          <div className="grid gap-2">
            {g.items.map(c => (
              <Link key={c.slug} to={`/marketplace/${c.slug}`}
                className="p-4 rounded-2xl border flex items-center justify-between" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
                <span className="font-semibold text-sm" style={{ color: '#1A1210' }}>{c.name}</span>
                <ChevronRight size={16} className="text-gray-300" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Category browse: schema-driven filters + results ──────────────────────
function CategoryBrowseView({ categorySlug }) {
  const [category, setCategory] = useState(null)
  const [filters, setFilters] = useState({})
  const [type, setType] = useState('SUPPLY')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API_BASE}/categories/${categorySlug}`).then(r => r.json()).then(setCategory)
  }, [categorySlug])

  const runSearch = useCallback(async () => {
    if (!category?.id) return
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/category-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({ categoryId: category.id, type, attributeFilter: filters }),
      })
      const data = await res.json()
      setResults(data.matches || [])
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [category, type, filters])

  useEffect(() => { runSearch() }, [runSearch])

  const properties = category?.attribute_schema?.properties || {}

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <SearchBar />
      <h1 className="font-display text-2xl font-black mb-1" style={{ color: '#1A1210' }}>{category?.name || '...'}</h1>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2">
          {['SUPPLY', 'DEMAND'].map(t => (
            <button key={t} onClick={() => setType(t)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: type === t ? '#C96A3A' : '#FAF6F0', color: type === t ? '#fff' : '#8A7E78' }}>
              {t === 'SUPPLY' ? 'Available now' : 'Looking for'}
            </button>
          ))}
        </div>
        <Link to={`/marketplace/${categorySlug}/new`} className="btn-primary text-sm px-5 py-2">Post a listing</Link>
      </div>

      {Object.keys(properties).length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6 p-4 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
          {Object.entries(properties).map(([name, schema]) => (
            <SchemaField key={name} name={name} schema={schema} value={filters[name]}
              onChange={v => setFilters(f => ({ ...f, [name]: v }))} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8"><Loader2 size={16} className="animate-spin" /> Loading...</div>
      ) : results.length === 0 ? (
        <p className="text-sm text-gray-400 py-8">No listings match yet. Be the first to post one.</p>
      ) : (
        <div className="grid gap-3">
          {results.map(item => (
            <Link key={item.id} to={`/marketplace/${categorySlug}/listing/${item.id}`}
              className="p-4 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
              <div className="font-semibold" style={{ color: '#1A1210' }}>{item.title}</div>
              {item.price_cents != null && <div className="text-sm font-bold mt-1" style={{ color: '#C96A3A' }}>{formatPrice(item.price_cents)}</div>}
              {item.location_name && <div className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={11} />{item.location_name}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Listing composer: schema-driven form ───────────────────────────────────
function NewListingView({ categorySlug }) {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [category, setCategory] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priceCents, setPriceCents] = useState('')
  const [locationName, setLocationName] = useState('')
  const [type, setType] = useState('SUPPLY')
  const [attributes, setAttributes] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetch(`${API_BASE}/categories/${categorySlug}`).then(r => r.json()).then(setCategory)
  }, [categorySlug])

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <p className="text-sm text-gray-500 mb-4">Sign in to post a listing.</p>
        <button onClick={() => navigate('/auth')} className="btn-primary px-6 py-2">Sign In</button>
      </div>
    )
  }

  const properties = category?.attribute_schema?.properties || {}
  const required = category?.attribute_schema?.required || []

  const submit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return }
    const missing = required.filter(r => attributes[r] === undefined || attributes[r] === '')
    if (missing.length > 0) { toast.error(`Missing required field: ${missing[0]}`); return }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_BASE}/listings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          categoryId: category.id, type, title, description,
          priceCents: priceCents ? Math.round(Number(priceCents) * 100) : undefined,
          locationName, attributes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not create listing')
      toast.success('Listing posted')
      navigate(`/marketplace/${categorySlug}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl font-black mb-1" style={{ color: '#1A1210' }}>Post to {category?.name || '...'}</h1>
      <p className="text-sm text-gray-500 mb-6">Fill in what you have, or what you need.</p>

      <div className="flex gap-2 mb-4">
        {['SUPPLY', 'DEMAND'].map(t => (
          <button key={t} onClick={() => setType(t)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: type === t ? '#C96A3A' : '#FAF6F0', color: type === t ? '#fff' : '#8A7E78' }}>
            {t === 'SUPPLY' ? 'I have this to offer' : 'I need this'}
          </button>
        ))}
      </div>

      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" maxLength={255}
        className="w-full mb-3 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" rows={3}
        className="w-full mb-3 px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input value={priceCents} onChange={e => setPriceCents(e.target.value)} type="number" placeholder="Price (NGN, optional)"
          className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
        <input value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Location"
          className="px-3 py-2 rounded-xl border text-sm" style={{ borderColor: '#E8DDD2' }} />
      </div>

      {Object.keys(properties).length > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-4 p-4 rounded-2xl border" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
          {Object.entries(properties).map(([name, schema]) => (
            <SchemaField key={name} name={name} schema={schema} value={attributes[name]}
              onChange={v => setAttributes(a => ({ ...a, [name]: v }))} />
          ))}
        </div>
      )}

      <button onClick={submit} disabled={submitting} className="btn-primary px-6 py-2.5">
        {submitting ? 'Posting...' : 'Post listing'}
      </button>
    </div>
  )
}

// ─── Listing detail ──────────────────────────────────────────────────────────
function ListingDetailView({ id }) {
  const [state, setState] = useState({ loading: true, listing: null, category: null })

  useEffect(() => {
    fetch(`${API_BASE}/listings/${id}`)
      .then(r => r.json())
      .then(data => setState({ loading: false, listing: data.listing, category: data.category }))
      .catch(() => setState({ loading: false, listing: null, category: null }))
  }, [id])

  if (state.loading) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">Loading...</div>
  if (!state.listing) return <div className="max-w-2xl mx-auto px-4 py-16 text-center text-gray-400 text-sm">Listing not found.</div>

  const { listing } = state
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <p className="text-xs font-semibold mb-1" style={{ color: '#C96A3A' }}>{state.category?.name}</p>
      <h1 className="font-display text-2xl font-black mb-2" style={{ color: '#1A1210' }}>{listing.title}</h1>
      {listing.price_cents != null && <p className="text-lg font-bold mb-3" style={{ color: '#1A1210' }}>{formatPrice(listing.price_cents)}</p>}
      <p className="text-sm mb-4" style={{ color: '#3a2f2a' }}>{listing.description}</p>
      {listing.location_name && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} />{listing.location_name}</p>}
      {Object.entries(listing.attributes || {}).length > 0 && (
        <div className="mt-6 p-4 rounded-2xl border grid grid-cols-2 gap-3" style={{ borderColor: '#E8DDD2', background: '#fff' }}>
          {Object.entries(listing.attributes).map(([k, v]) => (
            <div key={k}>
              <div className="text-xs text-gray-400">{k.replace(/_/g, ' ')}</div>
              <div className="text-sm font-semibold" style={{ color: '#1A1210' }}>{Array.isArray(v) ? v.join(', ') : String(v)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Router ──────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const location = useLocation()
  const path = location.pathname.replace(/^\/marketplace\/?/, '')
  const segments = path.split('/').filter(Boolean)
  const searchParams = new URLSearchParams(location.search)

  if (segments.length === 0) return <IndexView />
  if (segments[0] === 'search') return <SearchResultsView query={searchParams.get('q') || ''} />
  if (segments.length === 1) return <CategoryBrowseView categorySlug={segments[0]} />
  if (segments.length === 2 && segments[1] === 'new') return <NewListingView categorySlug={segments[0]} />
  if (segments.length === 3 && segments[1] === 'listing') return <ListingDetailView id={segments[2]} />

  return <div className="max-w-md mx-auto px-4 py-16 text-center text-gray-400 text-sm">Not found.</div>
}
