import { Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

const QUICK = [100, 90, 80, 70, 60, 50, 30, 0];
/** Below this a reason is asked for: a bad score must say what went wrong. */
const REASON_BELOW = 60;

/**
 * The direct manager scores a day or corrects the score (`current`). Every
 * version is mailed to the employee with its time and the previous value,
 * so a score is given with an explicit step, not undone.
 */
export default function (p: {
  employeeId: number;
  day: string;
  current: { value: number; reason: string | null } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const [value, setValue] = useState<number | null>(p.current?.value ?? null);
  const [reason, setReason] = useState(p.current?.reason ?? '');
  const unchanged = p.current !== null && value === p.current.value && reason.trim() === (p.current.reason ?? '');
  const score = useMutation(trpc.Team.score.mutationOptions({ onSuccess: () => { refresh(); p.onClose(); } }));
  const needsReason = value !== null && value < REASON_BELOW && reason.trim() === '';

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t(p.current ? 'employee.score.editTitle' : 'employee.score.title', { day: format.day(p.day) })}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('employee.score.hint')}</Typography>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          {QUICK.map((v) => (
            <Chip key={v} label={`${v}%`} color={value === v ? 'primary' : 'default'} onClick={() => setValue(v)} />
          ))}
        </Stack>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', px: 1 }}>
          <Slider value={value ?? 0} min={0} max={100} step={5} onChange={(_, v) => setValue(v as number)} />
          <Typography sx={{ minWidth: 48, fontWeight: 600 }}>{value === null ? '—' : `${value}%`}</Typography>
        </Stack>
        <TextField
          multiline
          minRows={2}
          label={t('employee.score.reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={needsReason}
          helperText={needsReason ? t('employee.score.reasonNeeded') : t(p.current ? 'employee.score.mailEdit' : 'employee.score.mail')}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={value === null || needsReason || unchanged || score.isPending}
          onClick={() => value !== null && score.mutate({ employeeId: p.employeeId, day: p.day, value, reason: reason.trim() || null })}
        >
          {t('employee.score.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
