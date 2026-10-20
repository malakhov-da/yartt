import { Close } from '@mui/icons-material';
import { Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import type { TagPart } from '#shared/tags.ts';
import { PRIORITIES, type Priority } from '#shared/task.ts';
import { useDraft } from '#client/hooks/drafts.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import RichEditor, { type RichEditorHandle } from './App/RichEditor.tsx';
import TagInput, { useTitle } from './App/TagInput.tsx';
import PriorityChip from './TaskPage/PriorityChip.tsx';
import TaskLine from './TaskPage/TaskLine.tsx';

type Draft = { tags: TagPart[]; input: string; priority: Priority; deadline: string; context: string };
const EMPTY: Draft = { tags: [], input: '', priority: 'NORMAL', deadline: '', context: '' };

const label = { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/**
 * A new task (`/tasks/new`), over My day like a task. The title is its tags,
 * typed as in the search; priority, deadline and context are optional.
 * `?waitsFor=<id>` — the new task waits for that one, `?waitedOnBy=<id>` —
 * that one (mine) waits for the new task: the "New task" buttons of a
 * task's dependencies open it so. The search in My day and a task's
 * dependencies pass the title typed there as the router state (decision 55).
 * What is typed is a draft until "Create task" or
 * "Cancel": leaving for another page and coming back keeps it.
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const refresh = useTaskRefresh();
  const [params, setParams] = useSearchParams();
  const waitsFor = Number(params.get('waitsFor')) || undefined;
  const waitedOnBy = Number(params.get('waitedOnBy')) || undefined;
  const relatedId = waitsFor ?? waitedOnBy;
  const related = useQuery(trpc.Task.get.queryOptions({ id: relatedId ?? 0 }, { enabled: relatedId !== undefined }));

  const [draft, setDraft, clearDraft] = useDraft<Draft>('newTask', EMPTY);
  const { tags, input, priority, deadline } = draft;
  const change = (part: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...part }));
  const editor = useRef<RichEditorHandle>(null);

  // The title typed where the form was opened from replaces the draft's, once per opening.
  const location = useLocation();
  const passed = (location.state as { parts?: TagPart[] } | null)?.parts;
  const opened = useRef('');
  useEffect(() => {
    if (!passed?.length || opened.current === location.key) return;
    opened.current = location.key;
    setDraft((prev) => ({ ...prev, tags: passed, input: '' }));
  });

  // Text typed but not turned into a chip becomes a tag of its own — unless a tag is spelled so.
  const title = useTitle(tags, input);
  const names = title.names;

  const create = useMutation(trpc.Task.create.mutationOptions({
    onSuccess: (id) => {
      clearDraft();
      refresh();
      // Offline the task waits in the outbox and has no number yet: back to My day.
      void navigate((id as number | undefined) === undefined ? '/' : `/tasks/${id}`, { replace: true });
    },
  }));
  const submit = () => title.ready && create.mutate({
    tags: names,
    priority,
    deadline: deadline ? new Date(deadline) : null,
    context: editor.current?.isEmpty() ? null : (editor.current?.getHtml() ?? null),
    waitsFor,
    waitedOnBy,
  });
  // Back where the form was opened from; a link opened in a new tab goes home.
  const cancel = () => {
    clearDraft();
    void ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'));
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 }, display: 'flex', flexDirection: 'column', gap: 2.5, width: '100%', maxWidth: 960, mx: 'auto', alignSelf: 'flex-start' }}>
      <Typography variant="h3" sx={{ fontWeight: 600 }}>{t('newTask.title')}</Typography>

      <TagInput
        value={tags}
        onChange={(next) => change({ tags: next })}
        input={input}
        onInputChange={(next) => change({ input: next })}
        allowNew
        label={t('newTask.tags')}
        helperText={title.taken ? t('title.taken', { id: title.taken.id })
          : title.pickFirst ? t('title.pickFirst', { name: title.pickFirst }) : t('newTask.tagsHint')}
        autoFocus
      />

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2 }}>
        <TextField
          select
          label={t('newTask.priority')}
          value={priority}
          onChange={(e) => change({ priority: e.target.value as Priority })}
          sx={{ minWidth: 180 }}
        >
          {PRIORITIES.map((value) => <MenuItem key={value} value={value}><PriorityChip priority={value} /></MenuItem>)}
        </TextField>
        <TextField
          type="datetime-local"
          label={t('task.deadline')}
          value={deadline}
          onChange={(e) => change({ deadline: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      <Stack spacing={0.75}>
        <Typography sx={label}>{t('task.context')}</Typography>
        <RichEditor
          handle={editor}
          initial={draft.context}
          placeholder={t('task.contextPlaceholder')}
          onSubmit={submit}
          onChange={(html) => change({ context: html })}
        />
      </Stack>

      {relatedId !== undefined && (
        <Stack spacing={0.75}>
          <Typography sx={label}>{waitsFor ? t('newTask.waitsFor') : t('newTask.waitedOnBy')}</Typography>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              {related.data ? <TaskLine task={related.data} /> : <Typography sx={{ fontFamily: 'monospace' }}>#{relatedId}</Typography>}
            </Box>
            <Tooltip title={t('newTask.noDependency')}>
              <IconButton size="small" onClick={() => setParams({}, { replace: true })}>
                <Close fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      )}

      <Stack direction="row" spacing={1}>
        <Button variant="contained" disabled={!title.ready || create.isPending} onClick={submit}>
          {t('newTask.create')}
        </Button>
        <Button color="inherit" onClick={cancel}>{t('common.cancel')}</Button>
      </Stack>
    </Paper>
  );
}
