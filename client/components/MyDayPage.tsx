import { Box, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
// visit (useVisit). At the bottom, the product name and its release
// (decision 30).
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const { pathname } = useLocation();
  useVisit(null, pathname === '/');
  const employees = useQuery(trpc.Employee.list.queryOptions());
  const isManager = (employees.data ?? []).some((e) => e.managerId === me.id);

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: 1280, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 2 }}>
        <Stack spacing={2} sx={{ flex: '999 1 560px', minWidth: 0 }}>
          <Todo />
          <CurrentTasks />
        </Stack>
        <Box sx={{ flex: '1 1 400px', minWidth: 0 }}>
          <History />
        </Box>
      </Box>
      {/* The team table is wide: the whole width, under both columns. */}
      {isManager && <Team />}
      <Typography component="footer" variant="caption" color="text.secondary" align="center">
        {t('app.name')} {__APP_VERSION__} · © 2026
      </Typography>
    </Stack>
  );
}
