import { Link } from 'react-router-dom';
import TrustLayout, { Section } from '@/components/trust/TrustLayout';
import { useLoader } from '@/hooks/useLoader';
import { listContactFees } from '@/data/feesRepository';
import { formatKobo } from '@/lib/money';
import LoadNotice from '@/components/ui/LoadNotice';
import { linkCls } from '@/components/ui/styles';

// COUNSEL REVIEW: every sentence here must match what the code does today.
// Rules reflected: payment held until both sides confirm (dual confirmation),
// a reported problem pauses release, contact details stay hidden until the fee is paid.
// Add timing or coverage claims only after counsel and the release code agree.
const STEPS = [
  ['Find your match', 'Choose an eligible offer under People or Places.'],
  ['Fund the transaction', 'Make payment through DealMatch. Your payment goes to DealMatch, not straight to the provider.'],
  ['Track the transaction', 'Follow the transaction status on the transaction page. The money stays held while the work is done.'],
  ['Confirm completion', 'The customer and the provider each confirm the work is done.'],
  ['Payment is released', 'Once both have confirmed, the provider is paid.'],
];

export default function ProtectionPage() {
  const fees = useLoader(listContactFees, []);
  return (
    <TrustLayout title="DealMatch Protection" subtitle="Every deal deserves protection. DealMatch Protection provides a structured way to manage eligible payments and transaction completion, and a way to report a problem if something goes wrong.">
      <Section title="How a protected payment works">
        <ol className="space-y-3">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-terracotta text-xs font-bold text-white">{i + 1}</span>
              <span><span className="font-semibold">{t}.</span> {d}</span>
            </li>
          ))}
        </ol>
        <p>Every step is recorded on the transaction page, so both sides see the same timeline. Keep your deal on DealMatch so it stays protected.</p>
      </Section>

      <Section title="If something goes wrong">
        <p>Either side can report a problem while the work is funded and not finished. Reporting a problem pauses the release of payment. You can add a description and photos or PDF files. DealMatch staff review the case and record a decision with a written reason.</p>
        <p>Open the transaction from your dashboard and choose <span className="font-semibold">Report a problem</span>.</p>
      </Section>

      <Section title="Fees">
        <p>Fees are set by DealMatch and shown before you pay. Contact fees for listings are:</p>
        {fees.error ? <LoadNotice error={fees.error} onRetry={fees.reload} /> : null}
        {fees.data?.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {fees.data.map((f) => (
              <li key={f.fee_key} className="flex justify-between px-3 py-2"><span>{f.label}</span><span className="font-semibold">{formatKobo(f.amount_kobo)}</span></li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="What is not covered">
        <ul className="list-disc space-y-1 pl-5">
          <li>Money you send outside DealMatch, including direct bank transfers and cash.</li>
          <li>Agreements that were never recorded on DealMatch.</li>
        </ul>
        <p>Keep payment and conversation on DealMatch so a case can be reviewed with a full record. See the <Link to="/rules" className={linkCls}>marketplace rules</Link>.</p>
      </Section>
    </TrustLayout>
  );
}
