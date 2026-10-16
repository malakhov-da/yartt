import { Box, Button, Divider, Pagination, Paper, Stack, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '#client/hooks/me.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import Day from './Day.tsx';
import DayCard from './DayCard.tsx';

const DAYS_PER_PAGE = 7;

/**
 * Days from today back, with pages: shifts, time logged, visits, scores.
 * Without `employeeId` — my own days, where I start and close shifts; with
 * it — someone else's, read-only, scored by their direct manager. On an
 * employee page (`onEmployeePage`) there is no title — the page says whose
 * days — and the days are cards of one size in a grid, each opening whole
 * in a dialog: a long day does not stretch the page.
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
  const dayOf = (day: NonNullable<typeof data>['days'][number]) => (
    <Day
      key={day.day}
      day={day}
      isToday={day.day === data!.today}
      tasks={tasks}
      hasOpenShift={data!.hasOpenShift}
      employeeId={p.employeeId}
      canScore={p.canScore ?? false}
    />
  );

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {!p.onEmployeePage && (
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('myDay.history.title')}</Typography>
          <Button size="small" component={Link} to={`/employees/${me.id}`}>{t('myDay.history.stats')}</Button>
        </Stack>
      )}
      {p.onEmployeePage ? (
        <Box
          sx={{
            display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            opacity: history.isPlaceholderData ? 0.6 : 1,
          }}
        >
          {data?.days.map((day) => (
            <DayCard key={day.day} dialog={dayOf(day)}>{dayOf(day)}</DayCard>
          ))}
        </Box>
      ) : (
        <Stack spacing={2} divider={<Divider />} sx={{ opacity: history.isPlaceholderData ? 0.6 : 1 }}>
          {data?.days.map(dayOf)}
        </Stack>
      )}
      {pages > 1 && (
        <Pagination count={pages} page={page} onChange={(_, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
    </Paper>
  );
}
