import { Button, Divider, Pagination, Paper, Stack, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '#client/hooks/me.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import Day from './Day.tsx';

const DAYS_PER_PAGE = 7;

/**
 * Days from today back, with pages: shifts, time logged, visits, scores.
 * Without `employeeId` — my own days, where I start and close shifts; with
 * it — someone else's, read-only, scored by their direct manager. On an
 * employee page (`onEmployeePage`) there is no title: the page says whose days.
 */
export default function (p: { employeeId?: number; canScore?: boolean; onEmployeePage?: boolean }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const [page, setPage] = useState(1);
  const options = { refetchInterval: POLL_MS, placeholderData: keepPreviousData };
  const mine = useQuery(trpc.MyDay.history.queryOptions({ page }, { ...options, enabled: p.employeeId === undefined }));
  const theirs = useQuery(trpc.Team.history.queryOptions(
    { employeeId: p.employeeId ?? 0, page },
    { ...options, enabled: p.employeeId !== undefined },
  ));
  const history = p.employeeId === undefined ? mine : theirs;
  const data = history.data;
  const tasks = new Map((data?.tasks ?? []).map((task) => [task.id, task]));
  const pages = Math.ceil((data?.total ?? 0) / DAYS_PER_PAGE);

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {!p.onEmployeePage && (
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('myDay.history.title')}</Typography>
          <Button size="small" component={Link} to={`/employees/${me.id}`}>{t('myDay.history.stats')}</Button>
        </Stack>
      )}
      <Stack spacing={2} divider={<Divider />} sx={{ opacity: history.isPlaceholderData ? 0.6 : 1 }}>
        {data?.days.map((day) => (
          <Day
            key={day.day}
            day={day}
            isToday={day.day === data.today}
            tasks={tasks}
            hasOpenShift={data.hasOpenShift}
            employeeId={p.employeeId}
            canScore={p.canScore ?? false}
          />
        ))}
      </Stack>
      {pages > 1 && (
        <Pagination count={pages} page={page} onChange={(_, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
    </Paper>
  );
}
