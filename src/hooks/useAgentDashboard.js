import { useLoader } from '@/hooks/useLoader'
import { fetchAssignedProperties, fetchAgentScore, fetchAgentComplaints } from '@/data/agentDashboardRepository'
import { unwrap } from '@/lib/loader'

export const EMPTY_AGENT_DASHBOARD = { listings: [], score: null, complaints: [], issues: [] }

// The assigned properties are the main content, so a failed read fails the load. The score and
// the complaints can fail on their own and are named in `issues`.
async function loadAgentDashboard(agentId) {
  const [assignedRes, scoreRes, complaintsRes] = await Promise.all([
    fetchAssignedProperties(agentId), fetchAgentScore(agentId), fetchAgentComplaints(agentId),
  ])
  const issues = []
  if (scoreRes.error) issues.push('your record')
  if (complaintsRes.error) issues.push('complaints')
  return {
    listings: unwrap(assignedRes) || [],
    score: scoreRes.data ?? null,
    complaints: complaintsRes.data || [],
    issues,
  }
}

// `enabled` is false until the signed-in user has an agent, admin or superadmin role.
export function useAgentDashboard({ user, enabled }) {
  const agentId = user?.id
  const { data, loading, error, reload } = useLoader(() => loadAgentDashboard(agentId), [agentId], { enabled: !!agentId && enabled })
  return { ...(data || EMPTY_AGENT_DASHBOARD), loading, error, reload }
}
