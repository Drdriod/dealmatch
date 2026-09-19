// src/lib/schemaValidation.js
//
// Also imported by api/platform.js from day one but never actually created -
// see the comment at the top of supabaseServer.js for why a missing module
// here crashed every resource in that file, not just the one that calls
// validateAttributes() directly.
//
// categories.attribute_schema is a JSON Schema (draft-07) document per
// category (see supabase/migrations/20260731000001_seed_initial_categories.sql
// for examples). ajv is already a project dependency for exactly this.

import Ajv from 'ajv'
import { getCategoryById } from '../modules/catalog/catalogService.js'

const ajv = new Ajv({ allErrors: true, strict: false })

// Compiled validators are expensive to build, so they're cached per
// category id. clearValidatorCache() is called by the catalog module
// whenever a category's schema is edited, so a stale compiled validator
// is never used against an updated schema.
const validatorCache = new Map()

function getValidator(categoryId, schema) {
  if (validatorCache.has(categoryId)) return validatorCache.get(categoryId)
  const validate = ajv.compile(schema && Object.keys(schema).length ? schema : { type: 'object' })
  validatorCache.set(categoryId, validate)
  return validate
}

/**
 * Validates a listing's attributes object against its category's stored
 * JSON Schema.
 *
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export async function validateAttributes(supabase, categoryId, attributes) {
  let category
  try {
    // Routed through catalogService.js (the module that owns the
    // categories table) rather than querying it directly here, to respect
    // this project's own module-boundary convention (see
    // scripts/check-architecture-fitness.mjs).
    category = await getCategoryById(supabase, categoryId)
  } catch {
    return { valid: false, errors: [{ path: '', message: 'Unknown category' }] }
  }

  const validate = getValidator(categoryId, category.attribute_schema)
  const valid = validate(attributes || {})

  if (valid) return { valid: true, errors: [] }

  const errors = (validate.errors || []).map(e => ({
    path: e.instancePath || e.schemaPath || '',
    message: e.message || 'Invalid value',
  }))
  return { valid: false, errors }
}

/**
 * Drops the cached compiled validator for a category, so the next
 * validateAttributes() call for it recompiles against the current schema.
 * Call this after any write to categories.attribute_schema.
 */
export function clearValidatorCache(categoryId) {
  validatorCache.delete(categoryId)
}
