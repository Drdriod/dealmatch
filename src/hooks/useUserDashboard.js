import { useEffect } from 'react'
import { useLoader } from '@/hooks/useLoader'
import {
  fetchMyPropertyListings, fetchMyCategoryListings, fetchMyRequests, countMyMatches,
  countMySwipeLikes, countCompletedEscrowSales, countCompletedProviderTransactions,
  fetchMyPropertyDatesSince, fetchRequestDatesSince, subscribeToMySwipes,
} from '@/data/dashboardRepository'
import { SPARK_WEEKS, weeklyCounts, buildActivity } from '@/lib/dashboardModels'
import { unwrap } from '@/lib/loader'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const EMPTY_USER_DASHBOARD = {
  myListingsCount: 0, myRequestsCount: 0, myMatches: 0, completedDeals: 0,
  activity: [], listingTrend: new Array(SPARK_WEEKS).fill(0), enquiryTrend: new Array(SPARK_WEEKS).fill(0),
  issues: [],
}

// The listings and requests lists are the page's main content, so if either fails the whole
// load fails and the page says so. The counts and trends can fail on their own: the rest still
// loads and the failed figures are named in `issues`, rather than shown as a real 0.
async function loadUserDashboard(userId) {
  const since = new Date(Date.now() - SPARK_WEEKS * WEEK_MS).toISOString()
  const [propListings, categoryListings, myRequests, matchRes, escrowRes, txRes, propTrend, reqTrend] = await Promise.all([
    fetchMyPropertyListings(userId),
    fetchMyCategoryListings(userId),
    fetchMyRequests(),
    countMyMatches(userId),
    countCompletedEscrowSales(userId),
    countCompletedProviderTransactions(userId),
    fetchMyPropertyDatesSince(userId, since),
    fetchRequestDatesSince(since),
  ])

  const properties = unwrap(propListings) || []
  const requests = unwrap(myRequests) || []
  const categories = categoryListings || []
  const issues = []

  // Matches: the exact count from the `matches` table, or the likes in `swipes` if that fails.
  let myMatches = matchRes.count || 0
  if (matchRes.error) {
    const swipes = await countMySwipeLikes(userId)
    if (swipes.error) issues.push('matches')
    myMatches = swipes.count || 0
  }
  if (escrowRes.error || txRes.error) issues.push('completed deals')
  if (propTrend.error || reqTrend.error) issues.push('weekly trends')

  return {
    myListingsCount: properties.length + categories.length,
    myRequestsCount: requests.length,
    myMatches,
    completedDeals: (escrowRes.count || 0) + (txRes.count || 0),
    activity: buildActivity({ properties, categoryListings: categories, requests }),
    listingTrend: weeklyCounts([...(propTrend.data || []), ...categories]),
    enquiryTrend: weeklyCounts(reqTrend.data || []),
    issues,
  }
}

// Everything the user dashboard shows, with loading and error state. It reloads without a
// spinner when the person's swipes change.
export function useUserDashboard(user) {
  const userId = user?.id
  const { data, loading, error, reload } = useLoader(() => loadUserDashboard(userId), [userId], { enabled: !!userId })
  useEffect(() => {
    if (!userId) return undefined
    return subscribeToMySwipes(userId, () => reload({ silent: true }))
  }, [userId, reload])
  return { ...(data || EMPTY_USER_DASHBOARD), loading, error, reload }
}
