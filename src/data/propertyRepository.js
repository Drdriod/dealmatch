// Repository for property reads needed by the indexing route (api/index-property.js).
// The client is the caller's own, so row-level security applies.

// The seller who owns a property. The route compares it with the signed-in user.
export function findPropertySellerId(userClient, propertyId) {
  return userClient
    .from('properties')
    .select('seller_id')
    .eq('id', propertyId)
    .single()
}
