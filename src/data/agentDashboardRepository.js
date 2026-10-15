// Repository (structural pattern) for the field agent's dashboard (AgentDashboardPage).
// The page calls these and never builds a query. Photo uploads and sign-out stay in the page.
// The server's agentVerificationRepository is a different file: it takes a client as an argument.
import { supabase } from '@/lib/supabase'

// Properties assigned to this agent, newest first, with the seller and any verification records.
export function fetchAssignedProperties(agentId) {
  return supabase
    .from('properties')
    .select('*, profiles(full_name, phone, email), agent_verifications(id,verdict,submitted_at)')
    .eq('assigned_agent_id', agentId)
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
