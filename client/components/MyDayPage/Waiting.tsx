import { AlternateEmail, LockOutlined } from '@mui/icons-material';
import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { WaitingItem } from '#shared/myDay.ts';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees, useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import HelpTip from '../App/HelpTip.tsx';
import MentionReply from '../TaskPage/MentionReply.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';

/**
 * What I wait for from others (decision 67), the counterpart of "Waiting for
 * me": my access requests not answered yet, with "Withdraw", and my open
 * mentions of people — the longest waiting first, with their answers so
 * far. Shown only when there is something: quiet by default.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const waiting = useQuery(trpc.MyDay.waiting.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const items = waiting.data ?? [];
  if (items.length === 0) return null;
  return (
    <Paper component="section" aria-label={t('myDay.waiting.title')} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
        <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('myDay.waiting.title')} · {items.length}</Typography>
        <HelpTip title={t('myDay.waiting.hint')} />
      </Stack>
      {items.map((item) => (
        <Item key={item.kind === 'request' ? `r${item.task.id}` : `m${item.task.id}-${item.commentId}-${item.employeeId}`} item={item} />
      ))}
    </Paper>
  );
}

function Item(p: { item: WaitingItem }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const withdraw = useMutation(trpc.Observer.withdraw.mutationOptions({ onSuccess: refresh }));
  const name = (id: number | null) => (id === null ? '—' : employees.get(id)?.fullName ?? `#${id}`);
  const { item } = p;

  return (
    <Stack spacing={1}>
      <TaskLine task={item.task} />
      <Stack direction="row" sx={{ alignItems: 'flex-start', pl: 1.25, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ color: 'text.secondary', pt: 0.25 }}>
          {item.kind === 'request' ? <LockOutlined fontSize="small" /> : <AlternateEmail fontSize="small" />}
        </Box>
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>
          {item.kind === 'request' ? (
            <Typography variant="body2">{t('myDay.waiting.request', { name: name(item.task.ownerId) })}</Typography>
          ) : (
            <>
              <Typography variant="body2">
                {t('myDay.waiting.mention', { name: name(item.employeeId) })} · {format.relative(item.at)}
              </Typography>
              {item.excerpt && <Typography variant="body2" sx={{ color: 'text.secondary' }}>«{item.excerpt}»</Typography>}
              {item.replies.length > 0 && (
                <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                  {item.replies.map((r) => <MentionReply key={r.id} who={name(item.employeeId)} reply={r} />)}
                </Stack>
              )}
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {item.replies.length > 0 ? t('myDay.waiting.answered') : t('myDay.waiting.notAnswered')}
              </Typography>
            </>
          )}
        </Box>
        {item.kind === 'request' && (
          <Button size="small" color="inherit" sx={{ ml: 'auto' }} disabled={withdraw.isPending}
            onClick={() => withdraw.mutate({ taskId: item.task.id })}>
            {t('task.noAccess.withdraw')}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
