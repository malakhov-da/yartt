import { Box, Stack } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router';
import { useMe } from '#client/hooks/me.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { useVisit } from '#client/hooks/visit.ts';
import CurrentTasks from './MyDayPage/CurrentTasks.tsx';
import History from './MyDayPage/History.tsx';
import Team from './MyDayPage/Team.tsx';
import Todo from './MyDayPage/Todo.tsx';

// The only screen (docs/product/interface.md, 1): what needs me, my current
// tasks, my team (someone with reports), my days. It stays mounted while a
// task or a person is open (App.tsx), so every return to it is logged as a
// visit (useVisit).
export default function () {
  const trpc = useTRPC();
  const me = useMe();
  const { pathname } = useLocation();
  useVisit(null, pathname === '/');
  const employees = useQuery(trpc.Employee.list.queryOptions());
  const isManager = (employees.data ?? []).some((e) => e.managerId === me.id);

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2, width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Stack spacing={2} sx={{ flex: '999 1 560px', minWidth: 0 }}>
        <Todo />
        <CurrentTasks />
        {isManager && <Team />}
      </Stack>
      <Box sx={{ flex: '1 1 400px', minWidth: 0 }}>
        <History />
      </Box>
    </Box>
  );
}
