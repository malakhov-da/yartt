import { Check, Edit, Lock, Public } from '@mui/icons-material';
import {
  Alert, Autocomplete, Box, Button, Chip, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, type Priority, type TaskDetails, type TaskPage } from '#shared/task.ts';
import { useFormat } from '#client/hooks/format.ts';
import { useMe } from '#client/hooks/me.ts';
import { useEmployees, useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import EmployeeAvatar from '../App/EmployeeAvatar.tsx';
import TagChip from '../App/TagChip.tsx';
import RichEditor, { type RichEditorHandle } from '../App/RichEditor.tsx';
import RichView from '../App/RichView.tsx';
import PriorityChip from './PriorityChip.tsx';
import Dependencies from './Dependencies.tsx';
import TransferDialog from './TransferDialog.tsx';

const label = { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/** <input type="datetime-local"> value in the browser's time zone. */
function localInput(date: Date): string {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Header, "needs the owner", context and dependencies — one sheet. The owner
 * edits in place; everyone else reads (decision 15).
 */
export default function (p: { task: TaskPage & { details: TaskDetails } }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const employees = useEmployees();
  const refresh = useTaskRefresh();
  const { task } = p;
  const d = task.details;
  const isOwner = task.access === 'owner';
  const owner = task.ownerId === null ? undefined : employees.get(task.ownerId);
  const closed = task.deadline !== null && task.deadline <= new Date();
  const me = useMe();
  // The owner and the owner's direct manager hand the task over; an ownerless one is taken.
  const canTransfer = task.ownerId !== null && (isOwner || owner?.managerId === me.id);
  const [transferring, setTransferring] = useState(false);

  const update = useMutation(trpc.Task.update.mutationOptions({ onSuccess: refresh }));
  const setDeadline = useMutation(trpc.Task.setDeadline.mutationOptions({ onSuccess: refresh }));
  const markReviewed = useMutation(trpc.Task.markReviewed.mutationOptions({ onSuccess: refresh }));
  const take = useMutation(trpc.Task.take.mutationOptions({ onSuccess: refresh }));

  const [editingTags, setEditingTags] = useState<string[] | null>(null);
  const [editingContext, setEditingContext] = useState(false);
  const editor = useRef<RichEditorHandle>(null);

  const saveContext = () => {
    const html = editor.current?.isEmpty() ? null : (editor.current?.getHtml() ?? null);
    update.mutate({ id: task.id, context: html }, { onSuccess: () => setEditingContext(false) });
  };

  const names = (ids: number[]) => ids.map((id) => employees.get(id)?.fullName ?? `#${id}`).join(', ');

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
        <Stack spacing={1.25} sx={{ flex: '1 1 420px', minWidth: 0 }}>
          {editingTags ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={editingTags}
                onChange={(_e, value) => setEditingTags(value.map((v) => v.trim()).filter(Boolean))}
                sx={{ flexGrow: 1 }}
                renderInput={(params) => <TextField {...params} autoFocus label={t('task.tags')} />}
              />
              <Button
                disabled={editingTags.length === 0 || update.isPending}
                onClick={() => update.mutate({ id: task.id, tags: editingTags }, { onSuccess: () => setEditingTags(null) })}
              >
                {t('common.save')}
              </Button>
              <Button color="inherit" onClick={() => setEditingTags(null)}>{t('common.cancel')}</Button>
            </Stack>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'monospace', fontSize: 18, color: 'text.secondary', pr: 0.5 }}>#{task.id}</Typography>
              {task.tags.map((tag) => <TagChip key={tag.id} tag={tag} sx={{ fontSize: 18, height: 34, borderRadius: 2 }} />)}
              {isOwner && (
                <Tooltip title={t('task.edit')}>
                  <IconButton size="small" onClick={() => setEditingTags(task.tags.map((tag) => tag.name))}>
                    <Edit fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          )}

          <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'center', gap: '8px 20px', color: 'text.secondary' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.primary' }}>
              {owner && <EmployeeAvatar employee={owner} size={24} />}
              <span>{owner?.fullName ?? t('task.ownerless')}</span>
              {canTransfer && (
                <Button size="small" color="inherit" onClick={() => setTransferring(true)}>{t('task.transfer.action')}</Button>
              )}
              {task.ownerId === null && (
                <Button size="small" variant="outlined" disabled={take.isPending} onClick={() => take.mutate({ id: task.id })}>
                  {t('task.transfer.take')}
                </Button>
              )}
            </Stack>
            {isOwner ? (
              <TextField
                select
                variant="standard"
                value={task.priority}
                onChange={(e) => update.mutate({ id: task.id, priority: e.target.value as Priority })}
                slotProps={{ input: { disableUnderline: true } }}
              >
                {PRIORITIES.map((priority) => <MenuItem key={priority} value={priority}><PriorityChip priority={priority} /></MenuItem>)}
              </TextField>
            ) : (
              <PriorityChip priority={task.priority} />
            )}
            {isOwner ? (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                <TextField
                  type="datetime-local"
                  variant="standard"
                  slotProps={{ htmlInput: { 'aria-label': t('task.deadline') } }}
                  value={task.deadline ? localInput(task.deadline) : ''}
                  onChange={(e) => e.target.value && setDeadline.mutate({ id: task.id, deadline: new Date(e.target.value) })}
                />
                {task.deadline && (
                  <Button size="small" color="inherit" onClick={() => setDeadline.mutate({ id: task.id, deadline: null })}>
                    {t('task.clearDeadline')}
                  </Button>
                )}
              </Stack>
            ) : (
              <span>{task.deadline ? format.dateTime(task.deadline) : t('task.noDeadline')}</span>
            )}
            {task.deadline && <span>{closed ? t('task.closed') : format.relative(task.deadline)}</span>}
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              {task.isPublic ? <Public fontSize="small" /> : <Lock fontSize="small" />}
              <span>{task.isPublic ? t('task.public') : t('task.private')}</span>
            </Stack>
          </Stack>
        </Stack>
        {isOwner && !closed && (
          <Button variant="contained" startIcon={<Check />} onClick={() => setDeadline.mutate({ id: task.id, deadline: new Date() })}>
            {t('task.finish')}
          </Button>
        )}
      </Stack>

      {isOwner && d.newComments.count > 0 && (
        <Alert
          severity="warning"
          variant="outlined"
          icon={false}
          action={
            <Tooltip title={d.pendingRequests > 0 ? t('task.review.requestsFirst') : ''}>
              <span>
                <Button
                  color="inherit"
                  variant="outlined"
                  disabled={d.pendingRequests > 0 || markReviewed.isPending}
                  onClick={() => markReviewed.mutate({ id: task.id })}
                >
                  {t('task.review.button')}
                </Button>
              </span>
            </Tooltip>
          }
        >
          <Typography sx={{ fontWeight: 500 }}>
            {d.reviewedAt
              ? t('task.review.title', { since: format.dateTime(d.reviewedAt), count: d.newComments.count, authors: names(d.newComments.authorIds) })
              : t('task.review.titleNever', { count: d.newComments.count, authors: names(d.newComments.authorIds) })}
          </Typography>
          <Typography variant="body2">
            {d.pendingRequests > 0 ? t('task.review.requestsFirst') : t('task.review.hint')}
          </Typography>
        </Alert>
      )}

      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={label}>{t('task.context')}</Typography>
          {isOwner && !editingContext && (
            <IconButton size="small" aria-label={t('task.edit')} onClick={() => setEditingContext(true)}>
              <Edit fontSize="small" />
            </IconButton>
          )}
        </Stack>
        {editingContext ? (
          <Stack spacing={1}>
            <RichEditor handle={editor} initial={d.context ?? ''} placeholder={t('task.contextPlaceholder')} onSubmit={saveContext} autoFocus />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" disabled={update.isPending} onClick={saveContext}>{t('common.save')}</Button>
              <Button color="inherit" onClick={() => setEditingContext(false)}>{t('common.cancel')}</Button>
            </Stack>
          </Stack>
        ) : d.context ? (
          <RichView html={d.context} />
        ) : (
          <Typography sx={{ color: 'text.secondary' }}>{t('task.contextEmpty')}</Typography>
        )}
      </Stack>

      <Dependencies task={task} />
      {transferring && task.ownerId !== null && (
        <TransferDialog taskId={task.id} ownerId={task.ownerId} onClose={() => setTransferring(false)} />
      )}
    </Paper>
  );
}
