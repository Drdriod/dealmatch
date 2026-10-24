import { useCallback, useState } from 'react';
import { useLoader } from '@/hooks/useLoader';
import { addDisputeNote, decideDispute, getDispute, listAdminDisputes, listDisputeEvents } from '@/data/disputesRepository';

export function useDisputeCase(disputeId) {
  const loader = useLoader(async () => {
    const [dispute, events] = await Promise.all([getDispute(disputeId), listDisputeEvents(disputeId)]);
    return dispute ? { dispute, events } : null;
  }, [disputeId]);

  const [action, setAction] = useState({ busy: false, error: null });

  const run = useCallback(
    async (fn) => {
      setAction({ busy: true, error: null });
      try {
        await fn();
        await loader.reload();
        setAction({ busy: false, error: null });
        return true;
      } catch (e) {
        setAction({ busy: false, error: e.message });
        return false;
      }
    },
    [loader],
  );

  const addNote = useCallback((note, evidencePaths) => run(() => addDisputeNote({ disputeId, note, evidencePaths })), [run, disputeId]);
  const decide = useCallback((decision, reason) => run(() => decideDispute({ disputeId, decision, reason })), [run, disputeId]);

  return { ...loader, addNote, decide, action };
}

export function useAdminDisputes(caseState) {
  return useLoader(() => listAdminDisputes(caseState), [caseState]);
}
