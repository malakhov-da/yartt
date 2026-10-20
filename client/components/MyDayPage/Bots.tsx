import { Add, SmartToy } from '@mui/icons-material';
import { Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bot } from '#shared/bot.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useMe } from '#client/hooks/me.ts';
import { POLL_MS, useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import BotDialog from './BotDialog.tsx';

/**
 * Bots under My team (decision 49): mine and those of everyone under me,
 * with what each may do; a click opens its settings, "New bot" creates
 * one under me. `bare` — without the card, in the profile.
 */
export default function (p: { bare?: boolean }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const format = useFormat();
  const employees = useEmployees();
  const bots = useQuery(trpc.Bot.list.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const [opened, setOpened] = useState<Bot | 'new' | null>(null);
  const list = bots.data ?? [];

  const content = (
    <Stack spacing={1.5}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
        {!p.bare && <Typography variant="h3" sx={{ fontWeight: 600, flexGrow: 1 }}>{t('bots.title')}</Typography>}
        {p.bare && <Typography variant="body2" sx={{ color: 'text.secondary', flexGrow: 1 }}>{t('bots.hint')}</Typography>}
        <Button size="small" startIcon={<Add />} onClick={() => setOpened('new')}>{t('bots.create')}</Button>
      </Stack>
      {!p.bare && list.length === 0 && bots.isSuccess && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('bots.hint')}</Typography>
      )}
      {list.length > 0 && (
        <Table size="small" sx={{ '& td, & th': { px: { xs: 0.25, sm: 0.75 } }, '& th': { color: 'text.secondary', fontSize: 12 } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('bots.bot')}</TableCell>
              <TableCell>{t('bots.permissions')}</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{t('bots.keyIssued')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {list.map((bot) => (
              <TableRow key={bot.id} hover onClick={() => setOpened(bot)} sx={{ cursor: 'pointer', opacity: bot.dismissedAt ? 0.6 : 1 }}>
                <TableCell>
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <SmartToy fontSize="small" sx={{ color: 'text.secondary' }} />
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{bot.fullName}</Typography>
                    {bot.managerId !== me.id && (
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {t('bots.of', { name: employees.get(bot.managerId)?.fullName ?? `#${bot.managerId}` })}
                      </Typography>
                    )}
                    {bot.dismissedAt && <Chip size="small" label={t('team.dismissed')} />}
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {bot.permissions.length
                      ? bot.permissions.map((perm) => t(`bots.permission.${perm}`)).join(', ')
                      : t('bots.readOnly')}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' }, whiteSpace: 'nowrap' }}>
                  <Typography variant="caption">{format.date(bot.keyIssuedAt)}</Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {opened && <BotDialog bot={opened === 'new' ? null : opened} onClose={() => setOpened(null)} />}
    </Stack>
  );

  return p.bare ? <Box>{content}</Box> : <Paper sx={{ p: 2 }}>{content}</Paper>;
}
