import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TaskHeader } from '#shared/task.ts';
import { parseMinutes, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TaskLine from '../TaskPage/TaskLine.tsx';

const PRESETS = [15, 30, 60, 120];

/** Time logged to a task I opened that day, right from My day: the usual amounts are one click. */
export default function (p: { task: TaskHeader; day: string; onClose: () => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const log = useMutation(trpc.Time.log.mutationOptions({ onSuccess: () => { refresh(); p.onClose(); } }));
  const [text, setText] = useState('');
  const minutes = parseMinutes(text);
  const save = () => minutes !== null && log.mutate({ taskId: p.task.id, day: p.day, minutes });

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('task.myTime.log')} · {format.day(p.day)}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TaskLine dense task={p.task} />
        <Stack direction="row" spacing={1}>
          {PRESETS.map((value) => (
            <Chip key={value} label={format.minutes(value)} onClick={() => setText(format.minutes(value))} variant="outlined" />
          ))}
        </Stack>
        <TextField
          autoFocus
          label={t('task.myTime.minutes')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          error={text !== '' && minutes === null}
          helperText={minutes !== null ? format.minutes(minutes) : t('task.myTime.timeHint')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" disabled={minutes === null || log.isPending} onClick={save}>{t('common.save')}</Button>
      </DialogActions>
    </Dialog>
  );
}
