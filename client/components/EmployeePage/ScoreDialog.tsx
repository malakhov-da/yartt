import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Slider, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
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
 * so a score is given with an explicit step, not undone. A standing score
 * can be withdrawn so the employee may correct the day's timesheet; its
 * reason stays and is here again when the day is scored anew.
 */
export default function (p: {
  employeeId: number;
  day: string;
  current: { value: number | null; reason: string | null } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const [value, setValue] = useState<number | null>(p.current?.value ?? null);
  const [reason, setReason] = useState(p.current?.reason ?? '');
  const standing = p.current?.value != null;
  const unchanged = standing && value === p.current!.value && reason.trim() === (p.current!.reason ?? '');
  const done = { onSuccess: () => { refresh(); p.onClose(); } };
  const score = useMutation(trpc.Team.score.mutationOptions(done));
  const unscore = useMutation(trpc.Team.unscore.mutationOptions(done));
  const needsReason = value !== null && value < REASON_BELOW && reason.trim() === '';

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t(standing ? 'employee.score.editTitle' : 'employee.score.title', { day: format.day(p.day) })}</DialogTitle>
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
          helperText={needsReason ? t('employee.score.reasonNeeded') : t(standing ? 'employee.score.mailEdit' : 'employee.score.mail')}
        />
      </DialogContent>
      <DialogActions>
        {standing && (
          <Tooltip title={t('employee.score.withdrawHint')} describeChild>
            <Button
              color="warning"
              disabled={unscore.isPending}
              onClick={() => unscore.mutate({ employeeId: p.employeeId, day: p.day })}
            >
              {t('employee.score.withdraw')}
            </Button>
          </Tooltip>
        )}
        <Box sx={{ flexGrow: 1 }} />
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
