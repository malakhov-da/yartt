import { Add, AddTask, Close, Edit } from '@mui/icons-material';
import { Box, Button, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { TagPart } from '#shared/tags.ts';
import type { Dependency, TaskDetails, TaskHeader, TaskPage } from '#shared/task.ts';
import { parseMinutes, useFormat } from '#client/hooks/format.ts';
import { useDraft } from '#client/hooks/drafts.ts';
import { useTaskRefresh } from '#client/hooks/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TaskLine from './TaskLine.tsx';
import TaskPicker from './TaskPicker.tsx';

const label = { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'text.secondary' } as const;

/**
 * A link being made: in "waits for" (`waits`) this task waits for the
 * picked one, otherwise the picked one — mine — waits for this. `picked`
 * is the other task once found; `parts`/`input` — what is typed to find it.
 */
type Draft = {
  waits: boolean;
  picked: TaskHeader | null;
  parts: TagPart[];
  input: string;
  hard: boolean;
  lag: string;
  editing: number | null;
};

/**
 * "Waits for", then "Waited on by". The owner links a task this one waits
 * for — found by tags or number as in the search (decision 55), soft, or
 * hard with a lag that ties the deadlines — changes and removes it; anyone
 * who sees this task makes one of their own wait for it. "+" in the search
 * opens the new-task form with the title typed, tied to this one.
 */
export default function (p: { task: TaskPage & { details: TaskDetails } }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const { task } = p;
  const isOwner = task.access === 'owner';
  const [draft, setDraft] = useDraft<Draft | null>(`link:${task.id}`, null);
  const start = (waits: boolean) => setDraft({ waits, picked: null, parts: [], input: '', hard: false, lag: '1д', editing: null });
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

  const lag = draft?.hard ? parseMinutes(draft.lag, true) : null;
  const valid = !!draft?.picked && draft.picked.id !== task.id && (!draft.hard || lag !== null);
  const save = () => valid && set.mutate(draft!.waits
    ? { taskId: task.id, value: draft!.picked!.id, minMinutesAfter: draft!.hard ? lag : null }
    : { taskId: draft!.picked!.id, value: task.id, minMinutesAfter: draft!.hard ? lag : null });

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
            {(!g.waits || isOwner) && !draft && (
              <Button size="small" startIcon={<Add />} onClick={() => start(g.waits)}>
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
                      waits: true,
                      picked: dep,
                      parts: [],
                      input: '',
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
          {draft && draft.waits === g.waits && !draft.picked && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <TaskPicker
                parts={draft.parts}
                input={draft.input}
                onChange={(next) => setDraft({ ...draft, ...next })}
                exclude={task.id}
                mine={!g.waits}
                newTask={`/tasks/new?${g.waits ? 'waitedOnBy' : 'waitsFor'}=${task.id}`}
                onPick={(picked) => setDraft({ ...draft, picked })}
              />
              <Button color="inherit" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            </Stack>
          )}
          {draft && draft.waits === g.waits && draft.picked && (
            <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <Box sx={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}><TaskLine task={draft.picked} /></Box>
                {draft.editing === null && (
                  <Tooltip title={t('task.dependency.other')}>
                    <IconButton size="small" onClick={() => setDraft({ ...draft, picked: null })}><Close fontSize="small" /></IconButton>
                  </Tooltip>
                )}
              </Box>
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
