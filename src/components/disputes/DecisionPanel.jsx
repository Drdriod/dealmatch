import { useState } from 'react';
import { Gavel, Loader2 } from 'lucide-react';
import { DECISIONS } from '@/lib/disputeStates';
import { btnPrimary, btnSecondary, card, inputCls } from '@/components/ui/styles';
import { InlineError } from '@/components/ui/StateBlock';

// Staff only. The server re-checks the role. A reason is required and the decision is final.
export default function DecisionPanel({ decide, action }) {
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const valid = choice && reason.trim().length >= 10;

  return (
    <section className={`${card} space-y-4`} aria-labelledby="decision-title">
      <h3 id="decision-title" className="flex items-center gap-2 text-sm font-bold">
        <Gavel className="h-4 w-4" aria-hidden="true" /> Record a decision
      </h3>
      <fieldset className="space-y-2">
        <legend className="sr-only">Decision</legend>
        {DECISIONS.map((d) => (
          <label key={d.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm ${choice === d.id ? 'border-terracotta bg-orange-pale' : 'border-line'}`}>
            <input type="radio" name="decision" value={d.id} checked={choice === d.id} onChange={() => { setChoice(d.id); setConfirming(false); }} className="mt-0.5 accent-[#A8452A]" />
            <span>
              <span className="block font-semibold">{d.label}</span>
              <span className="text-warm">{d.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="decision-reason" className="mb-1 block text-sm font-semibold">Reason (at least 10 characters)</label>
        <textarea id="decision-reason" rows={3} maxLength={2000} value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} className={inputCls} />
      </div>
      <InlineError message={action.error} />
      {!confirming ? (
        <button type="button" className={btnPrimary} disabled={!valid} onClick={() => setConfirming(true)}>Review decision</button>
      ) : (
        <div className="space-y-3 rounded-lg bg-cream p-3 text-sm">
          <p>This is final and is added to the case history. It records the decision only. Money movement is handled separately.</p>
          <div className="flex gap-2">
            <button type="button" className={btnPrimary} disabled={action.busy} onClick={() => decide(choice, reason.trim())}>
              {action.busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              Record decision
            </button>
            <button type="button" className={btnSecondary} onClick={() => setConfirming(false)}>Back</button>
          </div>
        </div>
      )}
    </section>
  );
}
