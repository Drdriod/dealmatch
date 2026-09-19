// DealMatch Crypto Payment System
// Supports USDT + USDC across TRC20, BEP20, ERC20, Polygon
// Fixed USD charges: no Naira rate fluctuation
//
// Wallet addresses now live in the database (crypto_wallets table),
// editable from the superadmin Settings page - no more hardcoded
// placeholder strings or code deploys needed to update an address.

import { supabase } from '@/lib/supabase'

// Fixed USD charges per service: no Naira rate confusion
export const CRYPTO_CHARGES = {
  professional_surveyor:   15,
  professional_inspector:  21,
  professional_valuer:     18,
  professional_lawyer:     27,
  professional_lender:     45,
  professional_architect:  18,
  professional_agent:      12,
  professional_contractor: 15,
  rental_listing:          9,
  property_listing:        9,
  escrow_small:            3,   // under N500k
  escrow_medium:           5,   // N500k - N2M
  escrow_large:            10,  // above N2M
}

// Get escrow charge based on NGN deal size
export const getEscrowCharge = (ngnAmount) => {
  if (ngnAmount < 500000)  return CRYPTO_CHARGES.escrow_small
  if (ngnAmount < 2000000) return CRYPTO_CHARGES.escrow_medium
  return CRYPTO_CHARGES.escrow_large
}

/**
 * Loads all active crypto wallets from the database, shaped into
 * the same { KEY: { address, network, label, coin, icon, ... } }
 * object the rest of the app expects. Returns {} on any failure
 * so the calling component can safely treat crypto as unavailable
 * rather than crash.
 */
export const loadCryptoWallets = async () => {
  try {
    const { data, error } = await supabase
      .from('crypto_wallets')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) throw error

    const wallets = {}
    for (const row of data || []) {
      wallets[row.id] = {
        address:     row.address || '',
        network:     row.network,
        label:       row.coin + ' \u00b7 ' + row.network.split(' ')[0],
        coin:        row.coin,
        icon:        row.icon,
        color:       row.color,
        fee:         row.fee_label,
        feeFixed:    Number(row.fee_fixed) || 0,
        confirm:     row.confirm_label,
        recommended: row.recommended,
      }
    }
    return wallets
  } catch (err) {
    console.error('loadCryptoWallets error:', err.message)
    return {}
  }
}

// Total amount user must send = base + network fee
export const getTotalCharge = (baseAmount, networkKey, wallets) => {
  const wallet = wallets?.[networkKey]
  if (!wallet) return baseAmount
  return +(baseAmount + wallet.feeFixed).toFixed(2)
}

export const generateCryptoReference = () =>
  'DM-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase()

// Returns true only once at least one wallet has a real address
// configured in the database (not empty). Used by EscrowPage to
// hide the crypto payment option entirely until the superadmin has
// set up real wallet addresses from the Settings page.
export const isCryptoConfigured = async () => {
  try {
    const { data, error } = await supabase
      .from('crypto_wallets')
      .select('address')
      .eq('is_active', true)
      .not('address', 'eq', '')
      .limit(1)
    if (error) throw error
    return (data?.length || 0) > 0
  } catch (err) {
    console.error('isCryptoConfigured error:', err.message)
    return false
  }
}
