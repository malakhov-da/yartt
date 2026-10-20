import { Button, Stack, TextField } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDraft } from '#client/hooks/drafts.ts';
import { useMe } from '#client/hooks/me.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { fieldErrors } from '#client/i18n/errors.ts';

/**
 * My sign-in email: a new one is sent a link and becomes mine only when it
 * is followed (decision 51), so a typo cannot lock me out.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useDraft('profile:email', '');
  const request = useMutation(trpc.Employee.requestEmailChange.mutationOptions({
    onSuccess: () => {
      showInfo(t('profile.emailSent', { email: email.trim() }));
      setEmail('');
      setEditing(false);
    },
  }));
  const errors = fieldErrors(request.error);

  if (!editing) {
    return (
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        <TextField
          label={t('profile.email')}
          value={me.email ?? ''}
          placeholder={t('profile.noEmail')}
          slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
          sx={{ flexGrow: 1 }}
        />
        <Button onClick={() => setEditing(true)}>{t('profile.changeEmail')}</Button>
      </Stack>
    );
  }
  return (
    <Stack spacing={1}>
      <Stack direction="row" sx={{ alignItems: 'flex-start', gap: 1 }}>
        <TextField
          label={t('profile.newEmail')}
          type="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!errors.email}
          helperText={errors.email ?? t('profile.newEmailHint')}
          sx={{ flexGrow: 1 }}
        />
        <Button
          variant="outlined"
          sx={{ mt: 1 }}
          disabled={!email.trim() || request.isPending}
          onClick={() => request.mutate({ email: email.trim() })}
        >
          {t('profile.sendLink')}
        </Button>
      </Stack>
      <Button size="small" sx={{ alignSelf: 'flex-start' }} onClick={() => { setEmail(''); setEditing(false); }}>
        {t('common.cancel')}
      </Button>
    </Stack>
  );
}
