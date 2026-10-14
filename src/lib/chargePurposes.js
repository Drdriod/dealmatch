// Server-side handling of a confirmed charge, one handler per payment purpose.
//
// Used only by api/flutterwave-webhook.js (charge.success). Each handler runs
// only when metadata.type matches its purpose, and every handler resolves its
// row by a server-side reference, never by client metadata alone.
//
// A handler returns:
//   { stop: true }            the webhook must not write the payments log or pay referrals
//   { escrowRow }             escrow_payment only: the row used for the referral step
//   undefined                 continue as normal
//
// Every money write is either conditional on the current status or deduplicated
// by a key, so a repeated webhook cannot grant or record twice.
import { insertNotification } from './notificationFactory.js'

// Records money DealMatch holds and must return: an overpayment (after the item
// is granted) or an underpayment (held until topped up or refunded). One row per
// payment and reason, so a repeated webhook cannot duplicate it.
export async function recordMoneyToReturn(svc, row, amountKobo, reason, note, dedupeKey) {
  const now = new Date().toISOString()
  let error = null
  if (reason === 'underpaid') {
    // The held amount grows with each top-up, but only while still outstanding:
    // a row already returned or resolved is never reopened.
    const { data: open } = await svc.from('payment_refunds')
      .update({ amount_kobo: amountKobo, updated_at: now, note })
      .eq('dedupe_key', dedupeKey).eq('status', 'to_refund').select('id')
    if (!open?.length) {
      // No open row: create it, unless a returned row already exists (23505), which stays as it is.
      const { error: insErr } = await svc.from('payment_refunds').insert({
        dedupe_key: dedupeKey, reference: row.reference, reason, payer_email: row.email,
        profile_id: row.profile_id || null, amount_kobo: amountKobo, status: 'to_refund', note,
      })
      error = insErr && insErr.code !== '23505' ? insErr : null
    }
  } else {
    // One row per charge. A repeated webhook for the same charge is ignored,
    // so it cannot reset a refund that was already returned.
    ;({ error } = await svc.from('payment_refunds').upsert({
      dedupe_key: dedupeKey, reference: row.reference, reason, payer_email: row.email,
      profile_id: row.profile_id || null, amount_kobo: amountKobo, status: 'to_refund', note,
    }, { onConflict: 'dedupe_key', ignoreDuplicates: true }))
  }
  if (error) console.error('Could not record money to return:', row.reference, error.message)

  // Tell the payer, and the super admins who return the money.
  if (row.profile_id) {
    await insertNotification(svc, reason === 'overpaid' ? 'payment_return_overpaid' : 'payment_return_short',
      row.profile_id, { amountKobo })
  }
  const { data: admins } = await svc.from('profiles').select('id').eq('role', 'superadmin')
  for (const a of admins || []) {
    await insertNotification(svc, 'refund_due', a.id, { reason, reference: row.reference, amountKobo })
  }
}

// Professional subscription: activate the application, but only as 'approved'
// when identity is already approved. trg_auto_approve_paid_professional flips a
// pending one later, once identity is approved.
async function professionalSubscription(svc, { reference, customer, metadata }) {
  const expiresAt = metadata.plan_type === 'annual'
    ? new Date(Date.now() + 365 * 86400000).toISOString()
    : new Date(Date.now() +  30 * 86400000).toISOString()

  // Providers should not go live until verification is approved -
  // payment alone is not enough for a Skilled Person to appear in
  // the public directory. Check identity verification before
  // flipping status to 'approved'; if it isn't done yet, record
  // the payment/subscription but leave status 'pending' so it
  // shows in the directory only once identity is confirmed too.
  let identityApproved = false
  if (metadata.user_id) {
    const { data: applicantProfile } = await svc
      .from('profiles')
      .select('identity_verification_status')
      .eq('id', metadata.user_id)
      .single()
    identityApproved = applicantProfile?.identity_verification_status === 'approved'
  }

  const proUpdate = svc.from('professional_applications')
    .update({
      status: identityApproved ? 'approved' : 'pending', // live CHECK: pending/approved/rejected/paused
      subscription_plan: metadata.plan_type || 'monthly',
      subscription_start: new Date().toISOString(),
      subscription_expiry: expiresAt,
      activated_at: identityApproved ? new Date().toISOString() : null,
    })
  // Match by application_id when available (most precise),
  // fall back to email match for legacy payments.
  await (metadata.application_id
    ? proUpdate.eq('id', metadata.application_id)
    : proUpdate.eq('email', customer.email))
  console.log(identityApproved
    ? 'Professional activated:' : 'Professional paid, awaiting identity verification:', customer.email)
}

