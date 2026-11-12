// Repository for property reads needed by the indexing route (api/index-property.js).
// The client is the caller's own, so row-level security applies.

// A property as the AI index should see it, read from the database so a seller cannot index
// invented figures. Includes seller_id for the ownership check.
export function findPropertyForIndex(client, propertyId) {
  return client
    .from('properties')
    .select('id, seller_id, title, description, property_type, listing_type, price, state, city, bedrooms, bathrooms, size_sqm, features, documents, latitude, longitude')
    .eq('id', propertyId)
    .single()
}

// The seller who owns a property. The route compares it with the signed-in user.
export function findPropertySellerId(userClient, propertyId) {
  return userClient
    .from('properties')
    .select('seller_id')
    .eq('id', propertyId)
    .single()
}
