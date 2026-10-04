import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Check, ChevronDown, ChevronUp, Copy, Gem, Search, User, X } from 'lucide-react'
import { loadCryptoWallets, getTotalCharge, generateCryptoReference } from '@/lib/crypto-payment'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { sanitizeText } from '@/lib/sanitize'
import toast from 'react-hot-toast'
import { CRYPTO_PAYMENTS_ENABLED } from '@/lib/features'

const WHATSAPP = '2347057392060'

// ── Coin toggle ───────────────────────────────────────────
const COINS = ['USDT', 'USDC']
const NETWORKS_BY_COIN = {
  USDT: ['USDT_TRC20', 'USDT_BEP20', 'USDT_POLYGON', 'USDT_ERC20'],
  USDC: ['USDC_TRC20', 'USDC_BEP20', 'USDC_POLYGON', 'USDC_ERC20'],
}

// ── Network row component ─────────────────────────────────
function NetworkRow({ netKey, selected, onSelect, baseAmount, wallets }) {
  const w     = wallets[netKey]
  const total = getTotalCharge(baseAmount, netKey, wallets)
  if (!w) return null
  return (
    <button
      onClick={() => onSelect(netKey)}
      className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-all"
      style={{
        borderColor:       selected ? w.color : '#E8DDD2',
        backgroundColor:   selected ? `${w.color}08` : '#FFFFFF',
      }}
    >
      <span className="text-xl">{w.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm" style={{ color: '#1A1210' }}>{w.network}</p>
          {w.recommended && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(122,158,126,0.15)', color: '#7A9E7E' }}>
              Recommended
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: '#8A7E78' }}>{w.fee} · {w.confirm}</p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-sm" style={{ color: w.color }}>
          {total} {w.coin}
        </p>
        {w.feeFixed > 0 && (
          <p className="text-[10px]" style={{ color: '#8A7E78' }}>
            +${w.feeFixed} fee
          </p>
        )}
      </div>
      {selected && (
        <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: w.color }}>
          <Check size={11} color="white" />
        </div>
      )}
    </button>
  )
}

