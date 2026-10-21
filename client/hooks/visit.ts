import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTRPC } from './trpc.ts';

/** A tab hidden at least this long counts as a new visit when it is back. */
export const VISIT_GAP_MS = 10 * 60_000;

/**
 * Logs a visit to a task, or to any other screen (taskId null), while
 * `active`: on opening a screen (`screen` — its address), and on coming back
 * to the tab after it was hidden for VISIT_GAP_MS. Sitting on a page is one
 * visit; the database also throttles.
 */
export function useVisit(taskId: number | null, active: boolean, screen = ''): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { mutate } = useMutation(trpc.Visit.log.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.MyDay.pathKey() }),
  }));

  useEffect(() => {
    if (!active) return;
    mutate({ taskId });
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null) {
        if (Date.now() - hiddenAt >= VISIT_GAP_MS) mutate({ taskId });
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, [taskId, active, screen, mutate]);
}
