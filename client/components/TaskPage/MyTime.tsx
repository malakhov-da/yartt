import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseMinutes, today, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import LogTimeDialog from '../MyDayPage/LogTimeDialog.tsx';

/**
 * My own time on the task, above the observer list (decision 17): all I
 * logged, today's entry — the same one the timesheet shows, set and
 * replaced, never added up (decision 60) — and my plan of time left.
 */
export default function (p: { taskId: number }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const mine = useQuery(trpc.Time.mine.queryOptions({ taskId: p.taskId }));
  const setLeft = useMutation(trpc.Time.setLeft.mutationOptions({ onSuccess: () => { refresh(); setDialog(null); } }));

  const [dialog, setDialog] = useState<'log' | 'plan' | null>(null);
  const [text, setText] = useState('');
  const minutes = parseMinutes(text);
  const ofDay = (day: string) => mine.data?.days.find((d) => d.day === day)?.minutes ?? 0;
  const todayEntry = mine.data?.days.find((d) => d.day === today());

  const openPlan = () => {
    setText(mine.data?.leftMinutes ? format.minutes(mine.data.leftMinutes) : '');
    setDialog('plan');
  };

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('task.myTime.title')}</Typography>
      {mine.data && (
        <Stack direction="row" spacing={2} sx={{ color: 'text.secondary', flexWrap: 'wrap' }}>
          <Typography variant="body2">{t('task.myTime.spent', { time: format.minutes(mine.data.spentMinutes) })}</Typography>
          <Tooltip title={todayEntry ? t('myDay.history.entryChanged', { at: format.dateTime(todayEntry.updatedAt) }) : ''}>
            <Typography variant="body2">{t('task.myTime.today', { time: format.minutes(todayEntry?.minutes ?? 0) })}</Typography>
          </Tooltip>
          <Typography variant="body2">
            {mine.data.leftMinutes === null ? t('task.myTime.noPlan') : t('task.myTime.plan', { time: format.minutes(mine.data.leftMinutes) })}
          </Typography>
        </Stack>
      )}
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" onClick={() => setDialog('log')}>{t('task.myTime.log')}</Button>
        <Button color="inherit" variant="outlined" onClick={openPlan}>{t('task.myTime.setPlan')}</Button>
      </Stack>

      {dialog === 'log' && (
        <LogTimeDialog taskId={p.taskId} day={today()} pickDay current={ofDay} onClose={() => setDialog(null)} />
      )}
      <Dialog open={dialog === 'plan'} onClose={() => setDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('task.myTime.setPlan')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <TextField
            autoFocus
            label={t('task.myTime.planMinutes')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={text !== '' && minutes === null}
            helperText={minutes !== null ? format.minutes(minutes) : t('task.myTime.timeHint')}
          />
        </DialogContent>
        <DialogActions>
          {mine.data?.leftMinutes !== null && (
            <Button color="inherit" onClick={() => setLeft.mutate({ taskId: p.taskId, minutes: null })}>{t('task.myTime.clearPlan')}</Button>
          )}
          <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={minutes === null || setLeft.isPending}
            onClick={() => minutes !== null && setLeft.mutate({ taskId: p.taskId, minutes })}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
