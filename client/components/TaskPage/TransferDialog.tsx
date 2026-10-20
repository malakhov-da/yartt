import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Employee } from '#shared/employee.ts';
import { useEmployees, useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

/** The owner or the owner's manager hands the task over to an active employee. */
export default function (p: { taskId: number; ownerId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const [picked, setPicked] = useState<Employee | null>(null);
  const transfer = useMutation(trpc.Task.transfer.mutationOptions({ onSuccess: () => { refresh(); p.onClose(); } }));
  const options = [...employees.values()].filter((e) => e.dismissedAt === null && e.id !== p.ownerId);

  return (
    <Dialog open onClose={p.onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('task.transfer.title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <Autocomplete
          autoFocus
          options={options}
          value={picked}
          onChange={(_e, value) => setPicked(value)}
          getOptionLabel={(e) => e.fullName}
          renderInput={(params) => <TextField {...params} autoFocus label={t('task.transfer.to')} />}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('task.transfer.hint')}</Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={p.onClose}>{t('common.cancel')}</Button>
        <Button
          variant="contained"
          disabled={!picked || transfer.isPending}
          onClick={() => picked && transfer.mutate({ id: p.taskId, ownerId: picked.id })}
        >
          {t('task.transfer.submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
