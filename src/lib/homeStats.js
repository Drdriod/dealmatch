// When the home page may show platform numbers. Below the milestone it shows what the platform
// does (checks, escrow) instead of small counts that read as "nobody is here".
// Both numbers must be reached. Change them here and nowhere else.
export const HOME_STATS_MILESTONE = {
  activeProperties: 50,
  verifiedUsers: 100,
}

// counts: { properties, verified, sold } as numbers (null or undefined count as 0).
// Returns null while below the milestone, otherwise the tiles to show. A tile whose value is 0
// is left out, so the page never prints a raw zero.
export function buildHomeStats(counts, milestone = HOME_STATS_MILESTONE) {
  const properties = Number(counts?.properties) || 0
  const verified = Number(counts?.verified) || 0
  const sold = Number(counts?.sold) || 0
  if (properties < milestone.activeProperties || verified < milestone.verifiedUsers) return null

  const tiles = [
    { value: String(properties), suffix: '+', label: 'Properties Listed' },
    { value: String(verified), suffix: '+', label: 'Verified Users' },
    { value: 'AI', suffix: '', label: 'Powered Matching' },
  ]
  if (sold > 0) tiles.push({ value: String(sold), suffix: '', label: 'Deals Closed' })
  return tiles
}
