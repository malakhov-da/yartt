import { Autocomplete, Button, Divider, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale } from '#shared/employee.ts';
import { useMe } from '#client/hooks/me.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { fieldErrors } from '#client/i18n/errors.ts';

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();

  const [fullName, setFullName] = useState(me.fullName);
  const [about, setAbout] = useState(me.about ?? '');
  const [nextDay, setNextDay] = useState(me.nextDay ?? '');
  const [timeZone, setTimeZone] = useState(me.timeZone);
  const [locale, setLocale] = useState<Locale>(me.locale);

  const refresh = () => queryClient.invalidateQueries();
  const update = useMutation(
    trpc.Employee.updateProfile.mutationOptions({
      onSuccess: async () => {
        await refresh();
        showInfo(t('common.saved'));
      },
    }),
  );
  const setManager = useMutation(trpc.Employee.setManager.mutationOptions({ onSuccess: refresh }));
  const logoutEverywhere = useMutation(
    trpc.Auth.logoutEverywhere.mutationOptions({ onSuccess: () => queryClient.resetQueries() }),
  );
  const errors = fieldErrors(update.error);

  const employees = useQuery(trpc.Employee.list.queryOptions());
  const candidates = (employees.data ?? []).filter((e) => e.email !== null && e.id !== me.id);
  const manager = candidates.find((e) => e.id === me.managerId) ?? null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    update.mutate({ fullName, about: about.trim() || null, nextDay: nextDay || null, timeZone, locale });
  };

  return (
    <Paper sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 2, width: '100%', maxWidth: 600, mx: 'auto' }}>
      <Typography variant="h1">{t('profile.title')}</Typography>

      <Stack component="form" spacing={2} onSubmit={submit}>
        <TextField
          label={t('profile.fullName')}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={!!errors.fullName}
          helperText={errors.fullName}
        />
        <TextField
          label={t('profile.about')}
          multiline
          minRows={2}
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          error={!!errors.about}
          helperText={errors.about}
        />
        <TextField
          label={t('profile.nextDay')}
          type="date"
          value={nextDay}
          onChange={(e) => setNextDay(e.target.value)}
          error={!!errors.nextDay}
          helperText={errors.nextDay ?? t('profile.nextDayHint')}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Autocomplete
          options={TIME_ZONES}
          value={timeZone}
          disableClearable
          onChange={(_e, value) => setTimeZone(value)}
          renderInput={(params) => (
            <TextField {...params} label={t('profile.timeZone')} error={!!errors.timeZone} helperText={errors.timeZone} />
          )}
        />
        <TextField select label={t('profile.locale')} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => (
            <MenuItem key={l} value={l}>
              {t(`locales.${l}`)}
            </MenuItem>
          ))}
        </TextField>
        <Button type="submit" variant="contained" disabled={update.isPending} sx={{ alignSelf: 'flex-start' }}>
          {t('common.save')}
        </Button>
      </Stack>

      <Divider />

      <Autocomplete
        options={candidates}
        value={manager}
        getOptionLabel={(e) => e.fullName}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_e, value) => setManager.mutate({ managerId: value?.id ?? null })}
        renderInput={(params) => <TextField {...params} label={t('profile.manager')} placeholder={t('profile.noManager')} />}
      />

      <Divider />

      <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h3">{t('profile.sessions')}</Typography>
        <Button color="error" onClick={() => logoutEverywhere.mutate()} disabled={logoutEverywhere.isPending}>
          {t('profile.logoutEverywhere')}
        </Button>
      </Stack>
    </Paper>
  );
}
