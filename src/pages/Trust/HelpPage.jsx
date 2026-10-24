import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import TrustLayout from '@/components/trust/TrustLayout';
import { linkCls } from '@/components/ui/styles';

const FAQ = [
  ['When does the provider get paid?', 'After both the customer and the provider confirm the work is done. Until then the payment is held.'],
  ['What if the work is not done properly?', 'Report a problem from the transaction page. Release is paused while DealMatch staff review the case.'],
  ['What can I send as evidence?', 'Photos (JPG, PNG, WebP) and PDF files, up to 10 MB each and up to 10 files per case.'],
  ['Can I pay the provider directly?', 'You can, but then DealMatch Protection does not apply to that payment.'],
  ['Why is a listing contact hidden?', 'Contact details are shown after the contact fee is paid. This keeps listings from being bypassed.'],
  ['How do I delete my account?', 'Use the delete account page. Open escrow balances must be settled first.'],
];

export default function HelpPage() {
  return (
    <TrustLayout title="Help centre" subtitle="Answers to the questions we hear most.">
      <div className="divide-y divide-line rounded-xl border border-line bg-white">
        {FAQ.map(([q, a]) => (
          <details key={q} className="group p-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta">
              {q}
              <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <p className="mt-2 text-sm text-warm">{a}</p>
          </details>
        ))}
      </div>
      <p className="text-sm">Still stuck? <Link to="/contact" className={linkCls}>Contact support</Link>.</p>
    </TrustLayout>
  );
}
