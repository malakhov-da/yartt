import { PersonAddAlt1 } from '@mui/icons-material';
import { AppBar, Box, ButtonBase, IconButton, Menu, MenuItem, Toolbar, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '#client/hooks/me.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from './EmployeeAvatar.tsx';
import InviteDialog from './InviteDialog.tsx';
import Logo from './Logo.tsx';
import ProfileDialog from './ProfileDialog.tsx';
import Search from './Search.tsx';

// The top line: the logo (home — My day, which keeps its state while a task
// or a person is open), the search, invite and my avatar. No tabs (decision 31).
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const logout = useMutation(trpc.Auth.logout.mutationOptions({ onSuccess: () => queryClient.resetQueries() }));
  // Keeps the employee list warm for the profile and the team screen.
  useQuery(trpc.Employee.list.queryOptions());

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      {/* On a phone: the logo and my avatar, then the search on its own line. */}
      <Toolbar variant="dense" sx={{ gap: 1, flexWrap: { xs: 'wrap', md: 'nowrap' }, py: { xs: 0.5, md: 0 } }}>
        <Logo />
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ display: 'flex', order: { xs: 3, md: 0 }, flex: { xs: '1 1 100%', md: '0 1 420px' }, minWidth: { md: 200 } }}>
          <Search />
        </Box>
        <Tooltip title={t('nav.invite')}>
          <IconButton onClick={() => setInviteOpen(true)}>
            <PersonAddAlt1 />
          </IconButton>
        </Tooltip>
        <ButtonBase
          onClick={(e) => setMenu(e.currentTarget)}
          sx={{ display: 'flex', gap: 1, px: 1, py: 0.5, borderRadius: 1 }}
        >
          <EmployeeAvatar employee={me} />
          <Typography sx={{ display: { xs: 'none', md: 'block' } }}>{me.fullName}</Typography>
        </ButtonBase>
      </Toolbar>

      <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
        <MenuItem onClick={() => { setMenu(null); setProfileOpen(true); }}>{t('nav.profile')}</MenuItem>
        <MenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>{t('nav.logout')}</MenuItem>
      </Menu>
      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onDone={(email) => {
          void queryClient.invalidateQueries({ queryKey: trpc.Employee.list.queryKey() });
          showInfo(t('invite.sent', { email }));
        }}
      />
      {profileOpen && <ProfileDialog onClose={() => setProfileOpen(false)} />}
    </AppBar>
  );
}
