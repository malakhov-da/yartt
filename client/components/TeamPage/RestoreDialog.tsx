import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Employee } from '#shared/employee.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { fieldErrors } from '#client/i18n/errors.ts';

/** The direct manager brings a dismissed employee back under themselves, with the email they had or a new one. */
export default function (p: { employee: Employee; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [email, setEmail] = useState(p.employee.email ?? '');
  const restore = useMutation(
    trpc.Employee.restore.mutationOptions({
      onSuccess: () => {
        p.onDone();
        p.onClose();
      },
    }),
  );
  const errors = fieldErrors(restore.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    restore.mutate({ id: p.employee.id, email: email.trim() });
  };

  return (
    <Dialog open onClose={p.onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>{t('team.restoreTitle', { name: p.employee.fullName })}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('team.email')}
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!errors.email}
              helperText={errors.email}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('team.restoreHint')}</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={p.onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={restore.isPending}>
            {t('team.restore')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
