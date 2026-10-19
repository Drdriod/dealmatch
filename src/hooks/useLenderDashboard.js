import { useLoader } from '@/hooks/useLoader'
import { fetchApplications, fetchPipeline } from '@/data/lenderRepository'
import { unwrap } from '@/lib/loader'

// Two reads, kept apart because they depend on different things: the applications list follows
// the status filter, the pipeline (funnel, charts, KPIs, board) is always unfiltered.
// `enabled` is false until the role is known to be allowed to see this page.
export function useLenderDashboard({ filter, enabled }) {
  const apps = useLoader(async () => unwrap(await fetchApplications(filter !== 'all' ? filter : null)) || [], [filter], { enabled })
  const pipeline = useLoader(async () => unwrap(await fetchPipeline()) || [], [], { enabled })
  const reload = () => { apps.reload(); pipeline.reload() }
  return {
    apps: apps.data || [],
    pipeline: pipeline.data || [],
    loading: apps.loading,
    pipelineLoading: pipeline.loading,
    error: apps.error || pipeline.error,
    reload,
  }
}
