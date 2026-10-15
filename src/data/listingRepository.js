// Repository for listing reads that PostgREST cannot express directly (api/platform.js).

// The listing's latitude and longitude. The location column is PostGIS geography, so
// it is read through an RPC rather than a column select. Pass the client to use.
export function findListingLatLng(client, listingId) {
  return client.rpc('get_listing_with_latlng', { p_id: listingId }).single()
}