// Hotel or short-let booking: the room was held as 'pending' when the
// payment was priced. The transfer confirms it. Only a pending booking
// is confirmed, so a repeated webhook cannot change a cancelled one.
async function hotelBooking(svc, { reference, amount, customer, metadata }) {
  const { data: confirmedBooking } = await svc.from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', metadata.booking_id)
    .eq('payment_ref', reference)
    .eq('status', 'pending')
    .select('id')
  if (confirmedBooking?.length) {
    console.log('Hotel booking confirmed:', metadata.booking_id)
    return
  }
  // Paid after the booking was released (or a repeat webhook). A repeat
  // is already handled: the dedupe key stops a second row. A released
  // booking has taken the money, so it goes on the refund list.
  const { data: stillCancelled } = await svc.from('bookings')
    .select('id').eq('id', metadata.booking_id).eq('status', 'cancelled').maybeSingle()
  if (stillCancelled) {
    await recordMoneyToReturn(
      svc,
      { reference, email: customer?.email, profile_id: metadata.user_id || null },
      amount,
      'overpaid',
      'Paid after the booking was released for non-payment',
      'booking-released:' + reference,
    )
  }
  console.warn('Hotel booking not confirmed (already handled or not pending):', reference)
}

// SEC-3: student hostel listing fee. The unlock happens here, on the
// server, after Flutterwave confirms the charge. The browser never
// writes listing_paid. The hostel and owner come from the
// hostel_payments row we created for this reference, not from
// client metadata, and the amount must match the plan price.
async function hostelListingFee(svc, { reference, amountNgn }) {
  const { data: payRow } = await svc
    .from('hostel_payments')
    .select('id, hostel_id, owner_id, amount, status')
    .eq('reference', reference)
    .maybeSingle()

  if (!payRow) {
    console.error('[SEC-3] hostel_listing_fee with no hostel_payments row:', reference)
  } else if (payRow.status === 'success') {
    console.log('Hostel listing already unlocked, skipping:', reference)
  } else if (Number(payRow.amount) !== amountNgn) {
    // Money was taken but does not match the plan. Do not unlock.
    // Mark failed so an admin can refund or reconcile.
    await svc.from('hostel_payments')
      .update({ status: 'failed' })
      .eq('id', payRow.id)
      .eq('status', 'pending')
    console.error('[SEC-3] hostel amount mismatch, not unlocked:', reference, amountNgn, payRow.amount)
  } else {
    const paidAt = new Date().toISOString()
    await svc.from('hostel_payments')
      .update({ status: 'success', paid_at: paidAt })
      .eq('id', payRow.id)
      .eq('status', 'pending')
    await svc.from('student_hostels')
      .update({ listing_paid: true, listing_paid_at: paidAt, payment_ref: reference })
      .eq('id', payRow.hostel_id)
    console.log('Hostel listing unlocked:', reference)
  }
}

// Credit-pack purchase for optional contact unlock. Credits are only ever
// granted here, after Flutterwave confirms the charge.
async function contactUnlockCredits(svc, { reference, amount, customer, metadata }) {
  // Credits come from the metadata the server wrote when it priced
  // this payment (payment-virtual-account), not from the browser or
  // from a price table here. The amount was checked against the
  // registry price at the same time.
  const creditsFromMeta = Number(metadata.credits)
  const credits = [1, 5].includes(creditsFromMeta) ? creditsFromMeta : 0

  // The buyer must be the account whose verified login email matches
  // the payer. metadata.user_id alone is client-supplied, so it is
  // not trusted on its own.
  let buyerId = null
  if (credits > 0 && metadata.user_id && customer?.email) {
    const { data: authUser } = await svc.auth.admin.getUserById(metadata.user_id)
    if (authUser?.user && authUser.user.email?.toLowerCase() === String(customer.email).toLowerCase()) {
      buyerId = authUser.user.id
    }
  }

  if (credits > 0 && buyerId) {
    // Flutterwave retries webhooks. Grant once per payment reference.
    const { data: already } = await svc
      .from('unlock_credit_ledger')
      .select('id')
      .eq('payment_ref', reference)
      .maybeSingle()
    if (!already) {
      await svc.from('unlock_credit_ledger').insert({
        profile_id: buyerId,
        entry_type: 'purchased',
        credits,
        price_cents: amount,
        payment_ref: reference,
      })
      console.log(`Granted ${credits} unlock credit(s) to`, buyerId)
    }
  } else {
    console.warn('Unlock purchase not granted (amount or buyer did not match):', reference, amount)
  }
}

