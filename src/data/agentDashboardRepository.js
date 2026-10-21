// Repository (structural pattern) for the field agent's dashboard (AgentDashboardPage).
// The page calls these and never builds a query. Photo uploads and sign-out stay in the page.
// The server's agentVerificationRepository is a different file: it takes a client as an argument.
import { supabase } from '@/lib/supabase'
import { PROPERTY_OWNER_COLUMNS } from '@/lib/propertyColumns'

// Properties assigned to this agent, newest first, with the seller, the photos and any
// verification records. Resolves to { data, error } like a single query.
//
// assigned_agent_id is not readable by browser roles (migration 18), and a filter needs the same
// privilege as a read. So the agent's listing ids come from my_assigned_property_ids(), which
// answers for the signed-in agent only, and the rows are then read by id. `agentId` is kept for
// the callers; the database uses the session, never this argument.
export async function fetchAssignedProperties() {
  const { data: ids, error: idsError } = await supabase.rpc('my_assigned_property_ids')
  if (idsError) return { data: null, error: idsError }
  if (!ids || ids.length === 0) return { data: [], error: null }
  return supabase
    .from('properties')
    .select(`${PROPERTY_OWNER_COLUMNS}, images:property_images(id, url, is_primary, caption), profiles(full_name, phone, email), agent_verifications(id,verdict,submitted_at)`)
    .in('id', ids)
    .order('created_at', { ascending: false })
}

export function fetchAgentScore(agentId) {
  return supabase
    .from('agent_scores')
    .select('*')
    .eq('agent_id', agentId)
    .maybeSingle()
}

// Complaints raised against this agent, newest first.
export function fetchAgentComplaints(agentId) {
  return supabase
    .from('complaints')
    .select('*, properties(title)')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
}

// Saves the site-visit evidence. One record per agent per property, so a second submission
// replaces the first. The caller supplies the whole row.
export function saveAgentVerification(row) {
  return supabase
    .from('agent_verifications')
    .upsert(row, { onConflict: 'property_id,agent_id' })
}

// Records the agent's verdict on the property itself. The caller supplies the fields.
export function recordPropertyVerdict(propertyId, fields) {
  return supabase.from('properties').update(fields).eq('id', propertyId)
}

// The agent's written reply to a complaint, which moves it to under_review.
export function respondToComplaint(complaintId, responseText) {
  return supabase.from('complaints')
    .update({ agent_response: responseText, agent_responded_at: new Date().toISOString(), status: 'under_review' })
    .eq('id', complaintId)
}
