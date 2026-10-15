// Repository for the identity-document purge job (api/platform.js, daily cron).
// Documents are removed from storage by the job; this file holds the queue reads and
// writes. Service-role client only.

// Queues files that no profile references any more (superseded or legacy uploads).
export function sweepOrphanIdentityDocs(svc) {
  return svc.rpc('sweep_orphan_identity_docs')
}

// Queue rows whose retention window has ended and that are under the attempt limit.
export function findDuePurges(svc, nowIso) {
  return svc.from('identity_doc_purge_queue')
    .select('id, storage_path, attempts')
    .is('purged_at', null)
    .lte('purge_after', nowIso)
    .lt('attempts', 5)
    .order('purge_after', { ascending: true })
    .limit(200)
}

// Counts a failed storage removal against one row and keeps the reason (capped at 500 chars).
export function recordPurgeFailure(svc, row, message) {
  return svc.from('identity_doc_purge_queue')
    .update({ attempts: row.attempts + 1, last_error: String(message).slice(0, 500) })
    .eq('id', row.id)
}

export function markPurged(svc, ids, nowIso) {
  return svc.from('identity_doc_purge_queue')
    .update({ purged_at: nowIso, storage_path: null, last_error: null })
    .in('id', ids)
}
