import { useLoader } from '@/hooks/useLoader'
import {
  fetchMyListings, fetchBookingsForProperties, fetchEnquiriesForProperties, fetchRentPayments,
} from '@/data/landlordRepository'
import { unwrap } from '@/lib/loader'

export const EMPTY_LANDLORD_DASHBOARD = { listings: [], bookings: [], enquiries: [], rentPayments: [], issues: [] }

// The listings are the main content, so a failed listings read fails the load. Bookings,
// enquiries and rent payments can fail on their own and are named in `issues`.
// The property ids come from the listings themselves (the same rows, one query fewer).
async function loadLandlordDashboard(userId) {
  const [listingsRes, paymentsRes] = await Promise.all([fetchMyListings(userId), fetchRentPayments(userId)])
  const listings = unwrap(listingsRes) || []
  const ids = listings.map((l) => l.id)
  const [bookingsRes, enquiriesRes] = ids.length
    ? await Promise.all([fetchBookingsForProperties(ids), fetchEnquiriesForProperties(ids)])
    : [{ data: [] }, { data: [] }]

  const issues = []
  if (paymentsRes.error) issues.push('rent collected')
  if (bookingsRes.error) issues.push('bookings')
  if (enquiriesRes.error) issues.push('enquiries')
  return {
    listings,
    bookings: bookingsRes.data || [],
    enquiries: enquiriesRes.data || [],
    rentPayments: paymentsRes.data || [],
    issues,
  }
}

export function useLandlordDashboard(user) {
  const userId = user?.id
  const { data, loading, error, reload } = useLoader(() => loadLandlordDashboard(userId), [userId], { enabled: !!userId })
  return { ...(data || EMPTY_LANDLORD_DASHBOARD), loading, error, reload }
}
