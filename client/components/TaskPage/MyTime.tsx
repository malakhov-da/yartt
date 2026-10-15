import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseMinutes, today, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

/** My own time on the task, above the observer list (decision 17). */
export default function (p: { taskId: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const mine = useQuery(trpc.Time.mine.queryOptions({ taskId: p.taskId }));
  const log = useMutation(trpc.Time.log.mutationOptions({ onSuccess: () => { refresh(); setDialog(null); } }));
  const setLeft = useMutation(trpc.Time.setLeft.mutationOptions({ onSuccess: () => { refresh(); setDialog(null); } }));

  const [dialog, setDialog] = useState<'log' | 'plan' | null>(null);
  const [day, setDay] = useState(today());
  const [text, setText] = useState('');
  const minutes = parseMinutes(text);

  const openDialog = (kind: 'log' | 'plan') => {
    setText(kind === 'plan' && mine.data?.leftMinutes ? format.minutes(mine.data.leftMinutes) : '');
    setDay(today());
    setDialog(kind);
  };

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('task.myTime.title')}</Typography>
      {mine.data && (
        <Stack direction="row" spacing={2} sx={{ color: 'text.secondary', flexWrap: 'wrap' }}>
          <Typography variant="body2">{t('task.myTime.spent', { time: format.minutes(mine.data.spentMinutes) })}</Typography>
          <Typography variant="body2">
            {mine.data.leftMinutes === null ? t('task.myTime.noPlan') : t('task.myTime.plan', { time: format.minutes(mine.data.leftMinutes) })}
          </Typography>
        </Stack>
      )}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={() => openDialog('log')}>{t('task.myTime.log')}</Button>
        <Button color="inherit" variant="outlined" onClick={() => openDialog('plan')}>{t('task.myTime.setPlan')}</Button>
      </Stack>

      <Dialog open={dialog !== null} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog === 'log' ? t('task.myTime.log') : t('task.myTime.setPlan')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {dialog === 'log' && (
            <TextField type="date" label={t('task.myTime.day')} value={day} onChange={(e) => setDay(e.target.value)} slotProps={{ htmlInput: { max: today() } }} />
          )}
          <TextField
            autoFocus
            label={dialog === 'log' ? t('task.myTime.minutes') : t('task.myTime.planMinutes')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={text !== '' && minutes === null}
            helperText={minutes !== null ? format.minutes(minutes) : t('task.myTime.timeHint')}
          />
        </DialogContent>
        <DialogActions>
          {dialog === 'plan' && mine.data?.leftMinutes !== null && (
            <Button color="inherit" onClick={() => setLeft.mutate({ taskId: p.taskId, minutes: null })}>{t('task.myTime.clearPlan')}</Button>
          )}
          <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={minutes === null || log.isPending || setLeft.isPending}
            onClick={() => {
              if (minutes === null) return;
              if (dialog === 'log') log.mutate({ taskId: p.taskId, day, minutes });
              else setLeft.mutate({ taskId: p.taskId, minutes });
            }}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
