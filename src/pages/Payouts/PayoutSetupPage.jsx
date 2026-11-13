/**
 * PayoutSetupPage - /payout-setup
 *
 * Exists for one reason: accept_bid() and request_withdrawal() both
 * require a status='verified' row in payout_accounts before they'll do
 * anything (see 20260910000002_payout_accounts.sql), and until this page,
 * there was no way for a provider to ever create that row. Without it,
 * no bid in the entire platform could ever be accepted.
 *
 * Verification is manual review (an admin checks the resolved account name
 * against what the provider submitted) via AdminPage's Payouts tab. Once
 * verified, payouts against this account are automated end-to-end - see
 * release_held_payment() / api/platform.js's cron-process-payouts resource.
 */
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Landmark, CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { fetchLatestPayoutAccount, submitPayoutAccount } from '@/data/payoutSetupRepository'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const STATUS_META = {
  pending:  { label: 'Under review',  color: '#D4A853', icon: Clock },
  verified: { label: 'Verified',      color: '#7A9E7E', icon: CheckCircle2 },
  rejected: { label: 'Needs changes', color: '#C94A3A', icon: XCircle },
}

export default function PayoutSetupPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading]   = useState(true)
  const [current, setCurrent]   = useState(null)
  const [banks, setBanks]               = useState([])
  const [bankText, setBankText]         = useState('')
  const [testMode, setTestMode]         = useState(false)
  const [accountNumber, setAccountNumber] = useState('')
  const [accountName, setAccountName]     = useState('')
  const [resolving, setResolving]       = useState(false)
  const [resolved, setResolved]         = useState(false)
  const [submitting, setSubmitting]     = useState(false)

  // The person types or picks a bank. An exact match gives us the bank's code (needed to confirm the
  // account name and to automate payouts); anything else is a manual entry that our team checks.
  const matchedBank = banks.find(b => b.name.toLowerCase() === bankText.trim().toLowerCase()) || null
  const bankCode = matchedBank?.code || ''
  const manual = bankText.trim().length > 0 && !matchedBank

  useEffect(() => { if (user?.id) load() }, [user?.id])
  useEffect(() => { loadBanks() }, [])

  // NEW: real bank list from Flutterwave (via /api/payout-banks), so a
  // submission carries the bank's actual Flutterwave code - required to
  // create a transfer recipient and automate payouts (item 8 of the fix
  // request). The old free-text "bank name" field had no way to ever
  // resolve to a code, which is part of why payouts could never be
  // automated before.
  async function loadBanks() {
    try {
      const res = await fetch('/api/payout-banks')
      const data = await res.json()
      setBanks(data.banks || [])
    } catch {
      setBanks([])
    }
  }

  async function load() {
    setLoading(true)
    const { data } = await fetchLatestPayoutAccount(user.id)
    setCurrent(data || null)
    setLoading(false)
  }

  // NEW: confirms the account number actually belongs to the name typed
  // in, via Flutterwave's account-resolve endpoint - catches typos before
  // submission instead of only at admin review time.
  async function handleResolve() {
    if (!bankCode || accountNumber.trim().length < 10) return
    setResolving(true)
    setResolved(false)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/payout-resolve-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ accountNumber: accountNumber.trim(), bankCode }),
      })
      const data = await res.json()
      if (data.resolved) {
        setAccountName(data.accountName)
        setResolved(true)
        setTestMode(Boolean(data.testMode))
        toast.success('Account confirmed: ' + data.accountName)
      } else {
        toast.error(data.error || 'We couldn\'t confirm this account. Check the number and bank.')
      }
    } catch {
      toast.error('We couldn\'t confirm this account right now. Please try again.')
    } finally {
      setResolving(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!bankText.trim() || accountNumber.trim().length < 10 || !accountName.trim() || (!manual && !resolved)) {
      toast.error(manual ? 'Fill in your bank, account number and account name.' : 'Pick your bank, then confirm your account number.')
      return
    }
    setSubmitting(true)
    const { data, error } = await submitPayoutAccount({
      bankName: matchedBank ? matchedBank.name : bankText.trim(),
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim(),
      bankCode: bankCode || null,
    })
    setSubmitting(false)
    if (error) {
      toast.error(error.message || 'We couldn\'t submit your bank details. Please try again.')
      return
    }
    toast.success('Submitted for review. We\u2019ll notify you once it\u2019s verified.')
    setCurrent(data)
    setBankText(''); setAccountNumber(''); setAccountName(''); setResolved(false)
  }

  const statusMeta = current ? STATUS_META[current.status] : null
  const StatusIcon = statusMeta?.icon

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: '#F7F4ED' }}>
      <div className="px-4 pt-4 pb-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FFF' }}>
          <ArrowLeft size={16} style={{ color: '#17211B' }} />
        </button>
        <h1 className="font-display text-lg font-black" style={{ color: '#17211B' }}>Payout account</h1>
      </div>

      <div className="px-4">
        <p className="text-sm mb-5" style={{ color: '#5C665F' }}>
          Add the bank account you want to be paid into. You'll need a verified account before you can accept paid jobs or request a withdrawal.
        </p>

        {!loading && current && (
          <div className="rounded-2xl p-4 mb-5" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold" style={{ color: '#17211B' }}>{current.bank_name}</p>
              <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: statusMeta.color + '22', color: statusMeta.color }}>
                {StatusIcon && <StatusIcon size={11} />} {statusMeta.label}
              </span>
            </div>
            <p className="text-xs" style={{ color: '#5C665F' }}>{current.account_name} · ****{current.account_number.slice(-4)}</p>
            {current.status === 'rejected' && current.rejected_reason && (
              <p className="text-xs mt-2" style={{ color: '#C94A3A' }}>{current.rejected_reason}</p>
            )}
            {current.status === 'pending' && (
              <p className="text-xs mt-2" style={{ color: '#5C665F' }}>Submitting a new form below replaces this pending request.</p>
            )}
          </div>
        )}

        {(!current || current.status !== 'verified') && (
          <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: '#FFF', border: '1px solid #DEDDD6' }}>
            <div className="flex items-center gap-2 mb-1">
              <Landmark size={15} style={{ color: '#B8511E' }} />
              <p className="text-sm font-semibold" style={{ color: '#17211B' }}>
                {current ? 'Submit new details' : 'Add your bank details'}
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#5C665F' }}>Bank</label>
              <input list="payout-banks" value={bankText}
                onChange={(e) => { setBankText(e.target.value); setResolved(false); setAccountName('') }}
                className="w-full rounded-lg px-3 py-2.5 text-sm bg-white" style={{ border: '1px solid #DEDDD6' }}
                placeholder="Type or pick your bank" autoComplete="off" />
              <datalist id="payout-banks">
                {banks.map(b => <option key={b.code} value={b.name} />)}
              </datalist>
              {manual && <p className="text-xs mt-1 text-stone-600">We don&apos;t recognise this bank name, so type your account name below exactly as your bank shows it. Our team will check it by hand.</p>}
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#5C665F' }}>Account number</label>
              <div className="flex gap-2">
                <input value={accountNumber} onChange={(e) => { setAccountNumber(e.target.value); setResolved(false) }}
                  className="flex-1 rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid #DEDDD6' }}
                  placeholder="0123456789" inputMode="numeric" maxLength={10} />
                <button type="button" onClick={handleResolve} disabled={resolving || !bankCode || accountNumber.trim().length < 10 || manual}
                  className="px-4 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
                  style={{ backgroundColor: '#17211B', color: '#FFF' }}>
                  {resolving ? <Loader2 size={14} className="animate-spin" /> : 'Confirm'}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1" style={{ color: '#5C665F' }}>Account name</label>
              <input value={accountName} readOnly={!manual}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm" style={{ border: '1px solid #DEDDD6', backgroundColor: resolved ? '#F3F8F3' : '#F5F0EA' }}
                placeholder={manual ? 'Account name as your bank shows it' : 'Tap Confirm above to fetch this automatically'} />
              {resolved && <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#7A9E7E' }}><CheckCircle2 size={12} /> Confirmed with your bank</p>}
              {resolved && testMode && <p className="text-xs mt-1 font-semibold text-red-700">Test mode: this name is sample data, not your real bank record.</p>}
            </div>
            <button type="submit" disabled={submitting || (!resolved && !manual) || (manual && (!accountName.trim() || accountNumber.trim().length < 10))}
              className="w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: '#17211B', color: '#FFF' }}>
              {submitting ? 'Submitting…' : (resolved || manual) ? 'Submit for verification' : 'Confirm your account first'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
