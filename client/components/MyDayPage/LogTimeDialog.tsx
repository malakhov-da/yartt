import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskHeader } from '#shared/task.ts';
import { parseMinutes, today, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TaskLine from '../TaskPage/TaskLine.tsx';

const PRESETS = [15, 30, 60, 120];

/**
 * My time on a task for a day — the day's whole time, one entry: what is
 * there is shown and replaced, the usual amounts are one click, 0 removes
 * it (decision 60). `current` — the time already set for a day; `pickDay`
 * — the day can be changed (on the task page), otherwise it is `day`.
 */
export default function (p: {
  taskId: number;
  task?: TaskHeader;
  day: string;
  pickDay?: boolean;
  current: (day: string) => number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const set = useMutation(trpc.Time.set.mutationOptions({ onSuccess: () => { refresh(); p.onClose(); } }));
  const [day, setDay] = useState(p.day);
  const shown = (d: string) => (p.current(d) ? format.minutes(p.current(d)) : '');
  const [text, setText] = useState(shown(p.day));
  const minutes = text.trim() === '' ? null : parseMinutes(text, true);
  const save = () => minutes !== null && set.mutate({ taskId: p.taskId, day, minutes });
  const had = p.current(day) > 0;

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('task.myTime.log')}{p.pickDay ? '' : ` · ${format.day(day)}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {p.task && <TaskLine dense task={p.task} />}
        {p.pickDay && (
          <TextField
            type="date"
            label={t('task.myTime.day')}
            value={day}
            onChange={(e) => { setDay(e.target.value); setText(shown(e.target.value)); }}
            slotProps={{ htmlInput: { max: today() } }}
          />
        )}
        <Stack direction="row" spacing={1}>
          {PRESETS.map((value) => (
            <Chip key={value} label={format.minutes(value)} onClick={() => setText(format.minutes(value))} variant="outlined" />
          ))}
        </Stack>
        <TextField
          autoFocus
          label={t('task.myTime.dayMinutes')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          error={text.trim() !== '' && minutes === null}
          helperText={minutes !== null && minutes > 0 ? format.minutes(minutes) : t('task.myTime.dayHint')}
        />
      </DialogContent>
      <DialogActions>
        {had && (
          <Button color="error" sx={{ mr: 'auto' }} disabled={set.isPending} onClick={() => set.mutate({ taskId: p.taskId, day, minutes: 0 })}>
            {t('task.myTime.remove')}
          </Button>
        )}
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" disabled={minutes === null || (minutes === 0 && !had) || set.isPending} onClick={save}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
