import { Add, Search } from '@mui/icons-material';
import { Box, IconButton, InputAdornment, Stack, Tooltip, Typography } from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { TagPart } from '#shared/tags.ts';
import type { TaskHeader } from '#shared/task.ts';
import { useMe } from '#client/hooks/me.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TagInput, { useTitle } from '../App/TagInput.tsx';
import TaskLine from './TaskLine.tsx';
import TakenLink from '../App/TakenLink.tsx';

const SHOWN = 8;

/**
 * A task to link, found as in the search (decision 55): by tags, or by its
 * number ("#12"); a click picks one. `mine` — only my own tasks (one I can
 * make wait). Its "+" opens a new task with the title typed, already tied
 * by `newTask` (the form's address).
 */
export default function (p: {
  parts: TagPart[];
  input: string;
  onChange: (next: { parts: TagPart[]; input: string }) => void;
  exclude: number;
  mine?: boolean;
  newTask: string;
  onPick: (task: TaskHeader) => void;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const me = useMe();
  const tagIds = p.parts.flatMap((part) => ('tag' in part ? [part.tag.id] : []));
  const number = Number(/^#?(\d+)$/.exec(p.input.trim())?.[1]) || null;
  const title = useTitle(p.parts, number ? '' : p.input);
  const byNumber = useQuery(trpc.Task.get.queryOptions({ id: number ?? 0 }, { enabled: number !== null, retry: false }));
  const found = useQuery(trpc.Task.search.queryOptions(
    { tagIds, tab: p.mine ? 'mine' : 'all', page: 1 },
    { enabled: tagIds.length > 0 && number === null, placeholderData: keepPreviousData },
  ));
  const results = (number !== null ? (byNumber.data ? [byNumber.data] : []) : tagIds.length ? (found.data?.items ?? []) : [])
    .filter((task) => task.id !== p.exclude && (!p.mine || task.ownerId === me.id))
    .slice(0, SHOWN);
  const canCreate = number === null && (title.names.length === 0 || title.ready);

  return (
    <Stack spacing={0.75} sx={{ flexBasis: '100%' }}>
      <TagInput
        value={p.parts}
        onChange={(parts) => p.onChange({ parts, input: p.input })}
        input={p.input}
        onInputChange={(input) => p.onChange({ parts: p.parts, input })}
        autoFocus
        label={t('task.dependency.find')}
        helperText={title.taken ? <TakenLink id={title.taken.id} />
          : title.pickFirst ? t('title.pickFirst', { name: title.pickFirst }) : undefined}
        startAdornment={<InputAdornment position="start"><Search fontSize="small" /></InputAdornment>}
        endAdornment={(
          <Tooltip title={title.names.length ? t('title.create', { title: title.names.join(' · ') }) : t('task.dependency.newTask')}>
            <span>
              <IconButton
                size="small"
                aria-label={t('task.dependency.newTask')}
                disabled={!canCreate}
                onClick={() => void navigate(p.newTask, { state: { parts: title.parts } })}
              >
                <Add fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        )}
      />
      {results.map((task) => (
        <Box
          key={task.id}
          role="button"
          tabIndex={0}
          aria-label={t('task.dependency.pick', { id: task.id })}
          onClickCapture={(e) => { e.preventDefault(); e.stopPropagation(); p.onPick(task); }}
          onKeyDown={(e) => { if (e.key === 'Enter') p.onPick(task); }}
          sx={{ cursor: 'pointer' }}
        >
          <TaskLine task={task} />
        </Box>
      ))}
      {(number !== null || tagIds.length > 0) && results.length === 0 && (byNumber.isFetched || found.isFetched) && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('search.noResults')}</Typography>
      )}
    </Stack>
  );
}
