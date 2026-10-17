import { PersonAddAlt1 } from '@mui/icons-material';
import { AppBar, Box, ButtonBase, IconButton, Menu, MenuItem, Toolbar, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutbox } from '#client/hooks/offline.ts';
import { useSignedOut } from '#client/hooks/session.ts';
import { useMe } from '#client/hooks/me.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import AwayButton from './AwayButton.tsx';
import EmployeeAvatar from './EmployeeAvatar.tsx';
import InviteDialog from './InviteDialog.tsx';
import Logo from './Logo.tsx';
import ProfileDialog from './ProfileDialog.tsx';
import TopStatus from './TopStatus.tsx';

// The top line: the logo (home — My day, which keeps its state while a task
// or a person is open), what waits for me and the open shift (TopStatus),
// "I'm away" (AwayButton), invite and my avatar. No tabs (decision 31); the search is in My day,
// over Current tasks.
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const signedOut = useSignedOut();
  const logout = useMutation(trpc.Auth.logout.mutationOptions({
    onSuccess: signedOut,
  }));
  const outbox = useOutbox();
  // Unsent changes would be lost: logging out asks first.
  const logOut = () => {
    if (outbox.length && !window.confirm(t('offline.logoutConfirm', { count: outbox.length }))) return;
    logout.mutate();
  };
  // Keeps the employee list warm for the profile and the team screen.
  useQuery(trpc.Employee.list.queryOptions());

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Logo />
        <Box sx={{ flexGrow: 1 }} />
        <TopStatus />
        <AwayButton />
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
        <MenuItem onClick={logOut} disabled={logout.isPending}>{t('nav.logout')}</MenuItem>
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
