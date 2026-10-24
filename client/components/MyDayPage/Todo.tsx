import { AlternateEmail, ChatBubbleOutline, LockOpen, NotificationsActive } from '@mui/icons-material';
import { Box, Button, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TodoItem } from '#shared/myDay.ts';
import { useFormat } from '#client/hooks/format.ts';
import { POLL_MS, useEmployees, usePronoun, useTaskRefresh } from '#client/hooks/task.ts';
import { useStore } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import Composer from '../TaskPage/Composer.tsx';
import MentionReply from '../TaskPage/MentionReply.tsx';
import { PutOff } from '../TaskPage/Reminders.tsx';
import TaskLine from '../TaskPage/TaskLine.tsx';

/** The title lights up three times, so the eye finds the block after the scroll. */
const flash = keyframes`
  0%, 100% { background-color: transparent; }
  50% { background-color: rgba(245, 124, 0, 0.28); }
`;

/**
 * What waits for my reaction, each item with its action right there. Empty is
 * the goal. The bell in the top line brings it into view and flashes its title.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const todo = useQuery(trpc.MyDay.todo.queryOptions(undefined, { refetchInterval: POLL_MS }));
  const focus = useStore((s) => s.todoFocus);
  const block = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!focus) return;
    // After the route change has shown My day (it is hidden under a task or a person).
    const timer = setTimeout(() => {
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      block.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      title.current?.focus({ preventScroll: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [focus]);

  return (
    <Paper ref={block} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, scrollMarginTop: 16 }}>
      <Typography
        key={focus}
        ref={title}
        tabIndex={-1}
        variant="h3"
        sx={{
          fontWeight: 600, borderRadius: 1, mx: -0.5, px: 0.5, outline: 'none',
          ...(focus > 0 && { animation: `${flash} 0.6s ease-in-out 3`, '@media (prefers-reduced-motion: reduce)': { animation: 'none' } }),
        }}
      >
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
  : item.kind === 'remind' ? `t${item.task.id}-${item.at.getTime()}`
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
  const removeRemind = useMutation(trpc.Remind.remove.mutationOptions({ onSuccess: refresh }));

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
        {item.replies.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {item.replies.map((r) => <MentionReply key={r.id} who={t('myDay.todo.myReply')} reply={r} />)}
          </Stack>
        )}
      </>
    );
    actions = (
      <>
        <Button size="small" onClick={() => setReplying((v) => !v)}>{t('task.feed.reply')}</Button>
        <Tooltip title={item.replies.length ? '' : t('task.feed.replyFirst')}>
          <span>
            <Button
              size="small"
              variant="contained"
              disabled={!item.replies.length || closeMention.isPending}
              onClick={() => closeMention.mutate({ taskId: item.task.id, commentId: item.commentId })}
            >
              {t('task.feed.done')}
            </Button>
          </span>
        </Tooltip>
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
  } else if (item.kind === 'remind') {
    icon = <NotificationsActive fontSize="small" color="warning" />;
    text = (
      <>
        <Typography variant="body2">{t('myDay.todo.remind', { time: format.dateTime(item.at) })}</Typography>
        {item.text && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{item.text}</Typography>}
      </>
    );
    actions = (
      <>
        <PutOff taskId={item.task.id} at={item.at} deadline={item.task.deadline} />
        <Button size="small" variant="outlined" disabled={removeRemind.isPending}
          onClick={() => removeRemind.mutate({ taskId: item.task.id, at: item.at })}>
          {t('task.remind.done')}
        </Button>
      </>
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
