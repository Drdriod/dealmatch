import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, Copy, CreditCard, Loader2, ShieldCheck, Smartphone, XCircle } from 'lucide-react';
import { formatKobo } from '@/lib/money';
import { btnPrimary, btnSecondary, card, linkCls } from '@/components/ui/styles';
import { InlineError } from '@/components/ui/StateBlock';

/*
  One checkout for every purpose (UX-9). It holds no business rules.
  The caller supplies everything that comes from the server:

  summary:  { title, subtitle, currency, lines: [{ label, amountKobo, note }], totalKobo }
            Lines and total come from the fee registry or the quote. Never computed here.
  terms:    { version, href }  the protection terms the person acknowledges
  startPayment():          async, returns { reference, bank: { bankName, accountNumber, accountName } }
  getPaymentStatus(ref):   async, returns 'pending' | 'succeeded' | 'failed'
  onDone(reference):       called once payment is confirmed
  No card data is collected in the browser. Card and USSD stay off until Flutterwave V4 supports them here.
*/
const POLL_MS = 5000;
const POLL_LIMIT = 180;

export default function CheckoutPanel({ summary, terms, startPayment, getPaymentStatus, onDone }) {
  const [step, setStep] = useState('review'); // review | pay | confirmed | failed
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [payment, setPayment] = useState(null);
  const [copied, setCopied] = useState(false);
  const polls = useRef(0);

  useEffect(() => {
    if (step !== 'pay' || !payment) return undefined;
    polls.current = 0;
    const timer = setInterval(async () => {
      polls.current += 1;
      try {
        const status = await getPaymentStatus(payment.reference);
        if (status === 'succeeded') {
          clearInterval(timer);
          setStep('confirmed');
          onDone?.(payment.reference);
        } else if (status === 'failed') {
          clearInterval(timer);
          setStep('failed');
        } else if (polls.current >= POLL_LIMIT) {
          clearInterval(timer);
          setError('We have not seen your transfer yet. If you already paid, it may take a few more minutes. Check this transaction later.');
        }
      } catch {
        /* a failed poll is retried on the next tick */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [step, payment, getPaymentStatus, onDone]);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      setPayment(await startPayment());
      setStep('pay');
    } catch (e) {
      setError(e.message || 'We could not start the payment. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(payment.bank.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy is not available. Select the number and copy it by hand.');
    }
  }

  const currency = summary.currency || 'NGN';

  return (
    <section className={`${card} space-y-5`} aria-labelledby="checkout-title">
      <div>
        <h2 id="checkout-title" className="text-lg font-bold">
          {summary.title}
        </h2>
        {summary.subtitle ? <p className="text-sm text-warm">{summary.subtitle}</p> : null}
      </div>

      <dl className="space-y-2 rounded-lg bg-cream p-4 text-sm">
        {summary.lines.map((l) => (
          <div key={l.label} className="flex justify-between gap-4">
            <dt className="text-warm">
              {l.label}
              {l.note ? <span className="block text-xs">{l.note}</span> : null}
            </dt>
            <dd className="font-semibold">{formatKobo(l.amountKobo, currency)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-line pt-2 text-base">
          <dt className="font-bold">Total</dt>
          <dd className="font-bold text-terracotta">{formatKobo(summary.totalKobo, currency)}</dd>
        </div>
      </dl>

      {step === 'review' && (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Payment method</legend>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
              <label className="flex flex-col items-center gap-1 rounded-lg border-2 border-terracotta bg-orange-pale p-3">
                <input type="radio" name="method" checked readOnly className="sr-only" />
                <Building2 className="h-5 w-5" aria-hidden="true" />
                Bank transfer
              </label>
              {[
                [CreditCard, 'Card'],
                [Smartphone, 'USSD'],
              ].map(([Icon, name]) => (
                <div key={name} className="flex flex-col items-center gap-1 rounded-lg border border-line p-3 text-warm opacity-70">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  {name}
                  <span className="font-normal">Not available yet</span>
                </div>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#A8452A]"
            />
            <span>
              I have read how DealMatch Protection works and agree to{' '}
              <a href={terms.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                the terms{terms.version ? ` (version ${terms.version})` : ''}
              </a>
              . My payment is held until both sides confirm the work.
            </span>
          </label>

          <InlineError message={error} />
          <button type="button" className={`${btnPrimary} w-full`} disabled={!agreed || busy} onClick={begin}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Get account details for {formatKobo(summary.totalKobo, currency)}
          </button>
        </>
      )}

      {step === 'pay' && payment && (
        <div className="space-y-3">
          <p className="text-sm">Send exactly {formatKobo(summary.totalKobo, currency)} to this account. Use the transfer option in your bank app.</p>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
            <div className="text-sm">
              <p className="text-xs text-warm">{payment.bank.bankName}</p>
              <p className="font-mono text-lg font-bold">{payment.bank.accountNumber}</p>
              <p className="text-xs text-warm">{payment.bank.accountName}</p>
            </div>
            <button type="button" className={btnSecondary} onClick={copy}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p role="status" className="flex items-center gap-2 text-sm text-warm">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Waiting for your transfer. This page updates on its own.
          </p>
          <InlineError message={error} />
        </div>
      )}

      {step === 'confirmed' && (
        <div role="status" className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>Payment received. It is now held safely until both sides confirm the work.</p>
        </div>
      )}

      {step === 'failed' && (
        <div role="alert" className="space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-orange-pale p-4 text-sm text-terracotta-dark">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p>The payment did not go through. You have not been charged for this attempt.</p>
          </div>
          <button type="button" className={btnPrimary} onClick={() => { setStep('review'); setPayment(null); }}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}
