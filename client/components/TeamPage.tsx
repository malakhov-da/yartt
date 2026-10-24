import { Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useTeamRole } from '#client/hooks/me.ts';
import Bots from './TeamPage/Bots.tsx';
import Team from './TeamPage/Team.tsx';

// My team (`/team`, docs/product/interface.md, 4 and 4b), over My day like a
// task: the team table for someone with people under them, and their bots.
// Reached from the top line; My day keeps only what needs me today (decision 79).
export default function () {
  const { t } = useTranslation();
  const { isManager, hasBots } = useTeamRole();
  return (
    <Stack spacing={2} sx={{ width: '100%', maxWidth: 1280, mx: 'auto', alignSelf: 'flex-start' }}>
      {isManager && <Team />}
      {hasBots && <Bots />}
      {!isManager && !hasBots && (
        <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 4 }}>{t('team.noReports')}</Typography>
      )}
    </Stack>
  );
}
