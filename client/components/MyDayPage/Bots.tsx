import { Add, SmartToy, WarningAmber } from '@mui/icons-material';
import {
  Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bot, BotStats } from '#shared/bot.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useMe } from '#client/hooks/me.ts';
import { POLL_MS, useEmployees } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import RangePicker, { useRange } from '../App/RangePicker.tsx';
import BotDialog from './BotDialog.tsx';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Bots under My team (decision 49): mine and those of everyone under me,
 * and what each did over a range — its tasks, comments and mentions, API
 * calls and refusals, webhook deliveries — the quiet ones first, so a bot
 * that stopped is seen. A click opens its settings, "New bot" creates one
 * under me. `bare` — without the card, in the profile.
 */
export default function (p: { bare?: boolean }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const format = useFormat();
  const employees = useEmployees();
  const [range, setRange, valid] = useRange();
  const bots = useQuery(trpc.Bot.list.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const stats = useQuery(trpc.Bot.stats.queryOptions(range, {
    refetchInterval: POLL_MS, placeholderData: keepPreviousData, enabled: valid,
  }));
  const [opened, setOpened] = useState<Bot | 'new' | null>(null);
  const byId = new Map((stats.data ?? []).map((s) => [s.id, s]));
  const last = (bot: Bot) => byId.get(bot.id)?.lastRequestAt?.getTime() ?? 0;
  // Working ones first, the quietest on top; the dismissed at the end.
  const list = [...(bots.data ?? [])].sort((a, b) =>
    Number(!!a.dismissedAt) - Number(!!b.dismissedAt) || last(a) - last(b) || a.fullName.localeCompare(b.fullName));
  const note = (text: ReactNode, warn = false) => (
    <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.3, color: warn ? 'warning.dark' : 'text.secondary' }}>{text}</Typography>
  );

  const cells = (bot: Bot, s: BotStats | undefined) => (
    <>
      <TableCell align="right">
        {s?.openTasks ?? '—'}
        {s && s.observedTasks > 0 && note(t('bots.observed', { count: s.observedTasks }))}
      </TableCell>
      <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        {s ? t('bots.activityLine', { comments: s.comments, mentions: s.mentions }) : '—'}
        {s && s.closedTasks > 0 && note(t('bots.closed', { count: s.closedTasks }))}
      </TableCell>
      <TableCell align="right">
        {s?.requests ?? '—'}
        {s && s.refused > 0 && note(t('bots.refused', { count: s.refused }), true)}
        {s && s.failedDeliveries > 0 && note(t('bots.failedDeliveries', { count: s.failedDeliveries, total: s.deliveries }), true)}
        {bot.webhookUrl && s && s.failedDeliveries === 0 && s.deliveries > 0 && note(t('bots.deliveries', { count: s.deliveries }))}
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {s?.lastRequestAt ? format.relative(s.lastRequestAt) : t('bots.never')}
      </TableCell>
    </>
  );

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
        <>
          <RangePicker range={range} onChange={setRange} />
          <Box sx={{ opacity: stats.isPlaceholderData ? 0.6 : 1 }}>
            <Table
              size="small"
              sx={{
                '& td, & th': { px: { xs: 0.25, sm: 0.75 } },
                '& th': { color: 'text.secondary', fontSize: 12, whiteSpace: 'nowrap' },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>{t('bots.bot')}</TableCell>
                  <TableCell align="right"><Tooltip title={t('bots.tasksHint')} describeChild><span>{t('bots.tasks')}</span></Tooltip></TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    <Tooltip title={t('bots.activityHint')} describeChild><span>{t('bots.activity')}</span></Tooltip>
                  </TableCell>
                  <TableCell align="right"><Tooltip title={t('bots.requestsHint')} describeChild><span>{t('bots.requests')}</span></Tooltip></TableCell>
                  <TableCell align="right">{t('bots.lastRequest')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {list.map((bot) => {
                  const oldKey = !bot.dismissedAt && Date.now() - bot.keyIssuedAt.getTime() >= YEAR_MS;
                  return (
                    <TableRow key={bot.id} hover onClick={() => setOpened(bot)} sx={{ cursor: 'pointer', opacity: bot.dismissedAt ? 0.6 : 1 }}>
                      <TableCell>
                        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <SmartToy fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>{bot.fullName}</Typography>
                          {bot.dismissedAt && <Chip size="small" label={t('team.dismissed')} />}
                          {oldKey && (
                            <Tooltip title={t('bots.oldKeyHint', { day: format.date(bot.keyIssuedAt) })}>
                              <WarningAmber fontSize="small" sx={{ color: 'warning.dark' }} aria-label={t('bots.oldKey')} />
                            </Tooltip>
                          )}
                        </Stack>
                        {bot.managerId !== me.id && note(t('bots.of', { name: employees.get(bot.managerId)?.fullName ?? `#${bot.managerId}` }))}
                        {note(bot.permissions.length
                          ? bot.permissions.map((perm) => t(`bots.permission.${perm}`)).join(', ')
                          : t('bots.readOnly'))}
                      </TableCell>
                      {cells(bot, byId.get(bot.id))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
      {opened && <BotDialog bot={opened === 'new' ? null : opened} onClose={() => setOpened(null)} />}
    </Stack>
  );

  return p.bare ? <Box>{content}</Box> : <Paper sx={{ p: 2 }}>{content}</Paper>;
}
