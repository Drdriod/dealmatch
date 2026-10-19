// The `properties` columns that any visitor may read.
//
// The row-level policy "Active properties are public" lets anyone, signed in or not, read every
// column of an active listing. So what leaves the database is decided by the columns a query
// asks for. A `select('*')` also returns the seller's own phone and email, the payment reference
// and the verification notes. The contact rule is that a phone number is only released through the
// `get_property_contact` function (owner, staff, funded escrow or a credit unlock). Reading it off
// the row would sidestep that rule, so public reads name their columns instead of using '*'.
//
// Left out on purpose:
//   contact_phone, contact_email    the seller's contact details
//   payment_ref                     the payment reference that webhooks match on
//   verified_by, verification_note, verification_notes, verification_date
//   assigned_agent_id, assigned_at  internal verification workflow
//   search_vector                   an index column, large and of no use to the page
//
// Only columns from the production baseline are listed. Newer optional ones (attributes,
// category_id) are left out until a page needs them, so this list cannot fail on a database
// that has not had those migrations yet.
//
// Owner and staff screens (landlord, manage listings, admin, agent, verification) read
// their own or assigned rows and may use '*'. scripts/check-architecture-fitness.mjs check 7
// keeps the allow-list explicit.

export const PROPERTY_PUBLIC_COLUMN_LIST = [
  'id', 'seller_id', 'title', 'description', 'property_type', 'listing_type', 'price',
  'state', 'city', 'address', 'bedrooms', 'bathrooms', 'size_sqm', 'features', 'documents',
  'status', 'view_count', 'like_count', 'created_at', 'updated_at', 'category', 'price_period',
  'max_guests', 'video_url', 'landlord_name', 'rules', 'rating', 'review_count', 'custom_terms',
  'verified_at', 'latitude', 'longitude', 'occupancy_status',
]

export const PROPERTY_PUBLIC_COLUMNS = PROPERTY_PUBLIC_COLUMN_LIST.join(', ')

// Columns that must never appear in a public read. The test and the fitness check use this.
export const PROPERTY_PRIVATE_COLUMNS = [
  'contact_phone', 'contact_email', 'payment_ref', 'verified_by', 'verification_note',
  'verification_notes', 'verification_date', 'assigned_agent_id', 'assigned_at', 'search_vector',
]
