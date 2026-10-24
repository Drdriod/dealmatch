import { Link } from 'react-router-dom';
import { AlertCircle, Briefcase, ChevronRight, Eye, Hourglass, ShieldCheck, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProviderDashboard } from '@/hooks/useProviderDashboard';
import { formatKobo } from '@/lib/money';
import { stateMeta } from '@/lib/transactionStates';
import LoadNotice from '@/components/ui/LoadNotice';
import PageShell from '@/components/ui/PageShell';
import StatusBadge from '@/components/ui/StatusBadge';
import { EmptyBlock, LoadingBlock } from '@/components/ui/StateBlock';
import { btnSecondary, card, linkCls } from '@/components/ui/styles';

function Row({ tx }) {
  const meta = stateMeta(tx.display_state);
  return (
    <li>
      <Link to={`/transactions/${encodeURIComponent(tx.ref)}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-3 hover:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{tx.title}</span>
          <span className="text-xs text-warm">{formatKobo(tx.amount_kobo, tx.currency)}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <StatusBadge label={meta.label} tone={meta.tone} />
          <ChevronRight className="h-4 w-4 text-warm" aria-hidden="true" />
        </span>
      </Link>
    </li>
  );
}

function Section({ icon: Icon, title, rows, empty }) {
  return (
    <section className={card} aria-label={title}>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
        <Icon className="h-4 w-4 text-terracotta" aria-hidden="true" /> {title}
        <span className="rounded-full bg-cream-deep px-2 text-xs font-semibold">{rows.length}</span>
      </h2>
      {rows.length ? <ul className="divide-y divide-line/70">{rows.map((r) => <Row key={r.ref} tx={r} />)}</ul> : <p className="px-3 py-2 text-sm text-warm">{empty}</p>}
    </section>
  );
}

export default function ProviderWorkspacePage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useProviderDashboard(user?.id);

  if (loading && !data) return <PageShell title="Provider workspace"><LoadingBlock label="Loading your workspace" /></PageShell>;
  if (error) return <PageShell title="Provider workspace"><LoadNotice error={error} onRetry={reload} /></PageShell>;
  if (!data) return <PageShell title="Provider workspace"><EmptyBlock icon={Briefcase} title="Sign in to see your workspace" /></PageShell>;

  const { profile, active, waiting, attention, totals } = data;
  const verified = profile?.identity_verification_status === 'verified';

  return (
    <PageShell
      title={profile?.full_name ? `Welcome, ${profile.full_name.split(' ')[0]}` : 'Provider workspace'}
      subtitle="Your protected work, earnings and the tasks that unlock more of both."
      wide
      actions={<Link to={`/providers/${user.id}`} className={btnSecondary}><Eye className="h-4 w-4" aria-hidden="true" /> View my profile as a client</Link>}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}><p className="text-xs text-warm">Held in protection</p><p className="text-2xl font-bold">{formatKobo(totals.heldKobo)}</p><p className="text-xs text-warm">Released after both sides confirm</p></div>
        <div className={card}><p className="text-xs text-warm">Completed value</p><p className="text-2xl font-bold">{formatKobo(totals.completedKobo)}</p><p className="text-xs text-warm">{totals.completedCount} completed, before fees</p></div>
        <Link to="/wallet" className={`${card} block hover:border-terracotta`}><p className="flex items-center gap-1 text-xs text-warm"><Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Wallet and payouts</p><p className="mt-1 text-sm font-semibold text-terracotta">Open wallet</p><p className="text-xs text-warm">Balances and withdrawals</p></Link>
      </div>

      {!verified ? (
        <div role="note" className="flex items-start gap-3 rounded-xl border border-gold bg-gold/15 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Finish identity verification to be shown as a verified provider. <Link to="/verify" className={linkCls}>Verify now</Link></p>
        </div>
      ) : null}

      <Section icon={AlertCircle} title="Needs attention" rows={attention} empty="Nothing needs attention." />
      <Section icon={Briefcase} title="Active work" rows={active} empty="No active work. Browse new requests to get started." />
      <Section icon={Hourglass} title="Waiting for payment" rows={waiting} empty="Nothing is waiting on a customer." />
      <p className="text-sm"><Link to="/jobs" className={linkCls}>Browse requests and send quotes</Link> {' | '} <Link to="/payout-setup" className={linkCls}>Payout account</Link></p>
    </PageShell>
  );
}
