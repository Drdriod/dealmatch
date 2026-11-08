// File storage for pages and components. Pages never call supabase.storage themselves; they use
// these two functions, so bucket names, option handling and the (future) change of storage provider
// live in one place. Results keep the Supabase { data, error } shape so callers keep their own messages.
import { supabase } from '@/lib/supabase'

// Uploads one file to a bucket. Returns { data, error } (data.path is the stored path).
export function uploadFile(bucket, path, file, options = {}) {
  return supabase.storage.from(bucket).upload(path, file, options)
}

// The public URL for a stored path in a public bucket. Private buckets use storage paths and signed
// URLs on the admin side instead.
export function publicUrlFor(bucket, path) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
