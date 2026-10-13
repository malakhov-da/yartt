import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTRPC } from '#client/hooks/trpc.ts';
import { fieldErrors } from '#client/i18n/errors.ts';

export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const [email, setEmail] = useState('');
  const requestLogin = useMutation(trpc.Auth.requestLogin.mutationOptions());
  const errors = fieldErrors(requestLogin.error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    requestLogin.mutate({ email: email.trim() });
  };

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 2 }}>
      <Paper sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Typography variant="h1" sx={{ mb: 3 }}>
          {t('login.title')}
        </Typography>
        {requestLogin.isSuccess ? (
          <Stack spacing={2}>
            <Alert severity="success" variant="standard">
              {t('login.sent')}
            </Alert>
            <Button onClick={() => requestLogin.reset()}>{t('login.again')}</Button>
          </Stack>
        ) : (
          <Stack component="form" spacing={2} onSubmit={submit}>
            <TextField
              label={t('login.email')}
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!errors.email}
              helperText={errors.email}
            />
            <Button type="submit" variant="contained" disabled={requestLogin.isPending}>
              {t('login.submit')}
            </Button>
          </Stack>
        )}
      </Paper>
    </Box>
  );
}
