import { AlternateEmail, ChatBubbleOutline, EventBusy, LockOpen, NotificationsActive, TaskAlt } from '@mui/icons-material';
import { Box, Button, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
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
 * What waits for my reaction, each item with its action right there, the
 * items of one task under one line of it. Empty is the goal. The bell in the
 * top line brings it into view and flashes its title.
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
      <TodoList items={todo.data ?? []} />
    </Paper>
  );
}

/**
 * The items under their tasks. `readOnly` — someone else's, on their page
 * for a manager: what waits for them, without their buttons or the hints
 * meant for them.
 */
export function TodoList(p: { items: TodoItem[]; readOnly?: boolean }) {
  return groups(p.items).map((group) => (
    <Stack key={group.task.id} spacing={1}>
      <TaskLine task={group.task} />
      {group.items.map((item) => <Item key={key(item)} item={item} readOnly={p.readOnly} />)}
    </Stack>
  ));
}

/** Items of one task together, under one line of it: the tasks in the order their first item comes. */
function groups(items: TodoItem[]): { task: TodoItem['task']; items: TodoItem[] }[] {
  const byTask = new Map<number, { task: TodoItem['task']; items: TodoItem[] }>();
  for (const item of items) {
    const group = byTask.get(item.task.id);
    if (group) group.items.push(item);
    else byTask.set(item.task.id, { task: item.task, items: [item] });
  }
  return [...byTask.values()];
}

const key = (item: TodoItem) =>
  item.kind === 'mention' ? `m${item.task.id}-${item.commentId}`
  : item.kind === 'request' ? `r${item.task.id}-${item.employeeId}`
  : item.kind === 'remind' ? `t${item.task.id}-${item.at.getTime()}`
  : item.kind === 'done' ? `d${item.task.id}-${item.dependency.id}`
  : item.kind === 'closing' || item.kind === 'closed' ? `${item.kind}${item.task.id}`
  : `v${item.task.id}`;

function Item(p: { item: TodoItem; readOnly?: boolean }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const pronoun = usePronoun();
  const [replying, setReplying] = useState(false);
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;

  const closeMention = useMutation(trpc.Comment.closeMention.mutationOptions({ onSuccess: refresh }));
  const approve = useMutation(trpc.Observer.approve.mutationOptions({ onSuccess: refresh }));
  const reject = useMutation(trpc.Observer.reject.mutationOptions({ onSuccess: refresh }));
  const removeRemind = useMutation(trpc.Remind.remove.mutationOptions({ onSuccess: refresh }));
  const confirmClosed = useMutation(trpc.Task.confirmClosed.mutationOptions({ onSuccess: refresh }));
  const noted = useMutation(trpc.Dependency.noted.mutationOptions({ onSuccess: refresh }));
  const finish = useMutation(trpc.Task.setDeadline.mutationOptions({ onSuccess: refresh }));
  const openTask = (label: string) => (
    <Button size="small" component={Link} to={`/tasks/${item.task.id}`}>{label}</Button>
  );

  const { item } = p;
  let icon, text, actions;
  if (item.kind === 'mention') {
    icon = <AlternateEmail fontSize="small" />;
    text = (
      <>
        <Typography variant="body2">
          {t(p.readOnly ? 'myDay.todo.mentionOf' : 'myDay.todo.mention', { name: name(item.authorId), ...pronoun(item.authorId) })}
          {' · '}{format.relative(item.at)}
        </Typography>
        {item.excerpt && <Typography variant="body2" sx={{ color: 'text.secondary' }}>«{item.excerpt}»</Typography>}
        {item.replies.length > 0 && (
          <Stack spacing={0.5} sx={{ mt: 0.5 }}>
            {item.replies.map((r) => <MentionReply key={r.id} who={t(p.readOnly ? 'myDay.todo.reply' : 'myDay.todo.myReply')} reply={r} />)}
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
      <>
        <Typography variant="body2">
          {t('myDay.todo.review', { count: item.count, authors: item.authorIds.map(name).join(', ') })} · {format.relative(item.at)}
        </Typography>
        {!p.readOnly && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('myDay.todo.reviewHint')}</Typography>}
      </>
    );
    // "No intervention needed" lives in the task only: pressed here, it would skip comments nobody read.
    actions = (
      <Button size="small" variant="outlined" component={Link} to={`/tasks/${item.task.id}`}>{t('myDay.todo.read')}</Button>
    );
  } else if (item.kind === 'remind') {
    icon = <NotificationsActive fontSize="small" />;
    text = (
      <>
        <Typography variant="body2">{t('myDay.todo.remind', { time: format.dateTime(item.at) })}</Typography>
        {item.text && <Typography variant="body2" sx={{ color: 'text.secondary' }}>{item.text}</Typography>}
      </>
    );
    actions = (
      <>
        <PutOff taskId={item.task.id} at={item.at} deadline={item.task.deadline} />
        <Button size="small" variant="contained" disabled={removeRemind.isPending}
          onClick={() => removeRemind.mutate({ taskId: item.task.id, at: item.at })}>
          {t('task.remind.done')}
        </Button>
      </>
    );
  } else if (item.kind === 'closing') {
    icon = <EventBusy fontSize="small" color="warning" />;
    text = (
      <>
        <Typography variant="body2">{t('myDay.todo.closing', { time: format.relative(item.at), at: format.dateTime(item.at) })}</Typography>
        {!p.readOnly && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('myDay.todo.closingHint')}</Typography>}
      </>
    );
    // Done already: closed now, not left to the deadline.
    actions = (
      <>
        {openTask(t('myDay.todo.moveDeadline'))}
        <Button size="small" variant="contained" disabled={finish.isPending} onClick={() => finish.mutate({ id: item.task.id, deadline: new Date() })}>
          {t('task.finish')}
        </Button>
      </>
    );
  } else if (item.kind === 'closed') {
    icon = <EventBusy fontSize="small" />;
    text = (
      <>
        <Typography variant="body2">{t('myDay.todo.closed', { at: format.dateTime(item.at) })}</Typography>
        {!p.readOnly && <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('myDay.todo.closedHint')}</Typography>}
      </>
    );
    actions = (
      <>
        {openTask(t('myDay.todo.reopen'))}
        <Button size="small" variant="contained" disabled={confirmClosed.isPending} onClick={() => confirmClosed.mutate({ id: item.task.id })}>
          {t('myDay.todo.confirm')}
        </Button>
      </>
    );
  } else if (item.kind === 'done') {
    icon = <TaskAlt fontSize="small" color="success" />;
    text = (
      <>
        <Typography variant="body2">{t('myDay.todo.done')} · {format.relative(item.at)}</Typography>
        <TaskLine task={item.dependency} dense />
      </>
    );
    actions = (
      <Button size="small" variant="outlined" disabled={noted.isPending}
        onClick={() => noted.mutate({ taskId: item.task.id, value: item.dependency.id })}>
        {t('myDay.todo.noted')}
      </Button>
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
      <Stack direction="row" sx={{ alignItems: 'flex-start', pl: 1.25, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ color: 'text.secondary', pt: 0.25 }}>{icon}</Box>
        <Box sx={{ flex: '1 1 220px', minWidth: 0 }}>{text}</Box>
        {!p.readOnly && <Stack direction="row" spacing={1} sx={{ flexShrink: 0, ml: 'auto' }}>{actions}</Stack>}
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
