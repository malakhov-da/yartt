import { Close, NotificationsNone } from '@mui/icons-material';
import {
  Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fromLocalInput, toLocalInput, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

/** Today or a later day at 09:00 local time. */
function morning(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(9, 0, 0, 0);
  return d;
}

/** My reminders on the task: they come as notifications and are then gone. */
export default function (p: { taskId: number; deadline: Date | null }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const reminds = useQuery(trpc.Remind.list.queryOptions({ taskId: p.taskId }));
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState('');
  const [text, setText] = useState('');
  const add = useMutation(trpc.Remind.add.mutationOptions({ onSuccess: () => { void reminds.refetch(); refresh(); setOpen(false); } }));
  const remove = useMutation(trpc.Remind.remove.mutationOptions({ onSuccess: () => void reminds.refetch() }));

  const nextMonday = morning(((8 - new Date().getDay()) % 7) || 7);
  const dayBefore = p.deadline && p.deadline.getTime() - 86_400_000 > Date.now() + 60_000
    ? new Date(p.deadline.getTime() - 86_400_000) : null;
  const quick = [
    { label: t('task.remind.inHour'), at: new Date(Date.now() + 3_600_000) },
    { label: t('task.remind.tomorrow'), at: morning(1) },
    { label: t('task.remind.monday'), at: nextMonday },
    ...(dayBefore ? [{ label: t('task.remind.dayBefore'), at: dayBefore }] : []),
  ];
  const picked = fromLocalInput(at);

  const start = () => {
    setAt(toLocalInput(morning(1)));
    setText('');
    setOpen(true);
  };

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Stack direction="row" sx={{ alignItems: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('task.remind.title')}</Typography>
        <Button size="small" startIcon={<NotificationsNone />} onClick={start}>{t('task.remind.add')}</Button>
      </Stack>
      {reminds.data?.length === 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('task.remind.none')}</Typography>
      )}
      {reminds.data?.map((r) => (
        <Stack key={r.at.getTime()} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Stack sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="body2">{format.dateTime(r.at)} · {format.relative(r.at)}</Typography>
            {r.text && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{r.text}</Typography>}
          </Stack>
          <Tooltip title={t('task.remind.remove')}>
            <IconButton size="small" onClick={() => remove.mutate({ taskId: p.taskId, at: r.at })}><Close fontSize="small" /></IconButton>
          </Tooltip>
        </Stack>
      ))}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('task.remind.add')}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
            {quick.map((q) => (
              <Chip
                key={q.label}
                label={q.label}
                color={at === toLocalInput(q.at) ? 'primary' : 'default'}
                onClick={() => setAt(toLocalInput(q.at))}
              />
            ))}
          </Stack>
          <TextField
            type="datetime-local"
            label={t('task.remind.at')}
            value={at}
            onChange={(e) => setAt(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: toLocalInput(new Date()) } }}
          />
          <TextField
            autoFocus
            label={t('task.remind.text')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            helperText={t('task.remind.hint')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button
            variant="contained"
            disabled={!picked || add.isPending}
            onClick={() => picked && add.mutate({ taskId: p.taskId, at: picked, text: text.trim() || null })}
          >
            {t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
