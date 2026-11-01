import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  subtypeOptions, defaultSubtype, findLeaf, subtypeChoices,
  providerTypeForGroup, groupForProviderType, peopleGroups, placeGroups, categoryIdsFor,
} from './placeCategories.js'

const tree = [
  { id: 1, slug: 'land-and-plots', name: 'Land & Plots', pillar: 'place', children: [
    { id: 11, slug: 'residential-land', name: 'Residential Land' },
    { id: 12, slug: 'commercial-land', name: 'Commercial Land' },
    { id: 13, slug: 'agricultural-land', name: 'Agricultural Land' },
  ] },
  { id: 2, slug: 'education', name: 'Education', pillar: 'people', children: [{ id: 21, slug: 'coaching', name: 'Coaching' }, { id: 22, slug: 'academic-home-tutors', name: 'Academic & Home Lesson Tutors' }] },
  { id: 3, slug: 'empty-group', name: 'Empty', pillar: 'people', children: [] },
]

test('land for sale offers the three land kinds, residential first', () => {
  assert.deepEqual(subtypeOptions({ category: 'sale', propertyType: 'land' }), ['residential-land', 'commercial-land', 'agricultural-land'])
})

test('every offered subtype set starts with the database default, so form and trigger agree', () => {
  const cases = [
    ['sale', 'land'], ['sale', 'detached'], ['sale', 'duplex'], ['sale', 'terrace'], ['sale', 'apartment'], ['sale', 'commercial'],
    ['rental', 'apartment'], ['rental', 'detached'], ['shortlet', 'apartment'], ['hotel', 'hotel'],
  ]
  for (const [category, propertyType] of cases) {
    assert.equal(subtypeOptions({ category, propertyType })[0], defaultSubtype({ category, propertyType }), `${category}/${propertyType}`)
  }
})

test('rentals, short-lets and hotels never offer a sale-only or land subtype', () => {
  for (const category of ['rental', 'shortlet', 'hotel']) {
    const slugs = subtypeOptions({ category, propertyType: 'apartment' })
    assert.ok(!slugs.some(s => s.endsWith('-land') || s === 'homes-residential-sales'), category)
  }
})

test('an unknown listing offers nothing and defaults to nothing', () => {
  assert.deepEqual(subtypeOptions({ category: 'bogus' }), [])
  assert.equal(defaultSubtype({ category: 'bogus' }), null)
  assert.deepEqual(subtypeOptions(), [])
})

test('findLeaf and subtypeChoices read real rows and skip ones the database lacks', () => {
  assert.equal(findLeaf(tree, 'commercial-land').id, 12)
  assert.equal(findLeaf(tree, 'nope'), null)
  assert.equal(findLeaf(null, 'x'), null)
  const choices = subtypeChoices(tree, { category: 'sale', propertyType: 'land' })
  assert.deepEqual(choices.map(c => c.id), [11, 12, 13])
  assert.deepEqual(subtypeChoices([], { category: 'sale', propertyType: 'land' }), [])
})

test('provider type follows the group, with a safe default', () => {
  assert.equal(providerTypeForGroup('trades-craftsmen'), 'artisan')
  assert.equal(providerTypeForGroup('education'), 'tutor')
  assert.equal(providerTypeForGroup('home-property-care'), 'home_service')
  assert.equal(providerTypeForGroup('licensed-experts'), 'property_professional')
  assert.equal(providerTypeForGroup('events'), 'other_skill')
  assert.equal(providerTypeForGroup(undefined), 'other_skill')
})

test('people and place groups are split by pillar, sorted, and empty groups are hidden', () => {
  assert.deepEqual(peopleGroups(tree).map(g => g.slug), ['education'])
  assert.deepEqual(peopleGroups(tree)[0].children.map(c => c.slug), ['academic-home-tutors', 'coaching'])
  assert.deepEqual(placeGroups(tree).map(g => g.slug), ['land-and-plots'])
  assert.deepEqual(peopleGroups(null), [])
})

test('a group slug filters by all its leaves, a leaf slug by itself, nothing by nothing', () => {
  assert.deepEqual(categoryIdsFor(tree, 'land-and-plots'), [11, 12, 13])
  assert.deepEqual(categoryIdsFor(tree, 'coaching'), [21])
  assert.equal(categoryIdsFor(tree, ''), null)
  assert.deepEqual(categoryIdsFor(tree, 'unknown'), [])
})

test('onboarding kinds of work open the matching People group, and every group maps back to its kind', () => {
  assert.equal(groupForProviderType('artisan'), 'trades-craftsmen')
  assert.equal(groupForProviderType('tutor'), 'education')
  assert.equal(groupForProviderType('other_skill'), '')
  assert.equal(groupForProviderType(undefined), '')
  for (const type of ['artisan', 'tutor', 'home_service', 'property_professional']) {
    assert.equal(providerTypeForGroup(groupForProviderType(type)), type)
  }
})
