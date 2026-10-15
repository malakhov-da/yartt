import { PersonAddAlt1 } from '@mui/icons-material';
import { AppBar, Box, ButtonBase, IconButton, Menu, MenuItem, Toolbar, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clearDrafts } from '#client/hooks/drafts.ts';
import { useMe } from '#client/hooks/me.ts';
import { showInfo } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from './EmployeeAvatar.tsx';
import InviteDialog from './InviteDialog.tsx';
import Logo from './Logo.tsx';
import ProfileDialog from './ProfileDialog.tsx';

// The top line: the logo (home — My day, which keeps its state while a task
// or a person is open), invite and my avatar. No tabs (decision 31); the
// search is in My day, over Current tasks.
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useMe();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const logout = useMutation(trpc.Auth.logout.mutationOptions({
    onSuccess: () => { clearDrafts(); void queryClient.resetQueries(); },
  }));
  // Keeps the employee list warm for the profile and the team screen.
  useQuery(trpc.Employee.list.queryOptions());

  return (
    <AppBar position="static" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar variant="dense" sx={{ gap: 1 }}>
        <Logo />
        <Box sx={{ flexGrow: 1 }} />
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
