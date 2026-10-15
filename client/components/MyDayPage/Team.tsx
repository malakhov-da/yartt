import { PersonAdd, PersonRemove } from '@mui/icons-material';
import {
  Box, Chip, IconButton, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Employee } from '#shared/employee.ts';
import type { Member } from '#shared/team.ts';
import { fromDay, today, useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from '../App/EmployeeAvatar.tsx';
import RangePicker, { useRange } from '../App/RangePicker.tsx';
import RestoreDialog from './RestoreDialog.tsx';

/**
 * My team — only for someone with reports (docs/product/interface.md): the
 * whole subtree for a range, direct reports first. Workload and score side
 * by side, days waiting for my score, tasks finished and deadlines that
 * simply passed. A name opens the person's page.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const queryClient = useQueryClient();
  const [range, setRange, valid] = useRange();
  const summary = useQuery(trpc.Team.summary.queryOptions(range, {
    refetchInterval: POLL_MS, placeholderData: keepPreviousData, enabled: valid,
  }));
  const [restoring, setRestoring] = useState<Employee | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.Employee.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.Team.pathKey() });
  };

  const members = summary.data ?? [];
  const direct = members.filter((m) => m.direct);
  const indirect = members.filter((m) => !m.direct);
  // Totals: hours add up; the score is weighted by hours across everyone scored.
  const total = members.reduce(
    (acc, m) => ({
      work: acc.work + m.stats.workMinutes,
      spent: acc.spent + m.stats.spentMinutes,
      weighted: acc.weighted + (m.stats.weightedScore ?? 0) * (m.stats.weightedScore === null ? 0 : m.stats.workMinutes),
      weight: acc.weight + (m.stats.weightedScore === null ? 0 : m.stats.workMinutes),
      unscored: acc.unscored + (m.direct ? m.unscoredDays : 0),
      finished: acc.finished + m.finished,
      expired: acc.expired + m.expired,
      open: acc.open + m.openTasks,
    }),
    { work: 0, spent: 0, weighted: 0, weight: 0, unscored: 0, finished: 0, expired: 0, open: 0 },
  );

  const head = [
    { key: 'person', label: t('myDay.team.person') },
    { key: 'work', label: t('employee.stats.work'), hint: t('myDay.team.workHint') },
    { key: 'spent', label: t('myDay.team.spent'), hint: t('employee.stats.spent') },
    { key: 'score', label: t('employee.stats.score'), hint: t('myDay.team.scoreHint') },
    { key: 'unscored', label: t('myDay.team.unscored'), hint: t('myDay.team.unscoredHint') },
    { key: 'finished', label: t('myDay.team.finished'), hint: t('myDay.team.finishedHint') },
    { key: 'expired', label: t('myDay.team.expired'), hint: t('myDay.team.expiredHint') },
    { key: 'open', label: t('myDay.team.open') },
    { key: 'actions', label: '' },
  ];

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('myDay.team.title')}</Typography>
      <RangePicker range={range} onChange={setRange} />
      {summary.isSuccess && members.length === 0 && (
        <Typography sx={{ color: 'text.secondary' }}>{t('team.noReports')}</Typography>
      )}
      {members.length > 0 && (
        <Box sx={{ overflowX: 'auto', opacity: summary.isPlaceholderData ? 0.6 : 1 }}>
          <Table size="small" sx={{ '& td, & th': { whiteSpace: 'nowrap', px: 0.75 }, '& th': { color: 'text.secondary', fontSize: 12 } }}>
            <TableHead>
              <TableRow>
                {head.map((h) => (
                  <TableCell key={h.key} align={h.key === 'person' ? 'left' : 'right'}>
                    {h.hint ? <Tooltip title={h.hint} describeChild><span>{h.label}</span></Tooltip> : h.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {direct.map((m) => <Row key={m.employeeId} member={m} onRestore={setRestoring} onChanged={refresh} />)}
              {indirect.length > 0 && (
                <TableRow>
                  <TableCell colSpan={head.length} sx={{ color: 'text.secondary', fontWeight: 600, pt: 2 }}>{t('team.indirect')}</TableCell>
                </TableRow>
              )}
              {indirect.map((m) => <Row key={m.employeeId} member={m} onRestore={setRestoring} onChanged={refresh} />)}
              <TableRow sx={{ '& td': { fontWeight: 600, borderBottom: 0 } }}>
                <TableCell>{t('myDay.team.total')}</TableCell>
                <TableCell align="right">{format.minutes(total.work)}</TableCell>
                <TableCell align="right">{format.minutes(total.spent)}</TableCell>
                <TableCell align="right">{total.weight > 0 ? `${Math.round(total.weighted / total.weight)}%` : '—'}</TableCell>
                <TableCell align="right">{total.unscored}</TableCell>
                <TableCell align="right">{total.finished}</TableCell>
                <TableCell align="right">{total.expired}</TableCell>
                <TableCell align="right">{total.open}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </Box>
      )}
      {restoring && <RestoreDialog employee={restoring} onClose={() => setRestoring(null)} onDone={refresh} />}
    </Paper>
  );
}

function Row(p: { member: Member; onRestore: (e: Employee) => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const dismiss = useMutation(trpc.Employee.dismiss.mutationOptions({ onSuccess: p.onChanged }));
  const { member: m } = p;
  const employee = employees.get(m.employeeId);
  if (!employee) return null;
  const manager = employee.managerId === null ? undefined : employees.get(employee.managerId);
  const away = employee.nextDay !== null && employee.nextDay > today();

  // Dismissal cannot be undone by the person dismissed and hurts them: confirm it.
  const confirmDismiss = () => {
    if (window.confirm(t('team.dismissConfirm', { name: employee.fullName }))) dismiss.mutate({ id: employee.id });
  };

  return (
    <TableRow hover>
      <TableCell>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <EmployeeAvatar employee={employee} size={28} />
          <Stack sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
              <Typography
                variant="body2"
                component={Link}
                to={`/employees/${employee.id}`}
                sx={{ color: 'text.primary', fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
              >
                {employee.fullName}
              </Typography>
              {employee.email === null && <Chip size="small" label={t('team.dismissed')} />}
              {away && (
                <Tooltip title={t('employee.awayUntil', { day: format.date(fromDay(employee.nextDay!)) })}>
                  <Chip size="small" color="warning" label={t('myDay.team.away', { day: format.date(fromDay(employee.nextDay!)) })} />
                </Tooltip>
              )}
            </Stack>
            {!m.direct && manager && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('team.via', { name: manager.fullName })}</Typography>
            )}
          </Stack>
        </Stack>
      </TableCell>
      <TableCell align="right">
        {format.minutes(m.stats.workMinutes)}
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('myDay.team.days', { count: m.stats.workDays })}</Typography>
      </TableCell>
      <TableCell align="right">{format.minutes(m.stats.spentMinutes)}</TableCell>
      <TableCell align="right">
        {m.stats.weightedScore === null ? '—' : `${Math.round(m.stats.weightedScore)}%`}
        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('myDay.team.days', { count: m.stats.scoredDays })}</Typography>
      </TableCell>
      <TableCell align="right">{m.direct ? m.unscoredDays : '—'}</TableCell>
      <TableCell align="right">{m.finished}</TableCell>
      <TableCell align="right" sx={{ color: m.expired > 0 ? 'warning.dark' : undefined, fontWeight: m.expired > 0 ? 600 : undefined }}>
        {m.expired}
      </TableCell>
      <TableCell align="right">{m.openTasks}</TableCell>
      <TableCell align="right">
        {m.direct && (employee.email === null ? (
          <Tooltip title={t('team.restore')}>
            <IconButton size="small" onClick={() => p.onRestore(employee)}><PersonAdd fontSize="small" /></IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={t('team.dismiss')}>
            <IconButton size="small" disabled={dismiss.isPending} onClick={confirmDismiss}><PersonRemove fontSize="small" /></IconButton>
          </Tooltip>
        ))}
      </TableCell>
    </TableRow>
  );
}
