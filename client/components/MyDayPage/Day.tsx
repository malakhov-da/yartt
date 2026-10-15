import { DeleteOutline, Edit } from '@mui/icons-material';
import { Alert, Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DayHistory } from '#shared/myDay.ts';
import type { TaskHeader } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { usePronoun, useTaskRefresh } from '#client/hooks/task.ts';
import { useMe } from '#client/hooks/me.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import ScoreDialog from '../EmployeePage/ScoreDialog.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';
import ShiftDialog, { type ShiftDialogMode } from './ShiftDialog.tsx';

type Dialog = { mode: ShiftDialogMode; from: Date; to: Date };

/**
 * One day of History. My own day: today is where a shift is started; the
 * open shift is closed in its own day; a past day without shifts offers the
 * one its activity suggests, confirmed with one click. Someone else's day
 * (`employeeId`) is read-only; their direct manager scores it (`canScore`).
 */
export default function (p: {
  day: DayHistory;
  isToday: boolean;
  tasks: Map<number, TaskHeader>;
  hasOpenShift: boolean;
  employeeId?: number;
  canScore: boolean;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const me = useMe();
  const pronoun = usePronoun();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [scoring, setScoring] = useState(false);
  const start = useMutation(trpc.Work.start.mutationOptions({ onSuccess: refresh }));
  const add = useMutation(trpc.Work.add.mutationOptions({ onSuccess: refresh }));
  const removeShift = useMutation(trpc.Work.remove.mutationOptions({ onSuccess: refresh }));
  const removeEntry = useMutation(trpc.Time.remove.mutationOptions({ onSuccess: refresh }));

  const { day } = p;
  const mine = p.employeeId === undefined;
  const scored = day.score !== null;
  // The database requires a past day with closed shifts and no open one.
  const scorable = p.canScore && !scored && !p.isToday
    && day.shifts.some((s) => s.spentMinutes !== null) && !day.shifts.some((s) => s.spentMinutes === null);
  const closedMinutes = day.shifts.reduce((sum, s) => sum + (s.spentMinutes ?? 0), 0);
  const loggedMinutes = day.entries.reduce((sum, e) => sum + e.minutes, 0);
  const cameIn = day.visits.filter((v) => v.taskId === null).map((v) => v.at);
  const opened = new Map<number, Date[]>();
  for (const v of day.visits) if (v.taskId !== null) opened.set(v.taskId, [...(opened.get(v.taskId) ?? []), v.at]);

  // Today: the shift starts from the first activity, unless a shift was already worked.
  const startAt = day.shifts.length === 0 && day.firstActivity ? day.firstActivity : new Date();
  // A past day: what the first and last activity suggest.
  const suggestion = !p.isToday && day.shifts.length === 0 && day.firstActivity && day.lastActivity
    && day.lastActivity.getTime() - day.firstActivity.getTime() >= 60_000
    ? { from: day.firstActivity, to: day.lastActivity }
    : null;
  const quiet = day.shifts.length === 0 && day.entries.length === 0 && day.visits.length === 0 && !(mine && suggestion);
  const task = (id: number) => p.tasks.get(id);

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography sx={{ fontWeight: 600, flexGrow: 1, '&::first-letter': { textTransform: 'uppercase' } }}>
          {p.isToday ? t('myDay.history.today') : format.day(day.day)}
        </Typography>
        {scorable && p.employeeId !== undefined && (
          <Button size="small" variant="outlined" onClick={() => setScoring(true)}>{t('employee.score.action')}</Button>
        )}
        {day.score && (
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
      </Stack>

      {day.shifts.map((shift) => shift.spentMinutes === null && mine ? (
        <Stack key={shift.startedAt.getTime()} direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            {t('myDay.shift.open', { from: format.time(shift.startedAt), time: format.minutes(Math.max(0, Math.floor((Date.now() - shift.startedAt.getTime()) / 60_000))) })}
          </Typography>
          <Button
            size="small"
            variant="contained"
            onClick={() => setDialog({
              mode: 'close',
              from: shift.startedAt,
              to: p.isToday || !day.lastActivity || day.lastActivity <= shift.startedAt ? new Date() : day.lastActivity,
            })}
          >
            {t('myDay.shift.close')}
          </Button>
          <Tooltip title={t('myDay.shift.remove')}>
            <IconButton size="small" disabled={removeShift.isPending} onClick={() => removeShift.mutate()}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ) : (
        <Box key={shift.startedAt.getTime()}>
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
      ))}

      {mine && p.isToday && !p.hasOpenShift && !scored && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          <Button size="small" variant="outlined" disabled={start.isPending} onClick={() => start.mutate({ startedAt: startAt })}>
            {t('myDay.shift.startAt', { time: format.time(startAt) })}
          </Button>
          <Tooltip title={t('myDay.shift.otherTime')}>
            <IconButton size="small" onClick={() => setDialog({ mode: 'start', from: startAt, to: startAt })}>
              <Edit fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
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

      {day.entries.length > 0 && (
        <Stack spacing={0.5}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('myDay.history.logged', { time: format.minutes(loggedMinutes) })}
          </Typography>
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
                  <Tooltip title={t('myDay.history.removeEntry')}>
                    <IconButton size="small" disabled={removeEntry.isPending} onClick={() => removeEntry.mutate({ id: entry.id })}>
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      {cameIn.length > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('myDay.history.cameIn', { times: cameIn.map(format.time).join(', '), ...pronoun(p.employeeId ?? me.id) })}
        </Typography>
      )}
      {opened.size > 0 && (
        <Stack spacing={0.5}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('myDay.history.opened', pronoun(p.employeeId ?? me.id))}</Typography>
          {[...opened].map(([id, times]) => {
            const header = task(id);
            return header && <TaskLine dense key={id} task={header} note={times.map(format.time).join(', ')} />;
          })}
        </Stack>
      )}

      {quiet && (!p.isToday || !mine) && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('myDay.history.quiet')}</Typography>
      )}

      {dialog && <ShiftDialog {...dialog} onClose={() => setDialog(null)} />}
      {scoring && p.employeeId !== undefined && (
        <ScoreDialog employeeId={p.employeeId} day={day.day} current={day.score} onClose={() => setScoring(false)} />
      )}
    </Stack>
  );
}
