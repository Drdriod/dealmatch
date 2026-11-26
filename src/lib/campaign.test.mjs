import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidSlug, slugify, cleanSource, pickUtm, escapeHtml, campaignPhotoUrl,
  cleanPhone, validateLead, renderCampaignHtml,
} from './campaign.js'

test('slugs: accepted and refused like the database', () => {
  assert.equal(isValidSlug('obot-idim-land'), true)
  assert.equal(isValidSlug('ab'), false)
  assert.equal(isValidSlug('Has-Caps'), false)
  assert.equal(isValidSlug('double--dash'), false)
  assert.equal(isValidSlug('-lead'), false)
  assert.equal(isValidSlug('a'.repeat(61)), false)
})

test('slugify turns a title into a valid slug', () => {
  assert.equal(slugify('Obot Idim Road Land!'), 'obot-idim-road-land')
  assert.equal(isValidSlug(slugify('  Land for sale -- Uyo  ')), true)
  assert.equal(slugify('!!!'), '')
})

test('source tags: lower-cased, odd ones become other, empty becomes direct', () => {
  assert.equal(cleanSource('Email1'), 'email1')
  assert.equal(cleanSource(''), 'direct')
  assert.equal(cleanSource(null), 'direct')
  assert.equal(cleanSource('bad source!'), 'other')
  assert.equal(cleanSource('x'.repeat(61)), 'other')
})

test('utm: only the five standard tags are kept, trimmed', () => {
  const u = pickUtm('?utm_source=fb&utm_campaign=nov&evil=1&utm_term=' + 'a'.repeat(300))
  assert.deepEqual(Object.keys(u).sort(), ['utm_campaign', 'utm_source', 'utm_term'])
  assert.equal(u.utm_term.length, 100)
})

test('escapeHtml stops markup injection', () => {
  assert.equal(escapeHtml('<script>"x"&\'y\'</script>'), '&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;')
})

test('photo url points at the public campaign bucket and encodes the path', () => {
  assert.equal(
    campaignPhotoUrl('https://x.supabase.co/', 'abc/front gate.jpg'),
    'https://x.supabase.co/storage/v1/object/public/campaign-images/abc/front%20gate.jpg',
  )
  assert.equal(campaignPhotoUrl('https://x.supabase.co', ''), '')
})

test('phone cleaning', () => {
  assert.equal(cleanPhone('0803 123 4567'), '08031234567')
  assert.equal(cleanPhone('+234 803 123 4567'), '+2348031234567')
  assert.equal(cleanPhone('12'), '')
})

test('lead validation matches the database rules', () => {
  const ok = { name: 'Ada Obi', phone: '08031234567', email: '', consent: true }
  assert.equal(validateLead(ok), null)
  assert.match(validateLead({ ...ok, consent: false }), /tick/)
  assert.match(validateLead({ ...ok, phone: '', email: '' }), /phone number or an email/)
  assert.match(validateLead({ ...ok, name: ' ' }), /name/)
  assert.match(validateLead({ ...ok, phone: '12' }), /phone/)
  assert.match(validateLead({ ...ok, phone: '', email: 'not-an-email' }), /email/)
  assert.equal(validateLead({ ...ok, phone: '', email: 'a@b.ng' }), null)
})

test('link preview html carries the title, photo and escaped text', () => {
  const html = renderCampaignHtml({
    slug: 'land-uyo', title: 'Land <b>in</b> Uyo', headline: 'Land & more', subheadline: 'Near the road',
    facts: [{ label: 'Size', value: '700 sqm' }], photos: ['a/b.jpg'], cta_label: 'Enquire', disclosure: 'Family-owned',
  }, { origin: 'https://www.dealmatch.com.ng', supabaseUrl: 'https://x.supabase.co' })
  assert.match(html, /<title>Land &lt;b&gt;in&lt;\/b&gt; Uyo<\/title>/)
  assert.match(html, /og:image" content="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/campaign-images\/a\/b\.jpg"/)
  assert.match(html, /Land &amp; more/)
  assert.match(html, /og:url" content="https:\/\/www\.dealmatch\.com\.ng\/l\/land-uyo"/)
  assert.doesNotMatch(html, /<b>/)
})