// ── Main Component ────────────────────────────────────────
function CryptoPaymentInner({
  usdtAmount,
  description,
  metadata = {},
  onClose,
  onConfirmed,
}) {
  const { user, profile }         = useAuth()
  const [coin, setCoin]           = useState('USDT')
  const [selectedNet, setNet]     = useState('USDT_TRC20')
  const [copied, setCopied]       = useState(false)
  const [step, setStep]           = useState('select')
  const [txHash, setTxHash]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [wallets, setWallets]     = useState(null) // null while loading

  useEffect(() => {
    loadCryptoWallets().then(loaded => {
      setWallets(loaded)
      // Default to the recommended/first wallet that actually has a
      // real address configured, rather than always assuming TRC20.
      const firstReady = Object.entries(loaded).find(([, w]) => w.address)
      if (firstReady) {
        setNet(firstReady[0])
        setCoin(firstReady[1].coin)
      }
    })
  }, [])

  const reference = useState(() => generateCryptoReference())[0]
  const wallet    = wallets ? wallets[selectedNet] : null
  const total     = wallets ? getTotalCharge(usdtAmount, selectedNet, wallets) : usdtAmount

  const handleCoinSwitch = (c) => {
    setCoin(c)
    setNet(c === 'USDT' ? 'USDT_TRC20' : 'USDC_TRC20')
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.address)
    setCopied(true)
    toast.success('Wallet address copied!')
    setTimeout(() => setCopied(false), 2500)
  }

  const handleSubmit = async () => {
    const cleanHash = sanitizeText(txHash.trim())
    if (!cleanHash || cleanHash.length < 10) {
      toast.error('Please enter a valid transaction hash')
      return
    }
    setSubmitting(true)
    try {
      await supabase.from('crypto_payments').insert({
        user_id:      user?.id    || null,
        user_name:    sanitizeText(profile?.full_name || 'Guest'),
        user_phone:   profile?.phone || '',
        user_email:   user?.email || '',
        reference,
        description:  sanitizeText(description),
        coin:         wallet.coin,
        usdt_amount:  usdtAmount,
        total_amount: total,
        network:      selectedNet,
        network_label: wallet.network,
        wallet_addr:  wallet.address,
        tx_hash:      cleanHash,
        status:       'pending',
        metadata:     JSON.stringify(metadata),
        created_at:   new Date().toISOString(),
      })
    } catch (err) {
      console.warn('Crypto DB save error (non-blocking):', err.message)
    }

    // Notify admin via WhatsApp
    const msg = encodeURIComponent(
      `*Crypto Payment: DealMatch*\n\n` +
      `Reference: ${reference}\n` +
      `Service: ${description}\n` +
      `Amount: ${total} ${wallet.coin}\n` +
      `Network: ${wallet.network}\n` +
      `TX Hash: ${cleanHash}\n\n` +
      `User: ${profile?.full_name || 'Guest'}\n` +
      `Phone: ${profile?.phone || 'N/A'}\n\n` +
      `Please verify on-chain and confirm in Admin Panel.`
    )
    window.open('https://wa.me/' + WHATSAPP + '?text=' + msg, '_blank')

    setSubmitting(false)
    setStep('pending')
    onConfirmed?.({ reference, txHash: cleanHash, network: selectedNet, coin: wallet.coin, amount: total })
  }

  // Wallets still loading from the database - show a lightweight loading
  // state instead of risking a crash on wallet.xxx access below.
  if (wallets === null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(26,18,16,0.88)', backdropFilter: 'blur(10px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="rounded-3xl p-8 text-center" style={{ backgroundColor: '#FFFAF5' }}>
          <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin mx-auto mb-3"
            style={{ borderTopColor: '#C96A3A' }} />
          <p className="text-sm" style={{ color: '#8A7E78' }}>Loading payment options...</p>
        </div>
      </div>
    )
  }

  // No active, configured wallet found for the currently selected network -
  // crypto payments are not ready yet. This should rarely show since
  // EscrowPage already gates the entry point with isCryptoConfigured().
  if (!wallet) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(26,18,16,0.88)', backdropFilter: 'blur(10px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="rounded-3xl p-8 text-center max-w-xs" style={{ backgroundColor: '#FFFAF5' }}>
          <div className="flex justify-center mb-3"><Gem size={36} className="text-blue-500" /></div>
          <p className="text-sm font-semibold mb-2" style={{ color: '#1A1210' }}>Crypto payment unavailable</p>
          <p className="text-xs mb-4" style={{ color: '#8A7E78' }}>Please pay with card or bank transfer instead.</p>
          <button onClick={onClose} className="btn-primary w-full py-3 text-sm">Close</button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(26,18,16,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl overflow-hidden"
        style={{ backgroundColor: '#FFFAF5', maxHeight: '92vh', overflowY: 'auto' }}
      >

        {/* Header */}
        <div className="p-5 border-b flex items-center justify-between"
          style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: '#1A1210' }}>
          <div className="flex items-center gap-3">
            <Gem size={24} className="text-blue-500" />
            <div>
              <h3 className="font-display text-lg font-black text-white">Pay with Crypto</h3>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                USDT / USDC Stablecoin
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <X size={14} color="white" />
          </button>
        </div>

        <div className="p-5">

          {/* Amount display */}
          <div className="rounded-2xl p-4 mb-4 text-center"
            style={{ backgroundColor: 'rgba(26,18,16,0.04)', border: '1px solid #E8DDD2' }}>
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#8A7E78' }}>
              Fixed Service Charge
            </p>
            <p className="font-display font-black text-4xl" style={{ color: '#C96A3A' }}>
              {usdtAmount} <span className="text-xl">USD</span>
            </p>
            <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>{description}</p>
            {wallet.feeFixed > 0 && (
              <p className="text-xs mt-1 font-medium" style={{ color: '#C96A3A' }}>
                + ${wallet.feeFixed} network fee = <strong>{total} {wallet.coin}</strong> total
              </p>
            )}
          </div>

          {/* Coin toggle */}
          {step === 'select' && (
            <>
              <div className="flex rounded-xl overflow-hidden border mb-4"
                style={{ borderColor: '#E8DDD2' }}>
                {COINS.map(c => (
                  <button key={c} onClick={() => handleCoinSwitch(c)}
                    className="flex-1 py-2.5 text-sm font-bold transition-all"
                    style={{
                      backgroundColor: coin === c ? '#1A1210' : '#FFFFFF',
                      color:           coin === c ? '#FFFAF5' : '#8A7E78',
                    }}>
                    {c}
                  </button>
                ))}
              </div>

              <p className="text-xs font-bold uppercase tracking-wider mb-3"
                style={{ color: 'rgba(26,18,16,0.5)' }}>
                Choose Network
              </p>
              <div className="space-y-2 mb-5">
                {NETWORKS_BY_COIN[coin].map(netKey => (
                  <NetworkRow
                    key={netKey}
                    netKey={netKey}
                    selected={selectedNet === netKey}
                    onSelect={setNet}
                    baseAmount={usdtAmount}
                    wallets={wallets}
                  />
                ))}
              </div>

              {/* Fee note */}
              <div className="rounded-xl p-3 mb-5 flex items-start gap-2"
                style={{ backgroundColor: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)' }}>
                <AlertCircle size={13} style={{ color: '#8A6A20', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#8A6A20' }}>
                  Network fees are deducted from your wallet by the blockchain: not by DealMatch.
                  <strong> TRC20 has near-zero fees</strong> and is recommended.
                </p>
              </div>

              <button onClick={() => setStep('pay')} className="btn-primary w-full py-4">
                Continue → Send {total} {wallet.coin}
              </button>
            </>
          )}

          {step === 'pay' && (
            <div>
              {/* Wallet address */}
              <div className="rounded-2xl border overflow-hidden mb-4" style={{ borderColor: '#E8DDD2' }}>
                <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2"
                  style={{ backgroundColor: `${wallet.color}10`, color: wallet.color }}>
                  <span><Gem size={18} className="text-terracotta" /></span>
                  Send {total} {wallet.coin} on {wallet.network}
                </div>
                <div className="p-4">
                  <p className="font-mono text-xs break-all mb-3 select-all leading-relaxed"
                    style={{ color: '#1A1210' }}>
                    {wallet.address}
                  </p>
                  <button onClick={copyAddress}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: copied ? 'rgba(122,158,126,0.1)' : 'rgba(26,18,16,0.06)',
                      color:           copied ? '#7A9E7E' : '#5C4A3A',
                    }}>
                    {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy Address</>}
                  </button>
                </div>
              </div>

              {/* Amount summary */}
              <div className="rounded-2xl p-3 mb-3 text-sm space-y-1.5"
                style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
                <div className="flex justify-between">
                  <span style={{ color: '#8A7E78' }}>Service charge</span>
                  <strong style={{ color: '#1A1210' }}>{usdtAmount} {wallet.coin}</strong>
                </div>
                {wallet.feeFixed > 0 && (
                  <div className="flex justify-between">
                    <span style={{ color: '#8A7E78' }}>Network fee</span>
                    <strong style={{ color: '#C96A3A' }}>+${wallet.feeFixed}</strong>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5" style={{ borderColor: '#E8DDD2' }}>
                  <span className="font-bold" style={{ color: '#1A1210' }}>Total to send</span>
                  <strong style={{ color: wallet.color, fontSize: '1rem' }}>{total} {wallet.coin}</strong>
                </div>
              </div>

              {/* Memo reference */}
              <div className="rounded-2xl p-3 mb-4"
                style={{ backgroundColor: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.25)' }}>
                <p className="text-xs font-bold mb-1" style={{ color: '#8A6A20' }}>
                  Add this as memo/note in your wallet
                </p>
                <p className="font-mono text-sm font-bold" style={{ color: '#1A1210' }}>{reference}</p>
              </div>

              <div className="flex items-start gap-2 rounded-xl p-3 mb-5"
                style={{ backgroundColor: 'rgba(201,106,58,0.06)', border: '1px solid rgba(201,106,58,0.2)' }}>
                <AlertCircle size={13} style={{ color: '#C96A3A', flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs" style={{ color: '#C96A3A' }}>
                  Send <strong>{wallet.coin} only</strong> on <strong>{wallet.network}</strong>.
                  Wrong coin or wrong network = permanently lost funds.
                </p>
              </div>

              <button onClick={() => setStep('confirm')} className="btn-primary w-full py-4 mb-2">
                I've Sent the Payment →
              </button>
              <button onClick={() => setStep('select')}
                className="w-full py-3 rounded-2xl text-sm font-semibold"
                style={{ backgroundColor: 'rgba(26,18,16,0.05)', color: '#8A7E78' }}>
                ← Change Network
              </button>
            </div>
          )}

          {step === 'confirm' && (
            <div>
              <div className="text-center mb-5">
                <div className="flex justify-center mb-2"><Search size={40} className="text-terracotta" /></div>
                <h4 className="font-display font-black text-lg" style={{ color: '#1A1210' }}>
                  Submit TX Hash
                </h4>
                <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>
                  Enter your transaction ID so we can verify on-chain.
                </p>
              </div>

              <div className="mb-4">
                <label className="text-xs font-bold uppercase tracking-wider mb-2 block"
                  style={{ color: 'rgba(26,18,16,0.5)' }}>Transaction Hash *</label>
                <input className="input text-sm font-mono" type="text"
                  placeholder="0x1a2b3c... or TXID..."
                  value={txHash} onChange={e => setTxHash(e.target.value)}
                  style={{ backgroundColor: '#FFFFFF', color: '#1A1210' }} />
                <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>
                  Find this in your wallet's transaction history.
                </p>
              </div>

              {/* Confirmation summary */}
              <div className="rounded-2xl p-3 mb-5 space-y-1.5 text-sm"
                style={{ backgroundColor: 'rgba(26,18,16,0.03)', border: '1px solid #E8DDD2' }}>
                <div className="flex justify-between">
                  <span style={{ color: '#8A7E78' }}>Total sent</span>
                  <strong style={{ color: wallet.color }}>{total} {wallet.coin}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#8A7E78' }}>Network</span>
                  <strong style={{ color: '#1A1210' }}>{wallet.network}</strong>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#8A7E78' }}>Reference</span>
                  <strong style={{ color: '#C96A3A', fontSize: '0.65rem' }}>{reference}</strong>
                </div>
              </div>

              <button onClick={handleSubmit}
                disabled={submitting || txHash.trim().length < 10}
                className="btn-primary w-full py-4 mb-2"
                style={{ opacity: txHash.trim().length >= 10 ? 1 : 0.5 }}>
                {submitting ? 'Submitting...' : 'Submit for Verification →'}
              </button>
              <p className="text-xs text-center" style={{ color: '#8A7E78' }}>
                Verified within 30 min. You'll be notified on WhatsApp.
              </p>
            </div>
          )}

          {step === 'pending' && (
            <div className="text-center py-6">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <div className="text-5xl mb-4">⏳</div>
              </motion.div>
              <h4 className="font-display font-black text-xl mb-2" style={{ color: '#1A1210' }}>
                Payment Pending
              </h4>
              <p className="text-sm mb-3" style={{ color: '#8A7E78' }}>
                DealMatch is verifying your transaction on {wallet.network}.
              </p>
              <div className="rounded-2xl p-3 mb-5"
                style={{ backgroundColor: 'rgba(212,168,83,0.08)', border: '1px solid rgba(212,168,83,0.2)' }}>
                <p className="text-xs font-bold" style={{ color: '#8A6A20' }}>Reference: {reference}</p>
                <p className="text-xs mt-1" style={{ color: '#8A7E78' }}>
                  Save this. You'll be notified on WhatsApp within 30 minutes once confirmed.
                </p>
              </div>
              <button onClick={onClose} className="btn-primary w-full py-3">Done</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// Crypto is on hold (see src/lib/features.js): render nothing unless explicitly enabled.
export default function CryptoPayment(props) {
  if (!CRYPTO_PAYMENTS_ENABLED) return null
  return <CryptoPaymentInner {...props} />
}
