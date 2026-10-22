import { Add, AddTask, Close, Edit } from '@mui/icons-material';
import { Box, Button, Checkbox, FormControlLabel, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { TagPart } from '#shared/tags.ts';
import type { Dependency, TaskDetails, TaskHeader, TaskPage } from '#shared/task.ts';
import { fromLocalInput, toLocalInput, useFormat } from '#client/hooks/format.ts';
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
  /** A latest deadline is set: the task waited for has to be done by `latest` (a datetime-local value). */
  limited: boolean;
  latest: string;
  editing: number | null;
};

/**
 * "Waits for", then "Waited on by". The owner links a task this one waits
 * for — found by tags or number as in the search (decision 55), with or
 * without the latest deadline of it this one can live with — changes and
 * removes it; anyone
 * who sees this task makes one of their own wait for it. "+" in the search
 * opens the new-task form with the title typed, tied to this one. A latest
 * deadline forbids nothing: broken, it is marked on the line and puts both
 * tasks at risk (decision 66).
 */
export default function (p: { task: TaskPage & { details: TaskDetails } }) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const format = useFormat();
  const refresh = useTaskRefresh();
  const { task } = p;
  const isOwner = task.access === 'owner';
  const [draft, setDraft] = useDraft<Draft | null>(`link:${task.id}`, null);
  // A latest deadline to start from: the deadline of the task waited for, else the waiting one's, else a week ahead.
  const suggest = (dependency: Date | null, dependent: Date | null) =>
    toLocalInput(dependency ?? dependent ?? new Date(Date.now() + 7 * 86_400_000));
  const start = (waits: boolean) => setDraft({ waits, picked: null, parts: [], input: '', limited: false, latest: '', editing: null });
  const set = useMutation(trpc.Dependency.set.mutationOptions({ onSuccess: () => { refresh(); setDraft(null); } }));
  const remove = useMutation(trpc.Dependency.remove.mutationOptions({ onSuccess: refresh }));

  // In "Waits for" the line is the task waited for, this one waits; in "Waited on by" the other way round.
  const sides = (dep: Dependency, waits: boolean) => (waits
    ? { dependent: task, dependency: dep as TaskHeader }
    : { dependent: dep as TaskHeader, dependency: task as TaskHeader });
  const isOpen = (x: TaskHeader) => x.deadline === null || x.deadline > new Date();
  // Broken: the waiting task is open, and the one waited for is due later than it can live with, or has no deadline.
  const broken = (dep: Dependency, waits: boolean) => {
    const { dependent, dependency } = sides(dep, waits);
    return dep.latestAt !== null && isOpen(dependent) && (dependency.deadline === null || dependency.deadline > dep.latestAt);
  };
  const note = (dep: Dependency, waits: boolean) =>
    dep.latestAt === null ? undefined : t(waits ? 'task.latestMine' : 'task.latestTheirs', { date: format.dateTime(dep.latestAt) });
  const hint = (dep: Dependency, waits: boolean) => {
    if (dep.latestAt === null) return undefined;
    const { dependent, dependency } = sides(dep, waits);
    const params = { dependent: dependent.id, dependency: dependency.id, date: format.dateTime(dep.latestAt) };
    if (dependency.deadline === null) return t('task.latestHintNone', params);
    return t(broken(dep, waits) ? 'task.latestHintLate' : 'task.latestHint', { ...params, deadline: format.dateTime(dependency.deadline) });
  };

  const latest = draft?.limited ? fromLocalInput(draft.latest) : null;
  const valid = !!draft?.picked && draft.picked.id !== task.id && (!draft.limited || latest !== null);
  const save = () => valid && set.mutate(draft!.waits
    ? { taskId: task.id, value: draft!.picked!.id, latestAt: draft!.limited ? latest : null }
    : { taskId: draft!.picked!.id, value: task.id, latestAt: draft!.limited ? latest : null });

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
                <TaskLine task={dep} note={note(dep, g.waits)} noteHint={hint(dep, g.waits)} noteWarn={broken(dep, g.waits)} />
              </Box>
              {g.waits && isOwner && (
                <>
                  <Tooltip title={t('task.dependency.edit')}>
                    <IconButton size="small" onClick={() => setDraft({
                      waits: true,
                      picked: dep,
                      parts: [],
                      input: '',
                      limited: dep.latestAt !== null,
                      latest: dep.latestAt ? toLocalInput(dep.latestAt) : suggest(dep.deadline, task.deadline),
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
              <FormControlLabel
                control={<Checkbox checked={draft.limited} onChange={(e) => setDraft({
                  ...draft,
                  limited: e.target.checked,
                  latest: draft.latest || (draft.waits ? suggest(draft.picked!.deadline, task.deadline) : suggest(task.deadline, draft.picked!.deadline)),
                })} />}
                label={t('task.dependency.limit')}
              />
              {draft.limited && (
                <TextField
                  type="datetime-local"
                  size="small"
                  label={t('task.dependency.latest', { dependency: draft.waits ? draft.picked.id : task.id })}
                  value={draft.latest}
                  onChange={(e) => setDraft({ ...draft, latest: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  error={latest === null}
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={{ width: 240 }}
                />
              )}
              <Button variant="contained" disabled={!valid || set.isPending} onClick={save}>{t('common.save')}</Button>
              <Button color="inherit" onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
              <Typography variant="caption" sx={{ color: 'text.secondary', flexBasis: '100%' }}>
                {(() => {
                  // Spelled out with the numbers: which task is waited for, and which one would not make it.
                  const ids = draft.waits
                    ? { dependent: task.id, dependency: draft.picked!.id }
                    : { dependent: draft.picked!.id, dependency: task.id };
                  return t(draft.limited ? 'task.dependency.limitHelp' : 'task.dependency.freeHelp', ids);
                })()}
              </Typography>
            </Stack>
          )}
        </Stack>
      ))}
    </>
  );
}
