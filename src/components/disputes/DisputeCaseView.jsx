import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, FileText, Loader2, Scale, Send } from 'lucide-react';
import { useDisputeCase } from '@/hooks/useDisputeCase';
import { CASE_STATES, DECISIONS } from '@/lib/disputeStates';
import { getEvidenceUrl } from '@/data/disputesRepository';
import LoadNotice from '@/components/ui/LoadNotice';
import StatusBadge from '@/components/ui/StatusBadge';
import Timeline from '@/components/ui/Timeline';
import EvidenceUploader from './EvidenceUploader';
import { LoadingBlock, EmptyBlock, InlineError } from '@/components/ui/StateBlock';
import { btnPrimary, btnSecondary, card, inputCls, linkCls } from '@/components/ui/styles';

function actorName(e, userId) {
  if (e.actor_id && e.actor_id === userId) return 'You';
  return e.actor_role === 'admin' ? 'DealMatch team' : 'Other side';
}

// Shared by the customer and provider case page and the admin tab.
// Staff pass renderDecision to place the decision panel under the case.
export default function DisputeCaseView({ disputeId, userId, isAdmin = false, renderDecision }) {
  const { data, error, loading, reload, addNote, decide, action } = useDisputeCase(disputeId);
  const [note, setNote] = useState('');
  const [paths, setPaths] = useState([]);
  const [linkError, setLinkError] = useState(null);

  if (loading && !data) return <LoadingBlock label="Loading case" />;
  if (error) return <LoadNotice error={error} onRetry={reload} />;
  if (!data) return <EmptyBlock icon={Scale} title="Case not found" hint="It may not exist, or you may not be a party to it." />;

  const { dispute, events } = data;
  const state = CASE_STATES[dispute.case_state] || CASE_STATES.open;
  const resolved = dispute.case_state === 'resolved';
  const decision = DECISIONS.find((d) => d.id === dispute.decision);

  async function openFile(path) {
    setLinkError(null);
    try {
      window.open(await getEvidenceUrl(path), '_blank', 'noopener,noreferrer');
    } catch (e) {
      setLinkError(e.message);
    }
  }

  async function submitNote(e) {
    e.preventDefault();
    if (await addNote(note.trim(), paths)) {
      setNote('');
      setPaths([]);
    }
  }

  return (
    <div className="space-y-5">
      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <StatusBadge label={state.label} tone={state.tone} />
          <Link to={`/transactions/${encodeURIComponent(dispute.transaction_ref)}`} className={`text-sm ${linkCls}`}>
            View transaction
          </Link>
        </div>
        <h2 className="mt-3 text-lg font-bold">{dispute.reason}</h2>
        {dispute.details ? <p className="mt-2 whitespace-pre-line text-sm text-warm">{dispute.details}</p> : null}
        {resolved && decision ? (
          <div className="mt-4 rounded-lg bg-cream p-4 text-sm">
            <p className="font-semibold">Decision: {decision.label}</p>
            <p className="mt-1 text-warm">{dispute.decision_reason}</p>
          </div>
        ) : null}
      </section>

      <section className={card}>
        <h3 className="mb-3 text-sm font-bold">Evidence ({dispute.evidence_paths.length})</h3>
        {dispute.evidence_paths.length === 0 ? (
          <p className="text-sm text-warm">No files yet.</p>
        ) : (
          <ul className="space-y-1">
            {dispute.evidence_paths.map((p) => (
              <li key={p} className="flex items-center justify-between gap-2 rounded-lg bg-cream px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-warm" aria-hidden="true" />
                  <span className="truncate">{p.split('/').pop().replace(/^[0-9a-f-]{36}-/, '')}</span>
                </span>
                <button type="button" onClick={() => openFile(p)} className={`inline-flex items-center gap-1 text-sm ${linkCls}`}>
                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2"><InlineError message={linkError} /></div>
      </section>

      <section className={card}>
        <h3 className="mb-4 text-sm font-bold">History</h3>
        <Timeline
          items={events.map((e) => ({
            id: e.id,
            title: e.event_type === 'decision' ? 'Decision recorded' : e.event_type === 'opened' ? 'Case opened' : 'Note added',
            note: e.event_type === 'opened' ? null : e.note,
            at: e.created_at,
            by: actorName(e, userId),
          }))}
        />
      </section>

      {!resolved && (
        <form onSubmit={submitNote} className={`${card} space-y-3`}>
          <label htmlFor="case-note" className="text-sm font-bold">Add information</label>
          <textarea id="case-note" rows={3} maxLength={4000} required value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="Describe what happened or respond to the other side." />
          <EvidenceUploader userId={userId} paths={paths} onChange={setPaths} existingCount={dispute.evidence_paths.length} />
          <InlineError message={action.error} />
          <button type="submit" className={btnPrimary} disabled={action.busy || !note.trim()}>
            {action.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            Send
          </button>
        </form>
      )}

      {isAdmin && !resolved && renderDecision ? renderDecision({ decide, action }) : null}
    </div>
  );
}
