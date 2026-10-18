import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fromLocalInput, toLocalInput, useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

/**
 * 'start' — open a shift; 'close' — close the open one (its start may be
 * corrected); 'add' — a closed shift at once, to any day not scored;
 * 'edit' — correct a closed shift (`from` finds it).
 */
export type ShiftDialogMode = 'start' | 'close' | 'add' | 'edit';

/**
 * The latest end a shift may have: now rounded up to the minute (the
 * timesheet is kept in minutes), so a shift just started closes as one minute.
 */
export function shiftEnd(): Date {
  return new Date(Math.floor(Date.now() / 60_000) * 60_000 + 60_000);
}

export default function (p: { mode: ShiftDialogMode; from: Date; to: Date; about?: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const done = { onSuccess: () => { refresh(); p.onClose(); } };
  const start = useMutation(trpc.Work.start.mutationOptions(done));
  const close = useMutation(trpc.Work.close.mutationOptions(done));
  const add = useMutation(trpc.Work.add.mutationOptions(done));
  const update = useMutation(trpc.Work.update.mutationOptions(done));

  const [from, setFrom] = useState(toLocalInput(p.from));
  const [to, setTo] = useState(toLocalInput(p.to));
  const [about, setAbout] = useState(p.about ?? '');
  const startedAt = fromLocalInput(from);
  const endedAt = fromLocalInput(to);
  const latestStart = toLocalInput(new Date());
  const latestEnd = toLocalInput(shiftEnd());
  const minutes = startedAt && endedAt ? Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000) : 0;
  const valid = startedAt !== null && (p.mode === 'start' || minutes > 0);
  const pending = start.isPending || close.isPending || add.isPending || update.isPending;

  const save = () => {
    if (!startedAt) return;
    if (p.mode === 'start') start.mutate({ startedAt });
    else if (!endedAt) return;
    else if (p.mode === 'edit') update.mutate({ startedAt: p.from, newStartedAt: startedAt, endedAt, about: about.trim() || null });
    else (p.mode === 'close' ? close : add).mutate({ startedAt, endedAt, about: about.trim() || null });
  };

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t(`myDay.shift.${p.mode}Title`)}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          type="datetime-local"
          label={t('myDay.shift.from')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          slotProps={{ htmlInput: { max: latestStart }, inputLabel: { shrink: true } }}
        />
        {p.mode !== 'start' && (
          <>
            <TextField
              type="datetime-local"
              label={t('myDay.shift.to')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              error={!valid}
              helperText={minutes > 0 ? format.minutes(minutes) : t('myDay.shift.endAfterStart')}
              slotProps={{ htmlInput: { max: latestEnd }, inputLabel: { shrink: true } }}
            />
            <TextField
              autoFocus
              multiline
              minRows={2}
              label={t('myDay.shift.about')}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('myDay.shift.untilScored')}</Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" disabled={!valid || pending} onClick={save}>{t(`myDay.shift.${p.mode === 'edit' ? 'add' : p.mode}`)}</Button>
      </DialogActions>
    </Dialog>
  );
}
