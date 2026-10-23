import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TaskPage } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import PriorityChip from './PriorityChip.tsx';
import { taskTitle } from './TaskLine.tsx';

/** A private task the employee does not see: the header and the request (decision 19). */
export default function (p: { task: TaskPage }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const request = useMutation(trpc.Observer.request.mutationOptions({ onSuccess: refresh }));
  const withdraw = useMutation(trpc.Observer.withdraw.mutationOptions({ onSuccess: refresh }));
  const requested = p.task.access === 'requested';

  return (
    <Paper sx={{ p: 3, width: '100%', maxWidth: 640, mx: 'auto', alignSelf: 'flex-start' }}>
      <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
          <Typography sx={{ fontSize: 18, fontWeight: 600, overflowWrap: 'anywhere' }}>
            <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 400, color: 'text.secondary', mr: 1 }}>#{p.task.id}</Box>
            {taskTitle(p.task.tags)}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <PriorityChip priority={p.task.priority} />
          <Typography variant="body2">{p.task.deadline ? format.dateTime(p.task.deadline) : t('task.noDeadline')}</Typography>
        </Stack>
        <Typography variant="h2">{requested ? t('task.noAccess.requestedTitle') : t('task.noAccess.title')}</Typography>
        <Typography sx={{ color: 'text.secondary' }}>
          {requested ? t('task.noAccess.requestedHint') : t('task.noAccess.hint')}
        </Typography>
        {requested ? (
          <Button variant="outlined" disabled={withdraw.isPending} onClick={() => withdraw.mutate({ taskId: p.task.id })}>
            {t('task.noAccess.withdraw')}
          </Button>
        ) : (
          <Button variant="contained" disabled={request.isPending} onClick={() => request.mutate({ taskId: p.task.id })}>
            {t('task.noAccess.request')}
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
