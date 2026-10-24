import { useLoader } from '@/hooks/useLoader';
import { getProviderProfile } from '@/data/providerWorkspaceRepository';
import { listProviderTransactions } from '@/data/protectedTransactionsRepository';
import { ACTIVE_STATES, ATTENTION_STATES, WAITING_STATES } from '@/lib/transactionStates';

const sum = (rows) => rows.reduce((total, r) => total + Number(r.amount_kobo || 0), 0);

export function useProviderDashboard(userId) {
  return useLoader(async () => {
    if (!userId) return null;
    const [profile, rows] = await Promise.all([getProviderProfile(userId), listProviderTransactions(userId)]);
    const active = rows.filter((r) => ACTIVE_STATES.includes(r.display_state));
    const waiting = rows.filter((r) => WAITING_STATES.includes(r.display_state));
    const attention = rows.filter((r) => ATTENTION_STATES.includes(r.display_state));
    const completed = rows.filter((r) => r.display_state === 'completed');
    return {
      profile,
      active,
      waiting,
      attention,
      totals: { heldKobo: sum(active), completedKobo: sum(completed), completedCount: completed.length },
    };
  }, [userId]);
}
