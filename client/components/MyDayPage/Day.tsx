import { AlarmAdd, DeleteOutline, Edit, MoreTime } from '@mui/icons-material';
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DayHistory } from '#shared/myDay.ts';
import type { TaskHeader } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import ScoreDialog from '../EmployeePage/ScoreDialog.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';
import LogTimeDialog from './LogTimeDialog.tsx';
import ShiftDialog, { shiftEnd, type ShiftDialogMode } from './ShiftDialog.tsx';

type Dialog = { mode: ShiftDialogMode; from: Date; to: Date; about?: string | null };

/**
 * Where a new shift of a day is put in the dialog: the first free hour of
 * that day from 09:00 (then the small hours), every half hour, inside the
 * day and not past now — never into the next day or into another shift.
 */
function defaultShift(day: string, shifts: { startedAt: Date; spentMinutes: number | null }[]): { from: Date; to: Date } {
  const HOUR = 3_600_000;
  const busy = shifts.map((s) => [s.startedAt.getTime(), s.startedAt.getTime() + (s.spentMinutes ?? 24 * 60) * 60_000] as const);
  const dayEnd = Math.min(new Date(`${day}T00:00`).getTime() + 24 * HOUR, Date.now());
  const midnight = new Date(`${day}T00:00`).getTime();
  // From 09:00 to the day's end, then the small hours.
  const starts = Array.from({ length: 48 }, (_, i) => midnight + ((i + 18) % 48) * (HOUR / 2));
  for (const from of starts) {
    if (from + HOUR <= dayEnd && busy.every(([a, b]) => from + HOUR <= a || from >= b)) {
      return { from: new Date(from), to: new Date(from + HOUR) };
    }
  }
  // No free hour: the person corrects the times themselves.
  const start = new Date(`${day}T00:00`);
  return { from: start, to: new Date(start.getTime() + HOUR) };
}

/** Visits outside the shifts that span at least this long look like a forgotten shift. */
const GAP_SHIFT_MS = 30 * 60_000;

/**
 * A past day with shifts and activity outside them — before the first,
 * between two, after the last: the longest such stretch of visits (30
 * minutes or more) is offered as the shift that was not written down.
 * Never with an open shift: that day is not over.
 */
