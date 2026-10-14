// Payment purposes (creational pattern: a registry that builds the right handler).
//
// Every payment the app takes starts with a purpose, such as escrow_payment or
// hotel_booking. Each purpose has one handler that checks the request against
// the database, prices it from the platform_fees registry, and returns the
// amount plus the metadata the webhook needs to grant the right thing.
//
// To add a channel: write a handler, then call registerPaymentPurpose(name, fn).
// The dispatcher in api/platform.js does not change.
//
// Server only. Takes a service-role Supabase client.

export class PaymentError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

export const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

// A dynamic virtual account can be paid for 24 hours.
export const VA_TTL_SECONDS = 86400

const UNLOCK_PACKS = { unlock_credit_single: 1, unlock_credit_pack_5: 5 } // key -> credits
const PRO_PLAN_FEE = { monthly: 'professional_monthly', annual: 'professional_annual' }
const HOSTEL_PLAN_FEE = { semester: 'hostel_listing_semester', annual: 'hostel_listing_annual' }

// The current price for a channel. Refuses to charge while it is switched off.
async function platformFeeNaira(svc, key) {
  const { data, error } = await svc.from('platform_fees').select('value, is_active').eq('key', key).maybeSingle()
  if (error) throw error
  if (!data || !data.is_active) {
    throw new PaymentError('This payment is not available right now. Please try again later.', 409)
  }
  return Number(data.value)
}

// ─── Handlers: one per purpose ──────────────────────────────────────────────

// Rent or sale protection: the escrow row was created by
// start_property_escrow_payment with this reference, for this buyer.
async function escrowPayment(svc, { subject: _subject, reference, user }) {
  const { data: esc } = await svc.from('escrow_transactions')
    .select('id, property_id, gross_amount, status, buyer_id')
    .eq('payment_ref', reference).maybeSingle()
  if (!esc || esc.buyer_id !== user.id) throw new PaymentError('Reservation not found', 404)
  if (esc.status !== 'awaiting_payment') throw new PaymentError('This reservation is no longer waiting for payment', 409)
  return {
    amountNaira: Number(esc.gross_amount),
    metadata: { type: 'escrow_payment', user_id: user.id, escrow_id: esc.id, property_id: esc.property_id },
  }
}

// Marketplace job: the transaction was bound to this reference server-side.
async function transactionEscrow(svc, { reference, user }) {
  const { data: tx } = await svc.from('transactions')
    .select('id, requester_id, amount_cents, status')
    .eq('payment_ref', reference).maybeSingle()
  if (!tx || tx.requester_id !== user.id) throw new PaymentError('Transaction not found', 404)
  if (tx.status !== 'PENDING') throw new PaymentError('This job is not waiting for payment', 409)
  return {
    amountNaira: Number(tx.amount_cents) / 100,
    metadata: { type: 'transaction_escrow', user_id: user.id, transaction_id: tx.id },
  }
}

async function professionalSubscription(svc, { subject, user }) {
  const planType = subject.plan_type === 'annual' ? 'annual' : 'monthly'
  const { data: app, error } = await svc.from('professional_applications')
    .select('id, user_id, professional_type')
    .eq('id', clean(subject.application_id, 64)).maybeSingle()
  if (error || !app || app.user_id !== user.id) throw new PaymentError('Application not found', 404)
  return {
    amountNaira: await platformFeeNaira(svc, PRO_PLAN_FEE[planType]),
    metadata: {
      type: 'professional_subscription', user_id: user.id, application_id: app.id,
      professional_type: app.professional_type || '', plan_type: planType,
    },
  }
}

async function hostelListingFee(svc, { subject, reference, user }) {
  const plan = subject.plan === 'annual' ? 'annual' : 'semester'
  const { data: hostel, error } = await svc.from('student_hostels')
    .select('id, owner_id').eq('id', clean(subject.hostel_id, 64)).maybeSingle()
  if (error || !hostel || hostel.owner_id !== user.id) throw new PaymentError('Listing not found', 404)
  const amountNaira = await platformFeeNaira(svc, HOSTEL_PLAN_FEE[plan])
  // The paid-listing check in the webhook compares against this row.
  const { error: payErr } = await svc.from('hostel_payments').insert({
    hostel_id: hostel.id, owner_id: user.id, reference, amount: amountNaira, plan, status: 'pending',
  })
  if (payErr) throw new PaymentError('Could not start the listing payment. Please try again.', 500)
  return {
    amountNaira,
    metadata: { type: 'hostel_listing_fee', user_id: user.id, hostel_id: hostel.id, plan, listing_type: 'student_hostel' },
  }
}

async function contactUnlockCredits(svc, { subject, user }) {
  const pack = clean(subject.pack, 64)
  if (!Object.prototype.hasOwnProperty.call(UNLOCK_PACKS, pack)) throw new PaymentError('Unknown unlock pack', 400)
  return {
    amountNaira: await platformFeeNaira(svc, pack),
    metadata: { type: 'contact_unlock_credits', user_id: user.id, credits: String(UNLOCK_PACKS[pack]), pack },
  }
}

