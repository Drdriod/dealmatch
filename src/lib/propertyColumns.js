// Which `properties` columns a browser may read.
//
// The row-level policy "Active properties are public" decides which ROWS a visitor sees. It does
// not decide which columns. So the database decides that too: migration 18
// (20261020000000_properties_column_exposure.sql) removes table-level SELECT from `anon` and
// `authenticated` and grants SELECT on the columns below only. Everything else on the row (the
// seller's phone and email, the payment reference, the verification record, the agent assignment)
// can be read only by the service role and by SECURITY DEFINER functions such as
// get_property_contact (owner, staff, funded escrow or a credit unlock).
//
// What that means for code in the browser:
//   * `select('*')` on properties fails with "permission denied". Name the columns.
//   * Counts use select('id', { count: 'exact', head: true }). A head `*` is refused too.
//   * Filtering on a private column is refused as well (the agent dashboard asks the
//     my_assigned_property_ids() function for its ids instead of filtering on assigned_agent_id).
//   * Writing a private column is unchanged: INSERT and UPDATE grants and the guard trigger
//     decide that. Only reading is closed.
//   * A new column is NOT readable until a migration grants it. Add GRANT SELECT (col) to a new
//     migration and the name to the right list here. propertyColumns.test.mjs fails when this file
//     and migration 18 disagree.
//
// Server code that uses the service role (api/*, webhooks) is not limited by any of this.

// What the public pages select. Only columns from the production baseline are listed, so this
// list cannot fail on a database that has not had the newer optional columns.
export const PROPERTY_PUBLIC_COLUMN_LIST = [
  'id', 'seller_id', 'title', 'description', 'property_type', 'listing_type', 'price',
  'state', 'city', 'address', 'bedrooms', 'bathrooms', 'size_sqm', 'features', 'documents',
  'status', 'view_count', 'like_count', 'created_at', 'updated_at', 'category', 'price_period',
  'max_guests', 'video_url', 'landlord_name', 'rules', 'rating', 'review_count', 'custom_terms',
  'verified_at', 'latitude', 'longitude', 'occupancy_status',
]

export const PROPERTY_PUBLIC_COLUMNS = PROPERTY_PUBLIC_COLUMN_LIST.join(', ')

// Readable by browser roles but not selected by the public pages. universal_search and
// universal_match run as the caller and read them, so they must stay granted.
//   attributes, category_id   newer optional columns (taxonomy)
//   search_vector             a generated index column, large and of no use to a page
export const PROPERTY_EXTRA_READABLE_COLUMNS = ['attributes', 'category_id', 'search_vector']

// Everything migration 18 grants to anon and authenticated.
export const PROPERTY_BROWSER_READABLE_COLUMNS = [
  ...PROPERTY_PUBLIC_COLUMN_LIST, ...PROPERTY_EXTRA_READABLE_COLUMNS,
]

// What an owner's or staff member's screen selects: the public list plus the taxonomy columns.
// A staff screen that needs a private column asks a SECURITY DEFINER function, not the table.
export const PROPERTY_OWNER_COLUMNS = [
  ...PROPERTY_PUBLIC_COLUMN_LIST, 'category_id', 'attributes',
].join(', ')

// Columns no browser role may read. The test, the fitness check and migration 18 use this.
//   contact_phone, contact_email        the seller's contact details
//   payment_ref                         the payment reference that webhooks match on
//   verified_by, verification_date,
//   verification_note, verification_notes   internal verification record
//   assigned_agent_id, assigned_at      internal agent assignment
export const PROPERTY_PRIVATE_COLUMNS = [
  'contact_phone', 'contact_email', 'payment_ref', 'verified_by', 'verification_date',
  'verification_note', 'verification_notes', 'assigned_agent_id', 'assigned_at',
]
