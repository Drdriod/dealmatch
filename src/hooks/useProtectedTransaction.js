import { useCallback, useState } from 'react';
import { useLoader } from '@/hooks/useLoader';
import { confirmCompletion, getProtectedTransaction, listTransactionEvents } from '@/data/protectedTransactionsRepository';
import { roleFor } from '@/lib/transactionStates';

export function useProtectedTransaction(ref, { userId, isAdmin }) {
  const loader = useLoader(async () => {
    const [tx, events] = await Promise.all([getProtectedTransaction(ref), listTransactionEvents(ref)]);
    if (!tx) return null;
    return { tx, events, role: roleFor(tx, userId, isAdmin) };
  }, [ref, userId, isAdmin]);

  const [action, setAction] = useState({ busy: false, error: null });

  const confirm = useCallback(async () => {
    const current = loader.data;
    if (!current) return;
    setAction({ busy: true, error: null });
    try {
      await confirmCompletion({ sourceId: current.tx.source_id, role: current.role });
      await loader.reload();
      setAction({ busy: false, error: null });
    } catch (e) {
      setAction({ busy: false, error: e.message });
    }
  }, [loader]);

  return { ...loader, confirm, action };
}
