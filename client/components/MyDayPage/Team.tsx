import { ChevronRight, Close, ExpandMore, GroupAdd, PersonAdd, PersonRemove } from '@mui/icons-material';
import {
  Box, Checkbox, Chip, FormControlLabel, IconButton, Paper, Stack, Switch, Table, TableBody, TableCell, TableHead,
  TableRow, Tooltip, Typography,
} from '@mui/material';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Employee } from '#shared/employee.ts';
import type { Member } from '#shared/team.ts';
import { fromDay, today, useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from '../App/EmployeeAvatar.tsx';
import Sparkline from '../App/Sparkline.tsx';
import RangePicker, { useRange } from '../App/RangePicker.tsx';
import RestoreDialog from './RestoreDialog.tsx';

/** How far a report sits from their manager, px. */
const INDENT = 20;

/** What a row shows: one person's numbers, or a group's (hours left out — decision 38). */
type Cells = {
  work: { minutes: number; days: number } | null;
  /** Time in tasks, % of the person's own timesheet; for a group — the average of people. */
  share: number | null;
  score: { value: number; days: number | null } | null;
  /** Days waiting for my score: only my direct reports have them. */
  unscored: number | null;
  finished: number;
  expired: number;
  open: number;
  /** Median minutes from a shift's end to its record; a group — the average of people. */
  recordDelay: number | null;
  /** Median minutes to answer a mention, and mentions left without an answer. */
  reply: number | null;
  unanswered: number;
  /** As a manager: median minutes a report's day waits for their score. */
  scoreWait: number | null;
  /** A person's planned work now and its change over the range; a group has none (hours are not combined). */
  backlog: { minutes: number; growth: number } | null;
  /** A person's days, for the sparklines; a group has none. */
  days: Member['days'] | null;
};

/** Time logged to tasks as a share of the person's own timesheet; NULL — no timesheet. */
const share = (m: Member) => (m.stats.workMinutes > 0 ? (m.stats.spentMinutes / m.stats.workMinutes) * 100 : null);
const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)}%`);

const personCells = (m: Member): Cells => ({
  work: { minutes: m.stats.workMinutes, days: m.stats.workDays },
  share: share(m),
  score: m.stats.weightedScore === null ? null : { value: m.stats.weightedScore, days: m.stats.scoredDays },
  unscored: m.direct ? m.unscoredDays : null,
  finished: m.finished,
  expired: m.expired,
  open: m.openTasks,
  recordDelay: m.recordDelayMinutes,
  reply: m.replyMinutes,
  unanswered: m.unanswered,
  scoreWait: m.scoreWaitMinutes,
  backlog: { minutes: m.backlogMinutes, growth: m.backlogGrowthMinutes },
  days: m.days,
});

/** A group: counts add up, shares and scores are averaged over people, hours are not combined. */
function groupCells(members: Member[]): Cells {
  const direct = members.filter((m) => m.direct);
  const score = average(members.flatMap((m) => (m.stats.weightedScore === null ? [] : [m.stats.weightedScore])));
  return {
    work: null,
    share: average(members.flatMap((m) => { const v = share(m); return v === null ? [] : [v]; })),
    score: score === null ? null : { value: score, days: null },
    unscored: direct.length ? direct.reduce((n, m) => n + m.unscoredDays, 0) : null,
    finished: members.reduce((n, m) => n + m.finished, 0),
    expired: members.reduce((n, m) => n + m.expired, 0),
    open: members.reduce((n, m) => n + m.openTasks, 0),
    recordDelay: average(members.flatMap((m) => (m.recordDelayMinutes === null ? [] : [m.recordDelayMinutes]))),
    reply: average(members.flatMap((m) => (m.replyMinutes === null ? [] : [m.replyMinutes]))),
    unanswered: members.reduce((n, m) => n + m.unanswered, 0),
    scoreWait: average(members.flatMap((m) => (m.scoreWaitMinutes === null ? [] : [m.scoreWaitMinutes]))),
    backlog: null,
    days: null,
  };
}

/**
 * My team — only for someone with reports (docs/product/interface.md, 4):
 * the tree of my subtree for a range, me at the root, each manager's
 * reports nested under them. A manager's row is their own numbers; under
 * their reports, the line of their team — without them, or with them when
 * "with managers" is on. Ticks pick people for a line of their own; one
 * click picks a manager's whole team. Hours of different people are never
 * added up (decision 38).
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const employees = useEmployees();
  const [range, setRange, valid] = useRange();
  const summary = useQuery(trpc.Team.summary.queryOptions(range, {
    refetchInterval: POLL_MS, placeholderData: keepPreviousData, enabled: valid,
  }));
  const [restoring, setRestoring] = useState<Employee | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [withManagers, setWithManagers] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.Employee.list.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.Team.pathKey() });
  };

  const members = summary.data ?? [];
  const byId = new Map(members.map((m) => [m.employeeId, m]));
  const root = members.find((m) => m.self);
  // The tree comes from the managers: everyone hangs under their manager, who is in the summary too.
  const children = new Map<number, Member[]>();
  for (const m of members) {
    const managerId = employees.get(m.employeeId)?.managerId;
    if (m.self || managerId == null || !byId.has(managerId)) continue;
    children.set(managerId, [...(children.get(managerId) ?? []), m]);
  }
  const descendants = (id: number): Member[] =>
    (children.get(id) ?? []).flatMap((c) => [c, ...descendants(c.employeeId)]);
  const team = (m: Member) => [...(withManagers ? [m] : []), ...descendants(m.employeeId)];

  const toggle = (ids: number[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    return next;
  });
  const picked = members.filter((m) => selected.has(m.employeeId));

  const head = [
    { key: 'person', label: t('myDay.team.person') },
    { key: 'work', label: t('employee.stats.work'), hint: t('myDay.team.workHint') },
    { key: 'spent', label: t('myDay.team.spent'), hint: t('myDay.team.spentHint') },
    { key: 'score', label: t('employee.stats.score'), hint: t('myDay.team.scoreHint') },
    { key: 'unscored', label: t('myDay.team.unscored'), hint: t('myDay.team.unscoredHint') },
    { key: 'finished', label: t('myDay.team.finished'), hint: t('myDay.team.finishedHint') },
    { key: 'expired', label: t('myDay.team.expired'), hint: t('myDay.team.expiredHint') },
    { key: 'open', label: t('myDay.team.open') },
    { key: 'record', label: t('myDay.team.record'), hint: t('myDay.team.recordHint') },
    { key: 'reply', label: t('myDay.team.reply'), hint: t('myDay.team.replyHint') },
    { key: 'scoreWait', label: t('myDay.team.scoreWait'), hint: t('myDay.team.scoreWaitHint') },
    { key: 'backlog', label: t('myDay.team.backlog'), hint: t('myDay.team.backlogHint') },
    { key: 'actions', label: '' },
  ];

  const node = (m: Member, depth: number): ReactNode => {
    const kids = children.get(m.employeeId) ?? [];
    const open = kids.length > 0 && !collapsed.has(m.employeeId);
    const mates = descendants(m.employeeId);
    const allPicked = mates.length > 0 && mates.every((d) => selected.has(d.employeeId));
    return (
      <Fragment key={m.employeeId}>
        <PersonRow
          member={m}
          depth={depth}
          expandable={kids.length > 0}
          expanded={open}
          onExpand={() => setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(m.employeeId)) next.delete(m.employeeId);
            else next.add(m.employeeId);
            return next;
          })}
          checked={selected.has(m.employeeId)}
          onCheck={(on) => toggle([m.employeeId], on)}
          teamPicked={allPicked}
          onPickTeam={mates.length > 0 ? () => toggle(mates.map((d) => d.employeeId), !allPicked) : undefined}
          onRestore={setRestoring}
          onChanged={refresh}
        />
        {open && kids.map((k) => node(k, depth + 1))}
        {open && (
          <GroupRow
            depth={depth + 1}
            label={t(withManagers ? 'myDay.team.teamWith' : 'myDay.team.teamOf', {
              name: employees.get(m.employeeId)?.fullName ?? '', count: team(m).length,
            })}
            cells={groupCells(team(m))}
          />
        )}
      </Fragment>
    );
  };

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('myDay.team.title')}</Typography>
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ flexGrow: 1 }}><RangePicker range={range} onChange={setRange} /></Box>
        <Tooltip title={t('myDay.team.withManagersHint')} describeChild>
          <FormControlLabel
            control={<Switch size="small" checked={withManagers} onChange={(e) => setWithManagers(e.target.checked)} />}
            label={t('myDay.team.withManagers')}
          />
        </Tooltip>
      </Stack>
      {summary.isSuccess && members.length <= 1 && (
        <Typography sx={{ color: 'text.secondary' }}>{t('team.noReports')}</Typography>
      )}
      {root && members.length > 1 && (
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
              {node(root, 0)}
              {picked.length > 0 && (
                <GroupRow
                  depth={0}
                  label={t('myDay.team.picked', { count: picked.length })}
                  cells={groupCells(picked)}
                  action={(
                    <Tooltip title={t('myDay.team.clear')}>
                      <IconButton size="small" onClick={() => setSelected(new Set())}><Close fontSize="small" /></IconButton>
                    </Tooltip>
                  )}
                />
              )}
            </TableBody>
          </Table>
        </Box>
      )}
      {restoring && <RestoreDialog employee={restoring} onClose={() => setRestoring(null)} onDone={refresh} />}
    </Paper>
  );
}

function MetricCells(p: { cells: Cells }) {
  const { t } = useTranslation();
  const format = useFormat();
  const { cells: c } = p;
  // Coarse on purpose: "3 дн." reads faster than "72ч" in a column.
  const duration = (minutes: number | null) =>
    minutes === null ? '—' : minutes >= 2 * 1440 ? t('myDay.team.inDays', { count: Math.round(minutes / 1440) }) : format.minutes(Math.round(minutes));
  const dayNames = c.days?.map((d) => d.day) ?? [];
  const days = (count: number) => (
    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>{t('myDay.team.days', { count })}</Typography>
  );
  return (
    <>
      <TableCell align="right">{c.work ? <>{format.minutes(c.work.minutes)}{days(c.work.days)}</> : '—'}</TableCell>
      <TableCell align="right" sx={{ color: (c.share ?? 0) > 100 ? 'warning.dark' : undefined }}>
        {percent(c.share)}
        {c.days && (
          <Sparkline
            kind="line"
            max={100}
            days={dayNames}
            values={c.days.map((d) => (d.workMinutes > 0 ? (d.spentMinutes / d.workMinutes) * 100 : null))}
            label={(day, v) => `${format.date(fromDay(day))}: ${Math.round(v)}%`}
          />
        )}
      </TableCell>
      <TableCell align="right">
        {percent(c.score?.value ?? null)}
        {c.score?.days != null && days(c.score.days)}
        {c.days && (
          <Sparkline
            kind="dots"
            max={100}
            days={dayNames}
            values={c.days.map((d) => d.score)}
            label={(day, v) => `${format.date(fromDay(day))}: ${v}%`}
          />
        )}
      </TableCell>
      <TableCell align="right">{c.unscored ?? '—'}</TableCell>
      <TableCell align="right">{c.finished}</TableCell>
      <TableCell align="right" sx={{ color: c.expired > 0 ? 'warning.dark' : undefined, fontWeight: c.expired > 0 ? 600 : undefined }}>
        {c.expired}
      </TableCell>
      <TableCell align="right">{c.open}</TableCell>
      <TableCell align="right" sx={{ color: (c.recordDelay ?? 0) >= 1440 ? 'warning.dark' : undefined }}>{duration(c.recordDelay)}</TableCell>
      <TableCell align="right">
        {duration(c.reply)}
        {c.unanswered > 0 && (
          <Typography variant="caption" sx={{ color: 'warning.dark', display: 'block' }}>{t('myDay.team.unanswered', { count: c.unanswered })}</Typography>
        )}
      </TableCell>
      <TableCell align="right" sx={{ color: (c.scoreWait ?? 0) >= 3 * 1440 ? 'warning.dark' : undefined }}>{duration(c.scoreWait)}</TableCell>
      <TableCell align="right">
        {c.backlog ? (
          <>
            {format.minutes(c.backlog.minutes)}
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {c.backlog.growth === 0 ? '±0' : `${c.backlog.growth > 0 ? '+' : '−'}${format.minutes(Math.abs(c.backlog.growth))}`}
            </Typography>
            {c.days && (
              <Sparkline
                kind="line"
                max={60}
                days={dayNames}
                values={c.days.map((d) => d.backlogMinutes / 60)}
                label={(day, v) => `${format.date(fromDay(day))}: ${format.minutes(Math.round(v * 60))}`}
              />
            )}
          </>
        ) : '—'}
      </TableCell>
    </>
  );
}

/** The line of a group of people: a manager's team, or the ticked ones. */
function GroupRow(p: { depth: number; label: string; cells: Cells; action?: ReactNode }) {
  return (
    <TableRow sx={{ '& td': { fontWeight: 600, bgcolor: 'action.hover' } }}>
      <TableCell sx={{ pl: `${p.depth * INDENT + 30}px !important` }}>{p.label}</TableCell>
      <MetricCells cells={p.cells} />
      <TableCell align="right">{p.action}</TableCell>
    </TableRow>
  );
}

function PersonRow(p: {
  member: Member;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  onExpand: () => void;
  checked: boolean;
  onCheck: (on: boolean) => void;
  teamPicked: boolean;
  onPickTeam?: () => void;
  onRestore: (e: Employee) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const dismiss = useMutation(trpc.Employee.dismiss.mutationOptions({ onSuccess: p.onChanged }));
  const { member: m } = p;
  const employee = employees.get(m.employeeId);
  if (!employee) return null;
  const away = employee.nextDay !== null && employee.nextDay > today();

  // Dismissal cannot be undone by the person dismissed and hurts them: confirm it.
  const confirmDismiss = () => {
    if (window.confirm(t('team.dismissConfirm', { name: employee.fullName }))) dismiss.mutate({ id: employee.id });
  };

  return (
    <TableRow hover>
      <TableCell sx={{ pl: `${p.depth * INDENT}px !important` }}>
        <Stack direction="row" sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 26, flexShrink: 0 }}>
            {p.expandable && (
              <IconButton size="small" aria-label={t(p.expanded ? 'myDay.team.collapse' : 'myDay.team.expand')} onClick={p.onExpand}>
                {p.expanded ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />}
              </IconButton>
            )}
          </Box>
          <Checkbox
            size="small"
            sx={{ p: 0.5 }}
            checked={p.checked}
            onChange={(e) => p.onCheck(e.target.checked)}
            slotProps={{ input: { 'aria-label': t('myDay.team.pick', { name: employee.fullName }) } }}
          />
          <EmployeeAvatar employee={employee} size={24} />
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, ml: 0.75 }}>
            <Typography
              variant="body2"
              component={Link}
              to={`/employees/${employee.id}`}
              sx={{ color: 'text.primary', fontWeight: 500, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
            >
              {employee.fullName}
            </Typography>
            {m.self && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('myDay.team.me')}</Typography>}
            {employee.email === null && <Chip size="small" label={t('team.dismissed')} />}
            {away && (
              <Tooltip title={t('employee.awayUntil', { day: format.date(fromDay(employee.nextDay!)) })}>
                <Chip size="small" color="warning" label={t('myDay.team.away', { day: format.date(fromDay(employee.nextDay!)) })} />
              </Tooltip>
            )}
          </Stack>
        </Stack>
      </TableCell>
      <MetricCells cells={personCells(m)} />
      <TableCell align="right">
        {p.onPickTeam && (
          <Tooltip title={t(p.teamPicked ? 'myDay.team.unpickTeam' : 'myDay.team.pickTeam')}>
            <IconButton size="small" color={p.teamPicked ? 'primary' : 'default'} onClick={p.onPickTeam}>
              <GroupAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
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
