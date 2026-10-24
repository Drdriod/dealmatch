import { useMemo, useState } from 'react';
import { ArrowLeft, Scale, Search } from 'lucide-react';
import { useAdminDisputes } from '@/hooks/useDisputeCase';
import { CASE_STATES } from '@/lib/disputeStates';
import LoadNotice from '@/components/ui/LoadNotice';
import StatusBadge from '@/components/ui/StatusBadge';
import DisputeCaseView from '@/components/disputes/DisputeCaseView';
import DecisionPanel from '@/components/disputes/DecisionPanel';
import { EmptyBlock, LoadingBlock } from '@/components/ui/StateBlock';
import { btnSecondary, inputCls } from '@/components/ui/styles';

// Receives isAdmin from the permission map (UX-24). No email checks. The server also enforces staff only.
export function DisputesTab({ isAdmin, userId }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const { data, error, loading, reload } = useAdminDisputes(filter);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data || []).filter((d) => !q || d.id.toLowerCase().includes(q) || (d.transaction_ref || '').toLowerCase().includes(q) || (d.reason || '').toLowerCase().includes(q));
  }, [data, query]);

  if (!isAdmin) return <EmptyBlock icon={Scale} title="Staff only" />;

  if (selected) {
    return (
      <div className="space-y-4">
        <button type="button" className={btnSecondary} onClick={() => { setSelected(null); reload(); }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to queue
        </button>
        <DisputeCaseView disputeId={selected} userId={userId} isAdmin renderDecision={(p) => <DecisionPanel {...p} />} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by state">
        {['all', ...Object.keys(CASE_STATES)].map((s) => (
          <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === s ? 'border-terracotta bg-terracotta text-white' : 'border-line bg-white'}`}>
            {s === 'all' ? 'All' : CASE_STATES[s].label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-warm" aria-hidden="true" />
        <label htmlFor="dispute-search" className="sr-only">Search cases</label>
        <input id="dispute-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by case id, transaction or reason" className={`${inputCls} pl-9`} />
      </div>

      {loading && !data ? <LoadingBlock label="Loading cases" /> : null}
      {error ? <LoadNotice error={error} onRetry={reload} /> : null}
      {data && rows.length === 0 ? <EmptyBlock icon={Scale} title="No cases here" hint="Cases appear when a customer or provider reports a problem." /> : null}
      <ul className="space-y-2">
        {rows.map((d) => {
          const s = CASE_STATES[d.case_state] || CASE_STATES.open;
          return (
            <li key={d.id}>
              <button type="button" onClick={() => setSelected(d.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 text-left hover:border-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{d.reason}</span>
                  <span className="block truncate font-mono text-xs text-warm">{d.transaction_ref}</span>
                  <span className="text-xs text-warm">{new Date(d.created_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</span>
                </span>
                <StatusBadge label={s.label} tone={s.tone} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
