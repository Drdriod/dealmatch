import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Flag, Loader2, MessageCircle, Receipt } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProtectedTransaction } from '@/hooks/useProtectedTransaction';
import { canReportProblem, eventLabel, nextActionFor, stateMeta } from '@/lib/transactionStates';
import { formatKobo } from '@/lib/money';
import { whatsappLink } from '@/lib/supportContacts';
import LoadNotice from '@/components/ui/LoadNotice';
import PageShell from '@/components/ui/PageShell';
import StatusBadge from '@/components/ui/StatusBadge';
import Timeline from '@/components/ui/Timeline';
import { EmptyBlock, InlineError, LoadingBlock } from '@/components/ui/StateBlock';
import { btnPrimary, btnSecondary, card, linkCls } from '@/components/ui/styles';

const ROLE_LABEL = { customer: 'You are the customer', provider: 'You are the provider', admin: 'Staff view', viewer: '' };

function TermsList({ snapshot }) {
  const rows = snapshot && typeof snapshot === 'object' ? Object.entries(snapshot).filter(([, v]) => ['string', 'number'].includes(typeof v)) : [];
  if (!rows.length) return <p className="text-sm text-warm">No terms were recorded for this transaction.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-warm">{k.replace(/_/g, ' ')}</dt>
          <dd className="text-sm font-medium">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function TransactionDetailPage() {
  const { ref } = useParams();
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin'; // display hint only; the database decides with is_admin()
  const { data, error, loading, reload, confirm, action } = useProtectedTransaction(ref, { userId: user?.id, isAdmin });

  if (loading && !data) return <PageShell title="Your deal, clearly tracked."><LoadingBlock label="Loading transaction" /></PageShell>;
  if (error) return <PageShell title="Your deal, clearly tracked." backTo="/dashboard" backLabel="Dashboard"><LoadNotice error={error} onRetry={reload} /></PageShell>;
  if (!data) {
    return (
      <PageShell title="Your deal, clearly tracked." backTo="/dashboard" backLabel="Dashboard">
        <EmptyBlock icon={Receipt} title="We couldn't find this transaction" hint="It may not exist, or it may belong to another account." />
      </PageShell>
    );
  }

  const { tx, events, role } = data;
  const meta = stateMeta(tx.display_state);
  const next = nextActionFor({ state: tx.display_state, role, buyerConfirmed: tx.buyer_confirmed, providerConfirmed: tx.provider_confirmed });
  const help = whatsappLink(`Hello DealMatch, I need help with transaction ${tx.ref}`);

  return (
    <PageShell
      title={tx.title}
      subtitle={ROLE_LABEL[role]}
      backTo={role === 'provider' ? '/provider' : '/dashboard'}
      backLabel="Back"
      actions={<StatusBadge label={meta.label} tone={meta.tone} />}
    >
      <section className={card}>
        <p className="text-xs text-warm">Agreed amount</p>
        <p className="text-3xl font-bold tracking-tight">{formatKobo(tx.amount_kobo, tx.currency)}</p>
        <p className="mt-2 text-sm text-warm">{meta.help}</p>
      </section>

      <section className={card} aria-labelledby="next-title">
        <h2 id="next-title" className="mb-2 text-sm font-bold">What happens next</h2>
        {next ? <p className="text-sm text-warm">{next.description}</p> : <p className="text-sm text-warm">You don't need to do anything right now.</p>}
        <InlineError message={action.error} />
        <div className="mt-4 flex flex-wrap gap-2">
          {next?.label ? (
            <button type="button" className={btnPrimary} disabled={action.busy} onClick={confirm}>
              {action.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {next.label}
            </button>
          ) : null}
          {canReportProblem(tx.display_state, role) ? (
            <Link to={`/disputes/new?transaction=${encodeURIComponent(tx.ref)}`} className={btnSecondary}>
              <Flag className="h-4 w-4" aria-hidden="true" /> Report a Problem
            </Link>
          ) : null}
          {help ? (
            <a href={help} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Contact Support
            </a>
          ) : null}
        </div>
      </section>

      <section className={card} aria-labelledby="terms-title">
        <h2 id="terms-title" className="mb-3 text-sm font-bold">Transaction terms</h2>
        <TermsList snapshot={tx.terms_snapshot} />
        {tx.agreed_at ? (
          <p className="mt-3 text-xs text-warm">
            Agreed {new Date(tx.agreed_at).toLocaleDateString('en-NG', { dateStyle: 'medium' })}
            {tx.terms_version ? `, terms version ${tx.terms_version}` : ''}
          </p>
        ) : null}
        <p className="mt-3 text-sm"><Link to="/protection" className={linkCls}>How DealMatch Protection works</Link></p>
      </section>

      <section className={card} aria-labelledby="timeline-title">
        <h2 id="timeline-title" className="mb-4 text-sm font-bold">Transaction history</h2>
        <Timeline
          items={events.map((e) => ({ id: e.id, title: eventLabel(e.event_type), at: e.created_at, note: null }))}
          emptyText="Updates will appear here as your deal moves forward."
        />
      </section>
    </PageShell>
  );
}
