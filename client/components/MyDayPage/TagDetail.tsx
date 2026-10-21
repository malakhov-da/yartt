import { Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagGroup } from '#shared/tags.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TeamChart from './TeamChart.tsx';

/** Distinct lines for people; the theme's colors stay for the activity chart. */
const PERSON_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41', '#546e7a', '#d81b60', '#3949ab'];
/** People drawn at first; the rest a click away. */
const SHOWN = 5;

export const percent = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);

/**
 * A line of Tags unfolded (decision 58): what happened day by day — comments,
 * closings, people at work (counts) — then each person's own time day by
 * day, a line each, never stacked: hours of different people are not added
 * up (decision 38). The legend carries each one's share of their own time
 * and their plan of time left now; the table under it says the same.
 */
export default function (p: { group: TagGroup; days: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const theme = useTheme();
  const palette = (theme.vars ?? theme).palette;
  const format = useFormat();
  const employees = useEmployees();
  const detail = useQuery(trpc.Tags.detail.queryOptions({ days: p.days, group: p.group }));
  const [all, setAll] = useState(false);
  const data = detail.data;
  if (!data) return <Typography variant="caption" sx={{ color: 'text.secondary', p: 1 }}>{t('common.loading')}</Typography>;
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;
  const drawn = all ? data.persons : data.persons.slice(0, SHOWN);
  const legend = (person: (typeof data.persons)[number]) => [
    name(person.employeeId),
    percent(person.share),
    person.leftMinutes !== null ? t('tagStats.planLeft', { time: format.minutes(person.leftMinutes) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <Stack spacing={2} sx={{ py: 1.5, px: { xs: 1, sm: 2 } }}>
      <Box>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t('tagStats.detail.activity')}</Typography>
        <TeamChart
          days={data.days}
          format={(v) => String(Math.round(v * 10) / 10)}
          series={[
            { id: 'comments', label: t('tagStats.detail.comments'), color: palette.primary.main, values: data.comments },
            { id: 'closed', label: t('tagStats.detail.closed'), color: palette.success.main, values: data.closed },
            { id: 'people', label: t('tagStats.detail.people'), color: palette.warning.main, values: data.people },
          ]}
        />
      </Box>
      {data.persons.length > 0 && (
        <Box>
          <Tooltip title={t('tagStats.detail.timeHint')} describeChild>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{t('tagStats.detail.time')}</Typography>
          </Tooltip>
          {data.persons.some((person) => person.minutes > 0) && (
            <TeamChart
              days={data.days}
              format={(v) => format.minutes(Math.round(v))}
              axisFormat={(v) => format.minutes(v >= 60 ? Math.round(v / 60) * 60 : Math.round(v))}
              series={drawn.filter((person) => person.minutes > 0).map((person, i) => ({
                id: String(person.employeeId), label: legend(person), color: PERSON_COLORS[i % PERSON_COLORS.length]!, values: person.daily,
              }))}
            />
          )}
          {data.persons.length > SHOWN && (
            <Button size="small" onClick={() => setAll((v) => !v)}>
              {all ? t('tagStats.detail.fewer') : t('tagStats.detail.all', { count: data.persons.length })}
            </Button>
          )}
        </Box>
      )}
      {data.persons.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('tagStats.nobody')}</Typography>
      ) : (
        <Table size="small" sx={{ '& td, & th': { px: 0.75 }, '& th': { color: 'text.secondary', fontSize: 12 } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('tagStats.export.person')}</TableCell>
              <TableCell align="right">{t('tagStats.detail.spent')}</TableCell>
              <TableCell align="right">
                <Tooltip title={t('tagStats.detail.shareHint')} describeChild><span>{t('tagStats.detail.share')}</span></Tooltip>
              </TableCell>
              <TableCell align="right">
                <Tooltip title={t('tagStats.detail.planHint')} describeChild><span>{t('tagStats.detail.plan')}</span></Tooltip>
              </TableCell>
              <TableCell align="right">{t('tagStats.comments')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.persons.map((person) => (
              <TableRow key={person.employeeId}>
                <TableCell>{name(person.employeeId)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{format.minutes(person.minutes)}</TableCell>
                <TableCell align="right">{percent(person.share)}</TableCell>
                <TableCell align="right">{person.leftMinutes !== null ? format.minutes(person.leftMinutes) : '—'}</TableCell>
                <TableCell align="right">{person.comments}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}
