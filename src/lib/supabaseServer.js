// src/lib/supabaseServer.js
//
// This file was imported by api/platform.js from the moment that file was
// created but never actually existed anywhere in the repository. Under
// native ES modules, importing a name from a module that doesn't exist
// throws at module-load time - which happens before any request handling
// code runs, so it took down every single resource routed through
// platform.js (search, categories, sitemap, all of forum), not just one
// endpoint. That's the real explanation for the FUNCTION_INVOCATION_FAILED
// crash on /forum: the crash was in this missing import, not anywhere in
// the forum-specific logic itself.

import { createClient } from '@supabase/supabase-js'

/**
 * A server-side Supabase client for public, unauthenticated reads
 * (category listings, forum browsing, search, sitemap generation). Uses
 * the anon key, so it is bound by the exact same RLS policies as a
 * signed-out visitor - it does not bypass anything.
 *
 * Call getAuthedUser(req, supabase) afterward for any resource that needs
 * to act as a specific signed-in user; it elevates this same client
 * in-place rather than requiring a second client to be threaded through.
 */
export function createServerClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Validates the caller's bearer token and, on success, elevates the given
 * client in place so that every subsequent .from()/.rpc() call on it is
 * evaluated under that user's own RLS policies for the rest of this
 * request - not the anon role the client started with.
 *
 * @returns {{ user: object|null, error: string|null }}
 */
export async function getAuthedUser(req, supabase) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return { user: null, error: 'Authentication required' }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data?.user) return { user: null, error: 'Invalid or expired session' }

  // Elevate this same client for the rest of the request. Supabase's own
  // guidance for server environments that only hold a bearer token (no
  // real refresh token) is to pass the access token for both fields here -
  // it is a short-lived, single-request client that is discarded when
  // this invocation ends, so there is nothing to actually refresh.
  await supabase.auth.setSession({ access_token: token, refresh_token: token })

  return { user: data.user, error: null }
}