// Hotel or short-let booking. The price, fee and availability are all checked
// here on the server. The booking is created as 'pending' and becomes
// 'confirmed' only when the webhook sees the transfer. Pending bookings stop
// holding rooms after the payment window (VA_TTL_SECONDS) passes.
async function hotelBooking(svc, { subject, reference, user }) {
  const s = subject || {}
  const checkin = clean(s.checkin, 10)
  const checkout = clean(s.checkout, 10)
  const nights = Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkin) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)
    || !(nights > 0) || nights > 90 || Date.parse(checkin) < Date.now() - 86400000) {
    throw new PaymentError('Check-in and check-out dates are not valid', 400)
  }
  const rooms = Math.floor(Number(s.rooms))
  if (!(rooms >= 1 && rooms <= 20)) throw new PaymentError('Choose between 1 and 20 rooms', 400)
  const guestName = clean(s.guest_name, 120)
  const guestPhone = clean(s.guest_phone, 30)
  if (!guestName || !guestPhone) throw new PaymentError('Guest name and phone are required', 400)

  const { data: property, error } = await svc.from('properties')
    .select('id, category, status, room_categories(id, name, price_per_night, available_rooms, is_active)')
    .eq('id', clean(s.property_id, 64)).maybeSingle()
  if (error || !property || property.status !== 'active' || !['hotel', 'shortlet'].includes(property.category)) {
    throw new PaymentError('This property is not available for booking', 404)
  }
  const cats = (property.room_categories || []).filter((c) => c.is_active !== false)
  const cat = cats.find((c) => c.name === clean(s.room_type, 120)) || cats[0]
  if (!cat || !(Number(cat.price_per_night) > 0)) throw new PaymentError('No room price is set for this property', 409)

  // Rooms held for these dates: every confirmed booking, and pending ones still
  // inside the payment window.
  const since = new Date(Date.now() - VA_TTL_SECONDS * 1000).toISOString()
  const overlapping = () => svc.from('bookings').select('rooms_booked')
    .eq('property_id', property.id).eq('category_id', cat.id)
    .lt('checkin_date', checkout).gt('checkout_date', checkin)
  const [{ data: confirmed }, { data: pending }] = await Promise.all([
    overlapping().eq('status', 'confirmed'),
    overlapping().eq('status', 'pending').gte('created_at', since),
  ])
  const held = [...(confirmed || []), ...(pending || [])]
    .reduce((n, b) => n + (Number(b.rooms_booked) || 1), 0)
  if (held + rooms > Number(cat.available_rooms || 0)) {
    throw new PaymentError('Sorry, those rooms are no longer available for these dates.', 409)
  }

  const feeRate = await platformFeeNaira(svc, 'hotel_booking') // a percentage of the room charge
  const subtotal = Number(cat.price_per_night) * rooms * nights
  const fee = Math.round(subtotal * feeRate / 100)
  const total = subtotal + fee

  const { data: booking, error: bookErr } = await svc.from('bookings').insert({
    property_id: property.id,
    category_id: cat.id,
    room_type: cat.name,
    guest_name: guestName,
    guest_phone: guestPhone,
    guest_email: clean(s.guest_email, 254) || user.email,
    checkin_date: checkin,
    checkout_date: checkout,
    rooms_booked: rooms,
    guests: Math.min(Math.max(Math.floor(Number(s.guests) || 1), 1), 50),
    total_amount: total,
    platform_fee_ngn: fee,
    payment_ref: reference,
    source: 'dealmatch',
    status: 'pending',
    notes: clean(s.notes, 500),
    user_id: user.id,
  }).select('id').single()
  if (bookErr || !booking) throw new PaymentError('Could not reserve the rooms. Please try again.', 500)

  return {
    amountNaira: total,
    metadata: { type: 'hotel_booking', user_id: user.id, booking_id: booking.id, platform_fee_ngn: String(fee) },
  }
}

// ─── Registry ───────────────────────────────────────────────────────────────

const handlers = Object.create(null)

export function registerPaymentPurpose(purpose, handler) {
  if (typeof handler !== 'function') throw new TypeError(`Handler for ${purpose} must be a function`)
  handlers[purpose] = handler
}

registerPaymentPurpose('escrow_payment', escrowPayment)
registerPaymentPurpose('transaction_escrow', transactionEscrow)
registerPaymentPurpose('professional_subscription', professionalSubscription)
registerPaymentPurpose('hostel_listing_fee', hostelListingFee)
registerPaymentPurpose('contact_unlock_credits', contactUnlockCredits)
registerPaymentPurpose('hotel_booking', hotelBooking)

// Look up the handler for a purpose and run it. Unknown purposes are refused,
// including names that exist on Object.prototype.
export async function resolvePayment(svc, { purpose, subject, reference, user }) {
  const handler = Object.prototype.hasOwnProperty.call(handlers, purpose) ? handlers[purpose] : null
  if (!handler) throw new PaymentError('Unknown payment type', 400)
  return handler(svc, { subject: subject || {}, reference, user })
}

export const registeredPurposes = () => Object.keys(handlers).sort()
