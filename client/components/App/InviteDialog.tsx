import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTRPC } from '#client/hooks/trpc.ts';
import { fieldErrors } from '#client/i18n/errors.ts';

export default function (p: { open: boolean; onClose: () => void; onDone: (email: string) => void }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const invite = useMutation(
    trpc.Employee.invite.mutationOptions({
      onSuccess: (employee) => {
        // Offline the invite waits in the outbox: no employee yet, the typed address is it.
        p.onDone((employee as typeof employee | undefined)?.email ?? email);
        setFullName('');
        setEmail('');
        p.onClose();
      },
    }),
  );
  const errors = fieldErrors(invite.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate({ fullName, email: email.trim() });
  };

  return (
    <Dialog open={p.open} onClose={p.onClose} fullWidth maxWidth="xs">
      <form onSubmit={submit}>
        <DialogTitle>{t('invite.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label={t('invite.fullName')}
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              error={!!errors.fullName}
              helperText={errors.fullName}
            />
            <TextField
              label={t('invite.email')}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!errors.email}
              helperText={errors.email}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={p.onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="contained" disabled={invite.isPending}>
            {t('invite.submit')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