// Property escrow. Resolved strictly by payment_ref (written server-side when
// the escrow was created). metadata.user_id and metadata.platform_fee are
// client-supplied and are never used. Only status and funded_at change here:
// confirmed_at is the tenant's move-in signal and would trigger an immediate release.
async function escrowPayment(svc, { reference, amountNgn }) {
  const { data: matchedEscrow, error: escrowErr } = await svc
    .from('escrow_transactions')
    .select('id, tenant_id, platform_amount, gross_amount, status')
    .eq('payment_ref', reference)
    .single()

  if (escrowErr || !matchedEscrow) {
    console.error('Escrow payment with no matching payment_ref, refusing to confirm:', reference)
    return { escrowRow: null }
  }
  // Only a row still waiting for payment is funded. A late or
  // repeated webhook cannot move a released or refunded escrow back.
  const { data: funded } = await svc.from('escrow_transactions')
    .update({ status: 'funded', funded_at: new Date().toISOString() })
    .eq('id', matchedEscrow.id)
    .eq('status', 'awaiting_payment')
    .select('id')
  if (funded?.length) console.log('Escrow payment confirmed:', reference, 'amount:', amountNgn)
  else console.warn('Escrow not funded (not awaiting payment):', reference)
  return { escrowRow: matchedEscrow }
}

// ADR-009 marketplace transaction escrow. Resolved by payment_ref for the same
// reason as escrowPayment. Only a job that was PENDING and then could not be
// moved to FUNDED returns stop, which skips the payments log. A refused match
// (no row, not PENDING, amount mismatch) only logs, as it always has, so the
// payments row is still written. That last part is kept on purpose, see the
// note in the webhook.
async function transactionEscrow(svc, { reference, amountNgn, metadata }, notify = insertNotification) {
  const { data: matchedTx, error: txErr } = await svc
    .from('transactions')
    .select('id, requester_id, provider_id, amount_cents, status')
    .eq('payment_ref', reference)
    .single()

  if (txErr || !matchedTx) {
    console.error('Transaction escrow payment with no matching payment_ref, refusing to confirm:', reference)
    return {}
  }
  if (matchedTx.status !== 'PENDING') {
    console.error('Transaction', matchedTx.id, 'is not PENDING (status=' + matchedTx.status + '), refusing to mark funded:', reference)
    return {}
  }
  if (Math.round(matchedTx.amount_cents / 100) !== Math.round(amountNgn)) {
    // Defense in depth: the amount actually charged (verified via HMAC
    // signature) should match what the transaction expected.
    console.error('Transaction', matchedTx.id, 'amount mismatch: expected', matchedTx.amount_cents / 100, 'got', amountNgn, 'ref:', reference)
    return {}
  }
  const { data: funded } = await svc.from('transactions')
    .update({ status: 'FUNDED', updated_at: new Date().toISOString() })
    .eq('id', matchedTx.id)
    .eq('status', 'PENDING')
    .select('id')
  if (!funded?.length) {
    console.warn('Transaction not funded (no longer PENDING):', matchedTx.id)
    return { stop: true }
  }
  console.log('Transaction escrow funded:', matchedTx.id, 'amount:', amountNgn)

  if (matchedTx.provider_id) {
    await notify(svc, 'escrow_funded', matchedTx.provider_id,
      { amount: amountNgn, transactionId: matchedTx.id })
  }
  return {}
}

// Registry (creational pattern): one handler per purpose. A purpose not listed
// here has no server-side effect beyond the payments log.
export const CHARGE_PURPOSES = Object.freeze({
  professional_subscription: professionalSubscription,
  hotel_booking: hotelBooking,
  hostel_listing_fee: hostelListingFee,
  contact_unlock_credits: contactUnlockCredits,
  escrow_payment: escrowPayment,
  transaction_escrow: transactionEscrow,
})

// Runs the handler for a confirmed charge's purpose. Returns the handler's
// result, or {} when no handler applies. The own-property check stops a
// metadata.type such as "constructor" from reaching Object.prototype.
export async function runChargePurpose(svc, { reference, amount, customer, metadata = {} }) {
  const amountNgn = amount / 100
  const type = metadata?.type
  if (!type || !Object.prototype.hasOwnProperty.call(CHARGE_PURPOSES, type)) return {}
  const result = await CHARGE_PURPOSES[type](svc, { reference, amount, amountNgn, customer, metadata })
  return result || {}
}