function gapShift(shifts: { startedAt: Date; spentMinutes: number | null }[], visits: Date[]): { from: Date; to: Date } | null {
  if (shifts.some((s) => s.spentMinutes === null)) return null;
  const spans = shifts.map((s) => [s.startedAt.getTime(), s.startedAt.getTime() + s.spentMinutes! * 60_000] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps = new Map<number, number[]>();
  for (const at of visits.map((v) => v.getTime())) {
    if (spans.some(([a, b]) => at >= a && at <= b)) continue;
    const gap = spans.filter(([, b]) => b < at).length; // how many shifts ended before it
    gaps.set(gap, [...(gaps.get(gap) ?? []), at]);
  }
  let best: { from: Date; to: Date } | null = null;
  for (const times of gaps.values()) {
    const from = Math.min(...times);
    const to = Math.max(...times);
    if (to - from >= GAP_SHIFT_MS && (!best || to - from > best.to.getTime() - best.from.getTime())) {
      best = { from: new Date(from), to: new Date(to) };
    }
  }
  return best;
}

/**
 * One day of History: the time logged to tasks, every task opened that day
 * among them (at 0 if nothing was logged), then its shifts with the visits
 * inside them and the visits outside any shift — each can become a shift
 * (today the open one). The open shift is closed in its own day; a past
 * day offers the shift its activity suggests, confirmed with one click.
 * Someone else's day
 * (`employeeId`) is read-only; their direct manager scores it (`canScore`).
 */
export default function (p: {
  day: DayHistory;
  isToday: boolean;
  tasks: Map<number, TaskHeader>;
  openShiftFrom: Date | null;
  employeeId?: number;
  canScore: boolean;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [scoring, setScoring] = useState(false);
  const [logging, setLogging] = useState<TaskHeader | null>(null);
  const start = useMutation(trpc.Work.start.mutationOptions({ onSuccess: refresh }));
  const add = useMutation(trpc.Work.add.mutationOptions({ onSuccess: refresh }));
  const removeShift = useMutation(trpc.Work.remove.mutationOptions({ onSuccess: refresh }));
  const removeEntry = useMutation(trpc.Time.remove.mutationOptions({ onSuccess: refresh }));

  const { day } = p;
  const mine = p.employeeId === undefined;
  // A withdrawn score (value NULL) keeps its reason but frees the day.
  const scored = day.score !== null && day.score.value !== null;
  // The database requires a past day with closed shifts and no open one.
  const scorable = p.canScore && !scored && !p.isToday
    && day.shifts.some((s) => s.spentMinutes !== null) && !day.shifts.some((s) => s.spentMinutes === null);
  const closedMinutes = day.shifts.reduce((sum, s) => sum + (s.spentMinutes ?? 0), 0);
  const loggedMinutes = day.entries.reduce((sum, e) => sum + e.minutes, 0);
  const openedTasks = [...new Set(day.visits.flatMap((v) => v.taskId === null ? [] : [v.taskId]))];
  const unlogged = openedTasks.filter((id) => !day.entries.some((e) => e.taskId === id));

  // The log of visits as if there were no shifts: those inside a shift are
  // shown under it, the rest stand alone and can become a shift. When none
  // is left outside, only the shifts are shown, the log a click away.
  const shifts = [...day.shifts].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const endOf = (s: { startedAt: Date; spentMinutes: number | null }) =>
    s.spentMinutes === null ? Infinity : s.startedAt.getTime() + s.spentMinutes * 60_000;
  const covers = (s: (typeof shifts)[number], at: Date) => at.getTime() >= s.startedAt.getTime() && at.getTime() <= endOf(s);
  const outside = day.visits.filter((v) => !shifts.some((s) => covers(s, v.at)));
  const [expanded, setExpanded] = useState(false);
  const showLog = outside.length > 0 || expanded;
  const timeline = [
    ...shifts.map((shift) => ({ at: shift.startedAt, shift, visit: null })),
    ...outside.map((visit) => ({ at: visit.at, shift: null, visit })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  // A shift from a visit outside the shifts. An open one lasts until
  // infinity, so only today, with no shift open and none after the visit, is
  // it started; otherwise a closed one is added, up to the last visit before
  // the next shift.
  const nextShift = (at: Date) => Math.min(...shifts.map((s) => s.startedAt.getTime()).filter((a) => a > at.getTime()));
  const opensShift = (at: Date) => p.isToday && !p.openShiftFrom && nextShift(at) === Infinity;
  // The open shift, wherever it is, lasts until infinity: nothing after its start.
  const canShift = (at: Date) => mine && !scored && (!p.openShiftFrom || at < p.openShiftFrom);
  const shiftFrom = (at: Date) => {
    if (opensShift(at)) return start.mutate({ startedAt: at });
    const until = Math.min(nextShift(at), p.openShiftFrom?.getTime() ?? Infinity, Date.now());
    const last = outside.filter((v) => v.at > at && v.at.getTime() < until).at(-1)?.at;
    setDialog({ mode: 'add', from: at, to: last ?? new Date(Math.min(at.getTime() + 30 * 60_000, until)) });
  };
  // A past day: what the first and last activity suggest.
  const suggestion = p.isToday ? null
    : day.shifts.length === 0
      ? (day.firstActivity && day.lastActivity && day.lastActivity.getTime() - day.firstActivity.getTime() >= 60_000
        ? { from: day.firstActivity, to: day.lastActivity } : null)
      : gapShift(day.shifts, day.visits.map((v) => v.at));
  const quiet = day.shifts.length === 0 && day.entries.length === 0 && day.visits.length === 0 && !(mine && suggestion);
  const task = (id: number) => p.tasks.get(id);

  const visitRow = (visit: (typeof day.visits)[number], canShift: boolean) => {
    const header = visit.taskId === null ? undefined : task(visit.taskId);
    return (
      <Stack key={visit.at.getTime()} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', width: 44, flexShrink: 0 }}>
          {format.time(visit.at)}
        </Typography>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {header ? <TaskLine dense task={header} /> : (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('nav.myDay')}</Typography>
          )}
        </Box>
        {canShift && (
          <Tooltip title={t(opensShift(visit.at) ? 'myDay.shift.startAt' : 'myDay.shift.addAt', { time: format.time(visit.at) })}>
            <IconButton size="small" disabled={start.isPending} onClick={() => shiftFrom(visit.at)} sx={{ flexShrink: 0 }}>
              <AlarmAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    );
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 600, flexGrow: 1, '&::first-letter': { textTransform: 'uppercase' } }}>
          {p.isToday ? t('myDay.history.today') : format.day(day.day)}
        </Typography>
        {scorable && p.employeeId !== undefined && (
          <Button size="small" variant="outlined" onClick={() => setScoring(true)}>{t('employee.score.action')}</Button>
        )}
        {day.score && scored && (
          <Tooltip title={[day.score.reason, p.canScore && t('employee.score.edit')].filter(Boolean).join(' · ')} describeChild>
            <Chip
              size="small"
              color="primary"
              variant="outlined"
              label={t('myDay.history.score', { value: day.score.value })}
              {...(p.canScore && p.employeeId !== undefined && { onClick: () => setScoring(true) })}
            />
          </Tooltip>
        )}
        {mine && !scored && (
          <Tooltip title={t('myDay.shift.addHint')} describeChild>
            <IconButton
              size="small"
              aria-label={t('myDay.shift.addTitle')}
              onClick={() => setDialog({ mode: 'add', ...(suggestion ?? defaultShift(day.day, day.shifts)) })}
            >
              <AlarmAdd fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      {day.score && !scored && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t(mine ? 'myDay.history.withdrawnMine' : 'myDay.history.withdrawn')}
        </Typography>
      )}

      {/* The day's totals side by side: logged to tasks, and worked in closed shifts. */}
      {(day.entries.length > 0 || unlogged.length > 0 || closedMinutes > 0) && (
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
          {(day.entries.length > 0 || unlogged.length > 0) && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('myDay.history.logged', { time: format.minutes(loggedMinutes) })}
            </Typography>
          )}
          {closedMinutes > 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('myDay.history.worked', { time: format.minutes(closedMinutes) })}
            </Typography>
          )}
        </Stack>
      )}
      {(day.entries.length > 0 || unlogged.length > 0) && (
        <Stack spacing={0.5}>
          {closedMinutes > 0 && loggedMinutes > closedMinutes && (
            <Alert severity="warning" sx={{ py: 0 }}>
              {t('myDay.history.overLogged', { logged: format.minutes(loggedMinutes), worked: format.minutes(closedMinutes) })}
            </Alert>
          )}
          {day.entries.map((entry) => {
            const header = task(entry.taskId);
            return header && (
              <Stack key={entry.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <TaskLine dense task={header} note={format.minutes(entry.minutes)} />
                </Box>
                {mine && !scored && (
                  <Tooltip title={t('task.myTime.log')}>
                    <IconButton size="small" onClick={() => setLogging(header)}>
                      <MoreTime fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {mine && !scored && (
                  <Tooltip title={t('myDay.history.removeEntry')}>
                    <IconButton size="small" disabled={removeEntry.isPending} onClick={() => removeEntry.mutate({ id: entry.id })}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
          {/* Opened that day and nothing logged yet: 0, a click from logging. */}
          {unlogged.map((id) => {
            const header = task(id);
            return header && (
              <Stack key={`opened-${id}`} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <TaskLine dense task={header} note={format.minutes(0)} />
                </Box>
                {mine && !scored && (
                  <Tooltip title={t('task.myTime.log')}>
                    <IconButton size="small" onClick={() => setLogging(header)}>
                      <MoreTime fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      {timeline.map(({ shift, visit }) => visit ? visitRow(visit, canShift(visit.at)) : (
        <Stack key={shift.startedAt.getTime()} spacing={0.5}>
          {shift.spentMinutes === null && mine ? (
            <Stack key={shift.startedAt.getTime()} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="body2" sx={{ flexGrow: 1, minWidth: 0 }}>
                {t('myDay.shift.open', { from: format.time(shift.startedAt), time: format.minutes(Math.max(0, Math.floor((Date.now() - shift.startedAt.getTime()) / 60_000))) })}
              </Typography>
              <Button
                size="small"
                variant="contained"
                sx={{ flexShrink: 0 }}
                onClick={() => setDialog({
                  mode: 'close',
                  from: shift.startedAt,
                  to: p.isToday || !day.lastActivity || day.lastActivity <= shift.startedAt ? shiftEnd() : day.lastActivity,
                })}
              >
                {t('myDay.shift.close')}
              </Button>
              <Tooltip title={t('myDay.shift.remove')}>
                <IconButton size="small" sx={{ flexShrink: 0 }} disabled={removeShift.isPending} onClick={() => removeShift.mutate({ startedAt: shift.startedAt })}>
                  <DeleteOutline fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : (
            <Stack key={shift.startedAt.getTime()} direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <Typography variant="body2">
                  {shift.spentMinutes === null
                    ? t('myDay.shift.openOther', { from: format.time(shift.startedAt) })
                    : t('myDay.shift.closed', {
                        from: format.time(shift.startedAt),
                        to: format.time(new Date(shift.startedAt.getTime() + shift.spentMinutes * 60_000)),
                        time: format.minutes(shift.spentMinutes),
                      })}
                </Typography>
                {shift.about && (
                  <Typography variant="body2" sx={{ color: 'text.secondary', whiteSpace: 'pre-wrap' }}>{shift.about}</Typography>
                )}
              </Box>
              {mine && !scored && shift.spentMinutes !== null && (
                <>
                  <Tooltip title={t('myDay.shift.edit')}>
                    <IconButton size="small" onClick={() => setDialog({
                      mode: 'edit',
                      from: shift.startedAt,
                      to: new Date(shift.startedAt.getTime() + shift.spentMinutes! * 60_000),
                      about: shift.about,
                    })}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('myDay.shift.delete')}>
                    <IconButton size="small" disabled={removeShift.isPending} onClick={() => removeShift.mutate({ startedAt: shift.startedAt })}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          )}
          {showLog && day.visits.some((v) => covers(shift, v.at)) && (
            <Stack spacing={0.5} sx={{ borderLeft: 2, borderColor: 'divider', pl: 1 }}>
              {day.visits.filter((v) => covers(shift, v.at)).map((v) => visitRow(v, false))}
            </Stack>
          )}
        </Stack>
      ))}
      {outside.length === 0 && day.visits.length > 0 && (
        <Box>
          <Button size="small" onClick={() => setExpanded(!expanded)}>
            {t(expanded ? 'myDay.history.less' : 'myDay.history.more')}
          </Button>
        </Box>
      )}

      {mine && suggestion && !scored && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1 }}>
            {t('myDay.shift.suggested', { from: format.time(suggestion.from), to: format.time(suggestion.to) })}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            disabled={add.isPending}
            onClick={() => add.mutate({ startedAt: suggestion.from, endedAt: suggestion.to, about: null })}
          >
            {t('myDay.shift.confirm')}
          </Button>
          <Tooltip title={t('myDay.shift.otherTime')}>
            <IconButton size="small" onClick={() => setDialog({ mode: 'add', ...suggestion })}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      {quiet && (!p.isToday || !mine) && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('myDay.history.quiet')}</Typography>
      )}

      {dialog && <ShiftDialog {...dialog} onClose={() => setDialog(null)} />}
      {logging && <LogTimeDialog task={logging} day={day.day} onClose={() => setLogging(null)} />}
      {scoring && p.employeeId !== undefined && (
        <ScoreDialog employeeId={p.employeeId} day={day.day} current={day.score} onClose={() => setScoring(false)} />
      )}
    </Stack>
  );
}
