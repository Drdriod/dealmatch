import { Link } from 'react-router-dom';
import PageShell from '@/components/ui/PageShell';
import { card, linkCls } from '@/components/ui/styles';

const LINKS = [
  ['/protection', 'Protection'],
  ['/help', 'Help'],
  ['/rules', 'Marketplace rules'],
  ['/contact', 'Contact'],
  ['/about', 'About'],
];

export function Section({ title, children }) {
  return (
    <section className={`${card} space-y-3 text-sm leading-relaxed`}>
      <h2 className="text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

export default function TrustLayout({ title, subtitle, children }) {
  return (
    <PageShell title={title} subtitle={subtitle}>
      <nav aria-label="Trust and help pages" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {LINKS.map(([to, label]) => (
          <Link key={to} to={to} className={linkCls}>{label}</Link>
        ))}
      </nav>
      {children}
    </PageShell>
  );
}
