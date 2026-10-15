import { Pagination, Paper, Stack, Tab, Tabs, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CurrentTab } from '#shared/myDay.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TaskLine from '../TaskPage/TaskLine.tsx';

const PAGE_SIZE = 20;

/** Every open task I see: mine apart from the others (decision 8), by deadline, with pages. */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [tab, setTab] = useState<CurrentTab>('mine');
  const [pages, setPages] = useState<Record<CurrentTab, number>>({ mine: 1, others: 1 });
  const page = pages[tab];
  const current = useQuery(trpc.MyDay.current.queryOptions(
    { tab, page },
    { refetchInterval: POLL_MS, placeholderData: keepPreviousData },
  ));
  const counts = current.data?.counts;
  const total = counts?.[tab] ?? 0;

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('myDay.current.title')}</Typography>
      <Tabs value={tab} onChange={(_, value: CurrentTab) => setTab(value)} sx={{ minHeight: 0, mb: 1 }}>
        {(['mine', 'others'] as const).map((value) => (
          <Tab
            key={value}
            value={value}
            label={t(`myDay.current.${value}`, { count: counts?.[value] ?? 0 })}
            sx={{ minHeight: 0, py: 1 }}
          />
        ))}
      </Tabs>
      {current.isSuccess && total === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>{t(`myDay.current.${tab}Empty`)}</Typography>
      )}
      <Stack spacing={0.75} sx={{ opacity: current.isPlaceholderData ? 0.6 : 1 }}>
        {current.data?.items.map((task) => <TaskLine key={task.id} task={task} />)}
      </Stack>
      {total > PAGE_SIZE && (
        <Pagination
          count={Math.ceil(total / PAGE_SIZE)}
          page={page}
          onChange={(_, value) => setPages((prev) => ({ ...prev, [tab]: value }))}
          sx={{ alignSelf: 'center', mt: 1 }}
        />
      )}
    </Paper>
  );
}
