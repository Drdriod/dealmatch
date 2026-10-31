import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Flag, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProtectedTransaction } from '@/hooks/useProtectedTransaction';
import { openDispute } from '@/data/disputesRepository';
import { canReportProblem } from '@/lib/transactionStates';
import { REASONS } from '@/lib/disputeStates';
import { formatKobo } from '@/lib/money';
import LoadNotice from '@/components/ui/LoadNotice';
import PageShell from '@/components/ui/PageShell';
import EvidenceUploader from '@/components/disputes/EvidenceUploader';
import { EmptyBlock, InlineError, LoadingBlock } from '@/components/ui/StateBlock';
import { btnPrimary, card, inputCls, linkCls } from '@/components/ui/styles';

export default function DisputeNewPage() {
  const [params] = useSearchParams();
  const ref = params.get('transaction') || '';
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin'; // display hint only; the database decides with is_admin()
  const { data, error, loading, reload } = useProtectedTransaction(ref, { userId: user?.id, isAdmin });
  const [reason, setReason] = useState(REASONS[0]);
  const [details, setDetails] = useState('');
  const [paths, setPaths] = useState([]);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (!ref) return <PageShell title="Report a Problem"><EmptyBlock icon={Flag} title="No transaction selected" hint="Open one of your transactions and choose Report a Problem."><Link to="/dashboard" className={linkCls}>Go to dashboard</Link></EmptyBlock></PageShell>;
  if (loading && !data) return <PageShell title="Report a Problem"><LoadingBlock /></PageShell>;
  if (error) return <PageShell title="Report a Problem"><LoadNotice error={error} onRetry={reload} /></PageShell>;
  if (!data || !canReportProblem(data.tx.display_state, data.role)) {
    return (
      <PageShell title="Report a Problem" backTo={ref ? `/transactions/${encodeURIComponent(ref)}` : '/dashboard'}>
        <EmptyBlock icon={Flag} title="You can't report a problem here" hint="You can report a problem on funded work that is not finished, if you are the customer or the provider." />
      </PageShell>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setSubmitError(null);
    try {
      const id = await openDispute({ transactionRef: ref, reason, details: details.trim(), evidencePaths: paths });
      navigate(`/disputes/${id}`, { replace: true });
    } catch (err) {
      setSubmitError(err.message);
      setBusy(false);
    }
  }

  const { tx } = data;
  return (
    <PageShell
      title="Report a Problem"
      subtitle={`We're here to help resolve your transaction concerns. ${tx.title}, ${formatKobo(tx.amount_kobo, tx.currency)}. Payment release pauses while we review.`}
      backTo={`/transactions/${encodeURIComponent(ref)}`}
    >
      <form onSubmit={submit} className={`${card} space-y-5`}>
        <div>
          <label htmlFor="reason" className="mb-1 block text-sm font-semibold">What went wrong?</label>
          <select id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="details" className="mb-1 block text-sm font-semibold">Tell us what happened and provide relevant information to help us review your case.</label>
          <textarea id="details" rows={5} maxLength={4000} required value={details} onChange={(e) => setDetails(e.target.value)} className={inputCls} placeholder="What was agreed, what happened instead, and when." />
          <p className="mt-1 text-right text-xs text-warm">{details.length} / 4000</p>
        </div>
        <EvidenceUploader userId={user?.id} paths={paths} onChange={setPaths} />
        <InlineError message={submitError} />
        <button type="submit" className={btnPrimary} disabled={busy || details.trim().length < 10}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
          Submit Report
        </button>
      </form>
    </PageShell>
  );
}
