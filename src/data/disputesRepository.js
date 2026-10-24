import { supabase } from '@/lib/supabase';
import { EVIDENCE_LIMITS } from '@/lib/disputeStates';

const COLUMNS =
  'id, transaction_ref, opened_by, respondent_id, reason, details, evidence_paths, case_state, decision, decision_reason, decided_at, assigned_to, created_at';
const EVENT_COLUMNS = 'id, dispute_id, event_type, actor_id, actor_role, detail, note, created_at';
const BUCKET = 'dispute-evidence';

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

export async function getDispute(id) {
  return check(await supabase.from('disputes').select(COLUMNS).eq('id', id).maybeSingle());
}

export async function listDisputeEvents(id) {
  return check(await supabase.from('dispute_events').select(EVENT_COLUMNS).eq('dispute_id', id).order('created_at', { ascending: true }));
}

export async function listAdminDisputes(caseState) {
  let q = supabase.from('disputes').select(COLUMNS).not('transaction_ref', 'is', null).order('created_at', { ascending: false }).limit(200);
  if (caseState && caseState !== 'all') q = q.eq('case_state', caseState);
  return check(await q);
}

export async function openDispute({ transactionRef, reason, details, evidencePaths }) {
  const { data, error } = await supabase.rpc('open_dispute', {
    p_transaction_ref: transactionRef,
    p_reason: reason,
    p_details: details,
    p_evidence_paths: evidencePaths,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function addDisputeNote({ disputeId, note, evidencePaths }) {
  const { error } = await supabase.rpc('add_dispute_note', {
    p_dispute_id: disputeId,
    p_note: note,
    p_evidence_paths: evidencePaths,
  });
  if (error) throw new Error(error.message);
}

export async function decideDispute({ disputeId, decision, reason }) {
  const { error } = await supabase.rpc('decide_dispute', { p_dispute_id: disputeId, p_decision: decision, p_reason: reason });
  if (error) throw new Error(error.message);
}

export function validateEvidenceFile(file) {
  if (!EVIDENCE_LIMITS.types.includes(file.type)) return 'Use a JPG, PNG, WebP or PDF file.';
  if (file.size > EVIDENCE_LIMITS.maxBytes) return 'Each file must be 10 MB or smaller.';
  return null;
}

export async function uploadEvidence(file, userId) {
  const problem = validateEvidenceFile(file);
  if (problem) throw new Error(problem);
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${userId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function getEvidenceUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
