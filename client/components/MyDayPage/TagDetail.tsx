import { MailOutline } from '@mui/icons-material';
import { Box, Button, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagGroup, TagPerson } from '#shared/tags.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import HelpTip from '../App/HelpTip.tsx';
import TeamChart, { type Detail } from './TeamChart.tsx';

/** Distinct lines for people, the same person the same color in both charts. */
const PERSON_COLORS = ['#1e88e5', '#e53935', '#43a047', '#fb8c00', '#8e24aa', '#00897b', '#6d4c41', '#546e7a', '#d81b60', '#3949ab'];
/** People drawn at first; the rest a click away. */
const SHOWN = 5;

export const percent = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);

/**
 * A line of Tags unfolded (decision 58): time logged day by day, then the
 * plan of time left at the end of each day — everyone's together, the work
 * the tag takes (decision 68), and each person's own line. In the tooltip of a day each person's value comes with
 * its detail: in how many tasks, and ✉ the comments they left; the share
 * stays in the legend, being the whole range's. The table under them: each one's time,
 * share of their own time, plan now and comments.
 */
export default function (p: { group: TagGroup; since: string }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const theme = useTheme();
  const palette = (theme.vars ?? theme).palette;
  const employees = useEmployees();
  const detail = useQuery(trpc.Tags.detail.queryOptions({ since: p.since, group: p.group }));
  const [all, setAll] = useState(false);
  const data = detail.data;
  if (!data) return <Typography variant="caption" sx={{ color: 'text.secondary', p: 1 }}>{t('common.loading')}</Typography>;
  if (data.persons.length === 0) {
    return <Typography variant="body2" sx={{ color: 'text.secondary', py: 1.5, px: 2 }}>{t('tagStats.nobody')}</Typography>;
  }
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;
  const color = new Map(data.persons.map((person, i) => [person.employeeId, PERSON_COLORS[i % PERSON_COLORS.length]!]));
  const drawn = all ? data.persons : data.persons.slice(0, SHOWN);
  const lines = (values: (person: TagPerson) => number[], legend: (person: TagPerson) => string, detail: (person: TagPerson) => Detail[]) =>
    drawn.filter((person) => values(person).some((v) => v > 0)).map((person) => ({
      id: String(person.employeeId), label: name(person.employeeId), legend: legend(person),
      color: color.get(person.employeeId)!, values: values(person), detail: detail(person),
    }));
  const inTasks = (count: number) => t('tagStats.detail.inTasks', { count });
  const mail = (count: number) => <><MailOutline sx={{ fontSize: 14 }} />{count}</>;
  // The tooltip names the person only: the share in the legend is the whole range's, not the day's.
  const spent = lines((person) => person.daily, (person) => `${name(person.employeeId)} · ${percent(person.share)}`, (person) => [
    { values: person.dailyTasks, render: inTasks, peak: true },
    { values: person.dailyComments, render: mail },
  ]);
  const planned = lines((person) => person.planned, (person) => name(person.employeeId), (person) => [
    { values: person.plannedTasks, render: inTasks, peak: true },
  ]);
  // Everyone's together first: the work of the day, then who did it (decision 68).
  const sumOf = (values: (person: TagPerson) => number[]) =>
    data.days.map((_, i) => data.persons.reduce((sum, person) => sum + (values(person)[i] ?? 0), 0));
  const total = (values: (person: TagPerson) => number[]) =>
    ({ id: 'total', label: t('tagStats.detail.total'), color: palette.text.primary, values: sumOf(values) });
  const spentLines = spent.length ? [total((person) => person.daily), ...spent] : [];
  const plannedLines = planned.length ? [total((person) => person.planned), ...planned] : [];
  const sum = (pick: (person: TagPerson) => number) => data.persons.reduce((acc, person) => acc + pick(person), 0);
  const hours = (v: number) => format.minutes(Math.round(v));
  const axis = (v: number) => format.minutes(v >= 60 ? Math.round(v / 60) * 60 : Math.round(v));
  const heading = (title: string, hint: string) => (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{title}</Typography>
      <HelpTip title={hint} />
    </Stack>
  );

  return (
    <Stack spacing={2} sx={{ py: 1.5, px: { xs: 1, sm: 2 } }}>
      <Box>
        {heading(t('tagStats.detail.time'), t('tagStats.detail.timeHint'))}
        {spent.length > 0
          ? <TeamChart days={data.days} format={hours} axisFormat={axis} series={spentLines} />
          : <Typography variant="caption" sx={{ color: 'text.disabled' }}>{t('tagStats.detail.noTime')}</Typography>}
      </Box>
      <Box>
        {heading(t('tagStats.detail.plan'), t('tagStats.detail.planChartHint'))}
        {planned.length > 0
          ? <TeamChart days={data.days} format={hours} axisFormat={axis} series={plannedLines} />
          : <Typography variant="caption" sx={{ color: 'text.disabled' }}>{t('tagStats.detail.noPlan')}</Typography>}
      </Box>
      {data.persons.length > SHOWN && (
        <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => setAll((v) => !v)}>
          {all ? t('tagStats.detail.fewer') : t('tagStats.detail.all', { count: data.persons.length })}
        </Button>
      )}
      <Table
        size="small"
        sx={{
          '& td, & th': { px: 0.75 },
          '& th': { color: 'text.secondary', fontSize: 12 },
          // On a phone: who, how much and the plan; the share and comments are in the charts' legend and tooltips.
          '& td:nth-of-type(3), & th:nth-of-type(3), & td:nth-of-type(5), & th:nth-of-type(5)': { display: { xs: 'none', sm: 'table-cell' } },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>{t('tagStats.export.person')}</TableCell>
            <TableCell align="right">{t('tagStats.detail.spent')} <HelpTip title={t('tagStats.detail.spentHint')} /></TableCell>
            <TableCell align="right">{t('tagStats.detail.share')} <HelpTip title={t('tagStats.detail.shareHint')} /></TableCell>
            <TableCell align="right">{t('tagStats.detail.planNow')} <HelpTip title={t('tagStats.detail.planHint')} /></TableCell>
            <TableCell align="right">{t('tagStats.detail.comments')}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.persons.map((person) => (
            <TableRow key={person.employeeId}>
              <TableCell>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: color.get(person.employeeId) }} />
                  <span>{name(person.employeeId)}</span>
                </Stack>
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{format.minutes(person.minutes)}</TableCell>
              <TableCell align="right">{percent(person.share)}</TableCell>
              <TableCell align="right">{person.leftMinutes !== null ? format.minutes(person.leftMinutes) : '—'}</TableCell>
              <TableCell align="right">{person.comments}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ '& td': { fontWeight: 600 } }}>
            <TableCell>{t('tagStats.detail.total')}</TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{format.minutes(sum((person) => person.minutes))}</TableCell>
            <TableCell align="right" />
            <TableCell align="right">{format.minutes(sum((person) => person.leftMinutes ?? 0))}</TableCell>
            <TableCell align="right">{sum((person) => person.comments)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Stack>
  );
}
