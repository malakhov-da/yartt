import { AttachFile } from '@mui/icons-material';
import { alpha, Box, Button, Chip, Stack, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Comment, CommentBase } from '#shared/comment.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useMe } from '#client/hooks/me.ts';
import { useEmployees, useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import { attachmentUrl } from '#client/hooks/upload.ts';
import EmployeeAvatar from '../App/EmployeeAvatar.tsx';
import RichView from '../App/RichView.tsx';
import TaskLine from './TaskLine.tsx';

/**
 * A comment of the feed with its thread under it: the replies, replies to
 * replies included, oldest first. A reply quotes what it answers only when
 * that is another reply — under the first comment it is plain.
 */
export default function CommentItem(p: {
  taskId: number;
  comment: Comment | CommentBase;
  onReply: (c: CommentBase) => void;
  /** The thread's first comment, for a reply shown under it. */
  rootId?: number;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const me = useMe();
  const format = useFormat();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const close = useMutation(trpc.Comment.closeMention.mutationOptions({ onSuccess: refresh }));
  const c = p.comment;
  const author = employees.get(c.authorId);
  const name = (id: number) => employees.get(id)?.fullName ?? `#${id}`;

  const nested = p.rootId !== undefined;
  const replies = 'replies' in c ? c.replies : [];

  return (
    <Box sx={{ borderTop: nested ? 0 : 1, borderColor: 'divider' }}>
    <Stack
      direction="row"
      spacing={1.5}
      id={`comment-${c.id}`}
      sx={{ px: 2, py: nested ? 1 : 1.75, bgcolor: (theme) => (c.isNew ? alpha(theme.palette.warning.main, 0.06) : 'transparent') }}
    >
      {author && <EmployeeAvatar employee={author} size={nested ? 28 : undefined} />}
      <Stack spacing={0.75} sx={{ flexGrow: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
          <Typography sx={{ fontWeight: 600 }}>{author?.fullName ?? `#${c.authorId}`}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{format.dateTime(c.at)}</Typography>
          {c.isNew && <Chip size="small" color="warning" label={t('task.feed.isNew')} />}
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" onClick={() => p.onReply(c)}>{t('task.feed.reply')}</Button>
        </Stack>
        {c.replyTo && c.replyTo.id !== p.rootId && (
          <Typography variant="body2" sx={{ px: 1.25, py: 0.5, borderRadius: 1, bgcolor: 'action.selected', color: 'text.secondary' }}>
            <b>{name(c.replyTo.authorId)}:</b> {c.replyTo.excerpt}
          </Typography>
        )}
        <RichView html={c.html} />
        {(c.mentions.length > 0 || c.files.length > 0) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            {c.mentions.map((m) => (
              <Stack key={m.employeeId} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <Chip
                  size="small"
                  color={m.closedAt ? 'default' : 'primary'}
                  variant={m.closedAt ? 'outlined' : 'filled'}
                  label={`@${name(m.employeeId)} · ${m.closedAt ? t('task.feed.closed') : t('task.feed.open')}`}
                />
                {m.employeeId === me.id && !m.closedAt && (
                  <Tooltip title={m.replies.length ? '' : t('task.feed.replyFirst')}>
                    <span>
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!m.replies.length || close.isPending}
                        onClick={() => close.mutate({ taskId: p.taskId, commentId: c.id })}
                      >
                        {t('task.feed.done')}
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Stack>
            ))}
            {c.files.map((f) => (
              <Chip
                key={f.id}
                size="small"
                variant="outlined"
                icon={<AttachFile />}
                label={f.name}
                component="a"
                href={attachmentUrl(f.id, f.name)}
                clickable
              />
            ))}
          </Box>
        )}
        {c.tasks.map((task) => <TaskLine key={task.id} task={task} />)}
      </Stack>
    </Stack>
    {replies.length > 0 && (
      <Box sx={{ ml: 6.5, mr: 2, mb: 1, borderLeft: 2, borderColor: 'divider' }}>
        {replies.map((r) => <CommentItem key={r.id} taskId={p.taskId} comment={r} onReply={p.onReply} rootId={c.id} />)}
      </Box>
    )}
    </Box>
  );
}
