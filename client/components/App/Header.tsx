import { AppBar, Box, Button, Tab, Tabs, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { ParseKeys } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMe } from '#client/hooks/me.ts';
import { useTRPC } from '#client/hooks/trpc.ts';

export default function (p: { tabs: readonly { path: string; label: ParseKeys }[]; activePath: string }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const logout = useMutation(trpc.Auth.logout.mutationOptions({ onSuccess: () => queryClient.resetQueries() }));

  const active = p.tabs.find((tab) => tab.path === p.activePath);
  useEffect(() => {
    document.title = active ? `yartt: ${t(active.label)}` : 'yartt';
  }, [active, t]);

  return (
    <AppBar position="static" sx={{ px: 1.5, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Typography variant="h2">yartt</Typography>
      <Tabs value={p.activePath} TabIndicatorProps={{ sx: { bgcolor: 'common.white' } }} sx={{ flexGrow: 1 }}>
        {p.tabs.map(({ path, label }) => (
          <Tab key={path} value={path} label={t(label)} component={Link} to={path} />
        ))}
      </Tabs>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography sx={{ display: { xs: 'none', md: 'block' } }}>{me.fullName}</Typography>
        <Button color="inherit" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {t('nav.logout')}
        </Button>
      </Box>
    </AppBar>
  );
}
