import { List, ListItemAvatar, ListItemButton, ListItemText, MenuItem } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useSwitchedPerson } from '#client/hooks/session.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from './EmployeeAvatar.tsx';

/** The demo's people (null for a real installation). */
export function useDemo() {
  const trpc = useTRPC();
  return useQuery(trpc.Auth.demo.queryOptions()).data ?? null;
}

// The demo has no sign-in (DEMO_DATA): a person is picked to see the
// interface as — on the sign-in page as a list, in the profile menu as
// items. Picking signs in as them and starts My day afresh.
export default function (p: { variant: 'list' | 'menu'; exceptId?: number }) {
  const trpc = useTRPC();
  const people = useDemo();
  const switched = useSwitchedPerson();
  const signIn = useMutation(trpc.Auth.demoSignIn.mutationOptions({ onSuccess: switched }));
  const shown = (people ?? []).filter((e) => e.id !== p.exceptId);

  if (p.variant === 'menu') {
    return shown.map((e) => (
      <MenuItem key={e.id} disabled={signIn.isPending} onClick={() => signIn.mutate({ employeeId: e.id })} sx={{ gap: 1.5 }}>
        <EmployeeAvatar employee={e} size={24} />
        {e.fullName}
      </MenuItem>
    ));
  }
  return (
    <List disablePadding>
      {shown.map((e) => (
        <ListItemButton key={e.id} disabled={signIn.isPending} onClick={() => signIn.mutate({ employeeId: e.id })}>
          <ListItemAvatar><EmployeeAvatar employee={e} size={40} /></ListItemAvatar>
          <ListItemText primary={e.fullName} secondary={e.about || null} />
        </ListItemButton>
      ))}
    </List>
  );
}
