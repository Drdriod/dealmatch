// Run with: node --test src/lib/listingWrite.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitListingPhotos, photoRows, insertListingWithPhotos } from './listingWrite.js'

test('images never stay inside the properties row', () => {
  const { row, photos } = splitListingPhotos({ title: 'T', price: 1, images: [{ url: 'https://x/a.jpg', is_primary: true }] })
  assert.equal('images' in row, false)
  assert.equal(row.title, 'T')
  assert.equal(photos.length, 1)
})

test('photos without a url are dropped and the url is trimmed', () => {
  const { photos } = splitListingPhotos({ images: [{ url: '  https://x/a.jpg ' }, { url: '' }, null, { is_primary: true }, { url: 5 }] })
  assert.deepEqual(photos.map((p) => p.url), ['https://x/a.jpg'])
})

test('exactly one photo is primary: the first flagged, else the first', () => {
  assert.deepEqual(
    splitListingPhotos({ images: [{ url: 'a' }, { url: 'b', is_primary: true }, { url: 'c', is_primary: true }] }).photos.map((p) => p.is_primary),
    [false, true, false])
  assert.deepEqual(
    splitListingPhotos({ images: [{ url: 'a' }, { url: 'b' }] }).photos.map((p) => p.is_primary),
    [true, false])
})

test('a payload with no images, or nothing at all, gives an empty photo list', () => {
  assert.deepEqual(splitListingPhotos({ title: 'T' }).photos, [])
  assert.deepEqual(splitListingPhotos(undefined), { row: {}, photos: [] })
  assert.deepEqual(splitListingPhotos({ images: 'not a list' }).photos, [])
})

test('photoRows ties each photo to the property', () => {
  assert.deepEqual(photoRows('p1', [{ url: 'a', is_primary: true, caption: null }]),
    [{ property_id: 'p1', url: 'a', is_primary: true, caption: null }])
})

// A small client that records calls and can be told to fail one table's insert.
function client({ failPhotos = false, failDelete = false, failProperty = false } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const state = { table }
      const b = {
        insert(rows) { state.op = 'insert'; state.rows = rows; return b },
        delete() { state.op = 'delete'; return b },
        select(cols) { state.returning = cols; return b },
        single() { state.single = true; return b },
        eq(col, val) { state.eq = [col, val]; return b },
        then(resolve) {
          calls.push({ ...state })
          if (state.op === 'insert' && table === 'properties') {
            return resolve(failProperty ? { data: null, error: { message: 'duplicate key', code: '23505' } } : { data: { id: 'new-id', title: 'T' }, error: null })
          }
          if (state.op === 'insert' && table === 'property_images') {
            return resolve(failPhotos ? { data: null, error: { message: 'new row violates row-level security policy', code: '42501' } } : { data: null, error: null })
          }
          if (state.op === 'delete') return resolve({ error: failDelete ? { message: 'denied' } : null })
          return resolve({ data: null, error: null })
        },
      }
      return b
    },
  }
}

test('inserts the listing without images, reads back only the named columns, then saves photos', async () => {
  const c = client()
  const res = await insertListingWithPhotos(c, { title: 'T', images: [{ url: 'https://x/a.jpg' }, { url: 'https://x/b.jpg' }] }, 'id, title')
  assert.equal(res.error, null)
  assert.equal(res.data.id, 'new-id')
  assert.equal(c.calls[0].table, 'properties')
  assert.equal('images' in c.calls[0].rows, false)
  assert.equal(c.calls[0].returning, 'id, title')
  assert.equal(c.calls[1].table, 'property_images')
  assert.deepEqual(c.calls[1].rows.map((r) => [r.property_id, r.url, r.is_primary]),
    [['new-id', 'https://x/a.jpg', true], ['new-id', 'https://x/b.jpg', false]])
  assert.equal(c.calls.length, 2)
})

test('a listing with no photos makes no photo insert', async () => {
  const c = client()
  const res = await insertListingWithPhotos(c, { title: 'T' }, 'id')
  assert.equal(res.error, null)
  assert.equal(c.calls.length, 1)
})

test('a failed property insert returns the error and writes no photos', async () => {
  const c = client({ failProperty: true })
  const res = await insertListingWithPhotos(c, { title: 'T', images: [{ url: 'a' }] }, 'id')
  assert.equal(res.data, null)
  assert.equal(res.error.code, '23505')
  assert.equal(c.calls.length, 1)
})

test('failed photos remove the new listing so a retry cannot duplicate it', async () => {
  const c = client({ failPhotos: true })
  const res = await insertListingWithPhotos(c, { title: 'T', images: [{ url: 'a' }] }, 'id')
  assert.equal(res.data, null)
  assert.match(res.error.message, /photos could not be saved/)
  assert.match(res.error.message, /Nothing was published/)
  assert.equal(res.error.code, '42501')
  const del = c.calls.find((x) => x.op === 'delete')
  assert.deepEqual([del.table, del.eq], ['properties', ['id', 'new-id']])
})

test('if the cleanup also fails, the message says the listing exists', async () => {
  const c = client({ failPhotos: true, failDelete: true })
  const res = await insertListingWithPhotos(c, { title: 'T', images: [{ url: 'a' }] }, 'id')
  assert.match(res.error.message, /created without photos/)
})
