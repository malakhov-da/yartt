import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useTRPC } from '#client/hooks/trpc.ts';
import { errorMessage } from '#client/i18n/errors.ts';

// The link from the email sent to a new address (decision 51): following it
// makes the address the person's sign-in email. It signs nobody in — the
// page says what happened and leads on.
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { token = '' } = useParams();

  const confirm = useMutation(
    trpc.Auth.confirmEmail.mutationOptions({
      // The page itself explains a bad link; no snackbar on top.
      meta: { quiet: true },
      onSuccess: () => void queryClient.invalidateQueries(),
    }),
  );

  // The token is single-use and StrictMode runs effects twice: send it once.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    confirm.mutate({ token });
  }, [confirm, token]);

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', height: '100%', p: 2 }}>
      {confirm.isPending || confirm.isIdle ? (
        <Stack spacing={2} sx={{ alignItems: 'center' }}>
          <CircularProgress />
          <Typography>{t('login.checking')}</Typography>
        </Stack>
      ) : (
        <Stack spacing={2} sx={{ maxWidth: 400, alignItems: 'center', textAlign: 'center' }}>
          <Typography>{confirm.error ? errorMessage(confirm.error) : t('profile.emailChanged')}</Typography>
          <Button component={Link} to="/" variant="contained">{t('profile.emailChangedNext')}</Button>
        </Stack>
      )}
    </Box>
  );
}
