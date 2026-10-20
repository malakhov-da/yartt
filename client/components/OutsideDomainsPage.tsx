import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMe } from '#client/hooks/me.ts';
import { useSignedOut } from '#client/hooks/session.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmailField from './App/EmailField.tsx';

// Someone whose email is outside the company's domains (decision 52) signs
// in, but sees nothing until they change it: the server refuses everything
// else, so this page is all there is — the address, why, and the way out.
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const signedOut = useSignedOut();
  const logout = useMutation(trpc.Auth.logout.mutationOptions({ onSuccess: signedOut }));

  return (
    <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100%', p: 2 }}>
      <Paper sx={{ p: 3, maxWidth: 480, width: '100%' }}>
        <Stack spacing={2}>
          <Typography variant="h2" sx={{ fontWeight: 600 }}>{t('outsideDomains.title', { name: me.fullName })}</Typography>
          <Typography>{t('outsideDomains.body', { domains: me.domains.join(', ') })}</Typography>
          <EmailField />
          <Button color="inherit" sx={{ alignSelf: 'flex-start' }} disabled={logout.isPending} onClick={() => logout.mutate()}>
            {t('outsideDomains.logout')}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
