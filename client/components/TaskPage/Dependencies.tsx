import { Add, AddTask, Close, Edit } from '@mui/icons-material';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { Dependency, TaskDetails, TaskPage } from '#shared/task.ts';
import { parseMinutes, useFormat } from '#client/hooks/format.ts';
import { useDraft } from '#client/hooks/drafts.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TaskLine from './TaskLine.tsx';

const label = { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' } as const;

type Draft = { value: string; hard: boolean; lag: string; editing: number | null };

/**
 * "Waits for", then "Waited on by". The owner adds a dependency by task
 * number — soft, or hard with a lag that ties the deadlines — changes and
 * removes it; everyone else reads. "New task" opens the new-task form tied
 * to this one: one this task waits for (the owner), or one that waits for
 * this task (anyone who sees it — the new task is theirs).
 */
export default function (p: { task: TaskPage & { details: TaskDetails } }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const { task } = p;
  const isOwner = task.access === 'owner';
  const [draft, setDraft] = useDraft<Draft | null>(`dependency:${task.id}`, null);
  const set = useMutation(trpc.Dependency.set.mutationOptions({ onSuccess: () => { refresh(); setDraft(null); } }));
  const remove = useMutation(trpc.Dependency.remove.mutationOptions({ onSuccess: refresh }));

  const note = (dep: Dependency) =>
    dep.minMinutesAfter === null ? undefined
    : dep.minMinutesAfter === 0 ? t('task.hardNoLag')
    : t('task.hard', { lag: format.minutes(dep.minMinutesAfter) });
  const hint = (dep: Dependency, waits: boolean) =>
    dep.minMinutesAfter === null ? undefined : t('task.hardHint', {
      // The dependent task finishes no earlier than lag after the one it waits for.
      dependent: waits ? task.id : dep.id,
      dependency: waits ? dep.id : task.id,
      lag: format.minutes(dep.minMinutesAfter),
    });

  const value = draft ? Number(draft.value) : 0;
  const lag = draft?.hard ? parseMinutes(draft.lag, true) : null;
  const valid = !!draft && Number.isInteger(value) && value > 0 && value !== task.id && (!draft.hard || lag !== null);
  const save = () => valid && set.mutate({ taskId: task.id, value, minMinutesAfter: draft!.hard ? lag : null });

  const groups = [
    { title: t('task.waitsFor'), items: task.details.waitsFor, waits: true },
    { title: t('task.waitedOnBy'), items: task.details.waitedOnBy, waits: false },
  ].filter((g) => g.items.length > 0 || !g.waits || isOwner);

  return (
    <>
      {groups.map((g) => (
        <Stack key={g.title} spacing={0.75}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Typography sx={label}>{g.title}</Typography>
            {g.waits && isOwner && !draft && (
              <Button size="small" startIcon={<Add />} onClick={() => setDraft({ value: '', hard: false, lag: '1д', editing: null })}>
                {t('task.dependency.add')}
              </Button>
            )}
            {(!g.waits || isOwner) && !draft && (
              <Button
                size="small"
                startIcon={<AddTask />}
                component={Link}
                to={`/tasks/new?${g.waits ? 'waitedOnBy' : 'waitsFor'}=${task.id}`}
              >
                {t('task.dependency.newTask')}
              </Button>
            )}
          </Stack>
          {g.items.map((dep) => (
            <Stack key={dep.id} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                <TaskLine task={dep} note={note(dep)} noteHint={hint(dep, g.waits)} />
              </Box>
              {g.waits && isOwner && (
                <>
                  <Tooltip title={t('task.dependency.edit')}>
                    <IconButton size="small" onClick={() => setDraft({
                      value: String(dep.id),
                      hard: dep.minMinutesAfter !== null,
                      lag: dep.minMinutesAfter === null ? '1д' : format.minutes(dep.minMinutesAfter),
                      editing: dep.id,
                    })}>
                      <Edit fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('task.dependency.remove')}>
                    <IconButton size="small" disabled={remove.isPending} onClick={() => remove.mutate({ taskId: task.id, value: dep.id })}>
                      <Close fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              )}
            </Stack>
          ))}
          {g.waits && draft && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TextField
                size="small"
                autoFocus
                label={t('task.dependency.task')}
                value={draft.value}
                disabled={draft.editing !== null}
                onChange={(e) => setDraft({ ...draft, value: e.target.value.replace(/\D/g, '') })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null); }}
                slotProps={{ input: { startAdornment: <Typography sx={{ color: 'text.secondary', pr: 0.5 }}>#</Typography> } }}
                sx={{ width: 120 }}
              />
              <TextField
                select
                size="small"
                label={t('task.dependency.kind')}
                value={draft.hard ? 'hard' : 'soft'}
                onChange={(e) => setDraft({ ...draft, hard: e.target.value === 'hard' })}
                sx={{ width: 170 }}
              >
                <MenuItem value="soft">{t('task.dependency.soft')}</MenuItem>
                <MenuItem value="hard">{t('task.dependency.hard')}</MenuItem>
              </TextField>
              {draft.hard && (
                <TextField
                  size="small"
                  label={t('task.dependency.lag')}
                  value={draft.lag}
                  onChange={(e) => setDraft({ ...draft, lag: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  error={lag === null}
                  helperText={lag === null ? t('task.dependency.lagHint') : format.minutes(lag)}
                  sx={{ width: 150 }}
                />
              )}
              <Button variant="contained" disabled={!valid || set.isPending} onClick={save}>{t('common.save')}</Button>
              <Button color="inherit" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
              <Typography variant="caption" sx={{ color: 'text.secondary', flexBasis: '100%' }}>
                {draft.hard ? t('task.dependency.hardHelp') : t('task.dependency.softHelp')}
              </Typography>
            </Stack>
          )}
        </Stack>
      ))}
    </>
  );
}
