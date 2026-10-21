// Repository (structural pattern) for browsing and booking hotels and short-lets (HotelsPage).
// The page calls these and never builds a query.
import { supabase } from '@/lib/supabase'
import { PROPERTY_PUBLIC_COLUMNS } from '@/lib/propertyColumns'

// Active hotels and short-lets, newest first, at most 30, with their room categories.
// Pass 'All States' for no state filter.
export function fetchActiveHotels(state) {
  let q = supabase
    .from('properties')
    .select(`${PROPERTY_PUBLIC_COLUMNS}, room_categories(id, name, price_per_night, available_rooms)`)
    .in('category', ['hotel', 'shortlet'])
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(30)
  if (state !== 'All States') q = q.eq('state', state)
  return q
}

// Asks the database whether this many rooms are free for the dates. Resolves true or false.
// If the function is missing the call returns an error, and the page falls back to counting
// clashing bookings itself.
export function checkBookingAvailability({ propertyId, checkin, checkout, rooms, categoryId }) {
  return supabase.rpc('check_booking_availability', {
    p_property_id: propertyId,
    p_checkin:     checkin,
    p_checkout:    checkout,
    p_rooms:       rooms,
    p_category_id: categoryId,
  })
}

// Bookings that overlap the dates and still hold rooms (not cancelled or no-show).
export function fetchClashingBookings({ propertyId, checkin, checkout }) {
  return supabase
    .from('bookings')
    .select('rooms_booked')
    .eq('property_id', propertyId)
    .not('status', 'in', '(cancelled,no_show)')
    .lt('checkin_date', checkout)
    .gt('checkout_date', checkin)
}
