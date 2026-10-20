import { useQuery } from '@tanstack/react-query';
import type { Me } from '#shared/employee.ts';
import { useTRPC } from './trpc.ts';

/** The signed-in employee. Only for components rendered after sign-in (see App.tsx). */
export function useMe(): Me {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.Auth.me.queryOptions());
  if (!data) throw new Error('useMe() is used outside the signed-in area');
  return data;
}
