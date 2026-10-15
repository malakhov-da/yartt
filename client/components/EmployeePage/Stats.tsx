import { Paper, Stack, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Stats } from '#shared/team.ts';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import RangePicker, { useRange } from '../App/RangePicker.tsx';
import Chart from './Chart.tsx';

/**
 * Workload and quality of a period, side by side and never mixed (decision
 * 6): quick periods or any range by dates (up to a year), and a chart of
 * every day in it.
 */
export default function (p: { employeeId: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [range, setRange, valid] = useRange();
  const stats = useQuery(trpc.Team.stats.queryOptions(
    { employeeId: p.employeeId, ...range },
    { refetchInterval: POLL_MS, placeholderData: keepPreviousData, enabled: valid },
  ));

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('employee.stats.title')}</Typography>
      <RangePicker range={range} onChange={setRange} />
      {stats.data && (
        <Stack spacing={1.5} sx={{ opacity: stats.isPlaceholderData ? 0.6 : 1 }}>
          <Figures stats={stats.data.stats} />
          <Chart days={stats.data.days} />
        </Stack>
      )}
    </Paper>
  );
}

/** The three figures; also a line in the Team list. */
export function Figures(p: { stats: Stats; compact?: boolean }) {
  const { t } = useTranslation();
  const format = useFormat();
  const s = p.stats;
  const items = [
    { label: t('employee.stats.work'), value: format.minutes(s.workMinutes), note: t('employee.stats.workDays', { count: s.workDays }) },
    { label: t('employee.stats.spent'), value: format.minutes(s.spentMinutes), note: null },
    {
      label: t('employee.stats.score'),
      value: s.weightedScore === null ? '—' : `${Math.round(s.weightedScore)}%`,
      note: t('employee.stats.scoredDays', { count: s.scoredDays }),
    },
  ];

  if (p.compact) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {items.map((i) => `${i.label}: ${i.value}${i.note ? ` (${i.note})` : ''}`).join(' · ')}
      </Typography>
    );
  }
  return (
    <Stack direction="row" sx={{ gap: 3, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <Stack key={i.label} sx={{ minWidth: 140 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{i.label}</Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 600 }}>{i.value}</Typography>
          {i.note && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{i.note}</Typography>}
        </Stack>
      ))}
    </Stack>
  );
}
