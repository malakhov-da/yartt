import { AlternateEmail, ChatBubbleOutline, LockOpen } from '@mui/icons-material';
import { Box, Button, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TodoItem } from '#shared/myDay.ts';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees, usePronoun, useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import Composer from '../TaskPage/Composer.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';

/** What waits for my reaction, each item with its action right there. Empty is the goal. */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const todo = useQuery(trpc.MyDay.todo.queryOptions(undefined, { refetchInterval: POLL_MS }));

  return (
    <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>
        {t('myDay.todo.title')}
        {todo.data && todo.data.length > 0 && ` · ${todo.data.length}`}
      </Typography>
      {todo.data?.length === 0 && (
        <Typography sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>{t('myDay.empty')}</Typography>
      )}
      {todo.data?.map((item) => <Item key={key(item)} item={item} />)}
    </Paper>
  );
}

const key = (item: TodoItem) =>
  item.kind === 'mention' ? `m${item.task.id}-${item.commentId}`
  : item.kind === 'request' ? `r${item.task.id}-${item.employeeId}`
  : `v${item.task.id}`;

function Item(p: { item: TodoItem }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const pronoun = usePronoun();
  const [replying, setReplying] = useState(false);
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;

  const closeMention = useMutation(trpc.Comment.closeMention.mutationOptions({ onSuccess: refresh }));
  const markReviewed = useMutation(trpc.Task.markReviewed.mutationOptions({ onSuccess: refresh }));
  const approve = useMutation(trpc.Observer.approve.mutationOptions({ onSuccess: refresh }));
  const reject = useMutation(trpc.Observer.reject.mutationOptions({ onSuccess: refresh }));

  const { item } = p;
  let icon, text, actions;
  if (item.kind === 'mention') {
    icon = <AlternateEmail fontSize="small" />;
    text = (
      <>
        <Typography variant="body2">
          {t('myDay.todo.mention', { name: name(item.authorId), ...pronoun(item.authorId) })} · {format.relative(item.at)}
        </Typography>
        {item.excerpt && <Typography variant="body2" sx={{ color: 'text.secondary' }}>«{item.excerpt}»</Typography>}
      </>
    );
    actions = (
      <>
        <Button size="small" onClick={() => setReplying((v) => !v)}>{t('task.feed.reply')}</Button>
        <Button
          size="small"
          variant="contained"
          disabled={closeMention.isPending}
          onClick={() => closeMention.mutate({ taskId: item.task.id, commentId: item.commentId })}
        >
          {t('task.feed.done')}
        </Button>
      </>
    );
  } else if (item.kind === 'review') {
    icon = <ChatBubbleOutline fontSize="small" />;
    text = (
      <Typography variant="body2">
        {t('myDay.todo.review', { count: item.count, authors: item.authorIds.map(name).join(', ') })} · {format.relative(item.at)}
      </Typography>
    );
    actions = (
      <Tooltip title={item.pendingRequests > 0 ? t('task.review.requestsFirst') : ''}>
        <span>
          <Button
            size="small"
            variant="outlined"
            disabled={item.pendingRequests > 0 || markReviewed.isPending}
            onClick={() => markReviewed.mutate({ id: item.task.id })}
          >
            {t('task.review.button')}
          </Button>
        </span>
      </Tooltip>
    );
  } else {
    const input = { taskId: item.task.id, employeeId: item.employeeId };
    icon = <LockOpen fontSize="small" />;
    text = <Typography variant="body2">{t('myDay.todo.request', { name: name(item.employeeId) })}</Typography>;
    actions = (
      <>
        <Button size="small" color="inherit" disabled={reject.isPending} onClick={() => reject.mutate(input)}>
          {t('task.people.reject')}
        </Button>
        <Button size="small" variant="contained" disabled={approve.isPending} onClick={() => approve.mutate(input)}>
          {t('task.people.approve')}
        </Button>
      </>
    );
  }

  return (
    <Stack spacing={1}>
      <TaskLine task={item.task} />
      <Stack direction="row" sx={{ alignItems: 'flex-start', pl: 1.25, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ color: 'text.secondary', pt: 0.25 }}>{icon}</Box>
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>{text}</Box>
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, ml: 'auto' }}>{actions}</Stack>
      </Stack>
      {replying && item.kind === 'mention' && (
        <Composer
          taskId={item.task.id}
          replyTo={{ id: item.commentId, authorId: item.authorId }}
          onCancelReply={() => setReplying(false)}
          onSent={() => setReplying(false)}
        />
      )}
    </Stack>
  );
}
