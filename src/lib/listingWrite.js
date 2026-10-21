// Saving a new listing: the property row, then its photos.
//
// The listing forms collect photos in a field called `images`, but `images` is not a column of
// `properties`. Photos are rows of `property_images` (property_id, url, is_primary, caption).
// Sending `images` inside the properties insert makes the database refuse the whole insert, and
// nothing else wrote property_images, so a listing could never be published with its photos.
//
// The client is passed in, so the logic can be tested without a database.
//
// `returning` names the columns read back from the new row. Never '*': a browser role cannot read
// every column of properties (migration 18, src/lib/propertyColumns.js).

// Splits a form payload into the properties row and a clean photo list. Photos without a URL are
// dropped. Exactly one photo is primary: the first one flagged, else the first one.
export function splitListingPhotos(payload) {
  const { images, ...row } = payload || {}
  const photos = (Array.isArray(images) ? images : [])
    .filter((i) => i && typeof i.url === 'string' && i.url.trim() !== '')
    .map((i) => ({ url: i.url.trim(), is_primary: !!i.is_primary, caption: i.caption || null }))
  const firstPrimary = photos.findIndex((p) => p.is_primary)
  const primary = firstPrimary === -1 ? 0 : firstPrimary
  photos.forEach((p, n) => { p.is_primary = n === primary })
  return { row, photos }
}

export function photoRows(propertyId, photos) {
  return photos.map((p) => ({ property_id: propertyId, url: p.url, is_primary: p.is_primary, caption: p.caption }))
}

// Inserts the listing and then its photos. Resolves to { data, error } like one query: `data` is
// the new row (the `returning` columns) and `error` is set when the listing is not fully saved.
// If the photos fail, the new property row is removed again so a retry does not leave a duplicate
// listing with no photos. The owner may delete their own row; a failed removal is reported with
// the photo error rather than hidden.
export async function insertListingWithPhotos(client, payload, returning) {
  const { row, photos } = splitListingPhotos(payload)
  const { data, error } = await client.from('properties').insert(row).select(returning).single()
  if (error || !data) return { data: null, error: error || new Error('Listing was not confirmed by the server') }
  if (photos.length === 0) return { data, error: null }

  const { error: photoError } = await client.from('property_images').insert(photoRows(data.id, photos))
  if (!photoError) return { data, error: null }

  const { error: cleanupError } = await client.from('properties').delete().eq('id', data.id)
  const message = `Your photos could not be saved (${photoError.message || 'unknown error'}).`
    + (cleanupError ? ' The listing was created without photos; contact support before trying again.' : ' Nothing was published; please try again.')
  return { data: null, error: Object.assign(new Error(message), { code: photoError.code, cause: photoError }) }
}
