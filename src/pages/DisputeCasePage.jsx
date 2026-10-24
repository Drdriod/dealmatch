import { useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import PageShell from '@/components/ui/PageShell';
import DisputeCaseView from '@/components/disputes/DisputeCaseView';

export default function DisputeCasePage() {
  const { id } = useParams();
  const { user } = useAuth();
  return (
    <PageShell title="Your case" subtitle="Add information or evidence while the case is open." backTo="/dashboard" backLabel="Dashboard">
      <DisputeCaseView disputeId={id} userId={user?.id} />
    </PageShell>
  );
}
