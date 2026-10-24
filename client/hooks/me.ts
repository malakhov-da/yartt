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

/**
 * What someone manages — the signed-in employee, or `employeeId`: people
 * (`isManager` — My team and its tab of tasks) and bots (`hasBots` — the
 * Bots block, for someone whose only reports are bots too).
 */
export function useTeamRole(employeeId?: number): { isManager: boolean; hasBots: boolean } {
  const trpc = useTRPC();
  const me = useMe();
  const employees = useQuery(trpc.Employee.list.queryOptions());
  const id = employeeId ?? me.id;
  const reports = (employees.data ?? []).filter((e) => e.managerId === id);
  const isManager = reports.some((e) => e.kind === 'human');
  return { isManager, hasBots: isManager || reports.some((e) => e.kind === 'bot') };
}
