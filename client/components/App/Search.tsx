import { Add, Search } from '@mui/icons-material';
import { Autocomplete, Box, Chip, InputAdornment, TextField, Typography } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Tag, TaskHeader } from '#shared/task.ts';
import { useStore } from '#client/hooks/store.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TagChip from './TagChip.tsx';

type Chosen = { kind: 'tag'; tag: Tag } | { kind: 'new'; name: string };
type Option = Chosen | { kind: 'task'; task: TaskHeader & { canSee: boolean } } | { kind: 'create'; names: string[] };

const name = (c: Chosen) => (c.kind === 'tag' ? c.tag.name : c.name);

/**
 * The search in the top line ("/" focuses it). Picked tags narrow the tasks,
 * the typed text searches context and comments; the last option creates a
 * task with the picked tags (docs/product/interface.md, Find).
 */
export default function () {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [input, setInput] = useState('');
  const query = input.trim();
  const tagIds = chosen.flatMap((c) => (c.kind === 'tag' ? [c.tag.id] : []));
  const hasNew = chosen.some((c) => c.kind === 'new');

  const tags = useQuery(trpc.Task.tags.queryOptions({ query }, { enabled: query !== '' }));
  const tasks = useQuery(trpc.Task.search.queryOptions(
    { tagIds, text: query, page: 1 },
    { enabled: !hasNew && (tagIds.length > 0 || query.length >= 3) },
  ));
  const create = useMutation(trpc.Task.create.mutationOptions({ onSuccess: (id) => open(id) }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !target.isContentEditable && !['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Another screen asked to search by tags: take them and open the list.
  const requested = useStore((s) => s.searchTags);
  useEffect(() => {
    if (!requested) return;
    setChosen(requested.map((tag) => ({ kind: 'tag', tag })));
    setInput('');
    useStore.setState({ searchTags: null });
    inputRef.current?.focus();
  }, [requested]);

  const open = (id: number) => {
    setChosen([]);
    setInput('');
    inputRef.current?.blur();
    void navigate(`/tasks/${id}`);
  };

  const names = chosen.map(name);
  const options: Option[] = [
    ...(tasks.data?.items ?? []).map((task) => ({ kind: 'task' as const, task })),
    ...(tags.data ?? [])
      .filter((tag) => !tagIds.includes(tag.id))
      .map((tag) => ({ kind: 'tag' as const, tag })),
    ...(names.length > 0 ? [{ kind: 'create' as const, names }] : []),
  ];

  return (
    <Autocomplete<Option, true, false, true>
      multiple
      freeSolo
      // Picking a tag keeps the list open: its tasks and "Create" show at once.
      disableCloseOnSelect
      openOnFocus
      size="small"
      sx={{ flex: 1, minWidth: 0 }}
      value={chosen}
      inputValue={input}
      options={options}
      filterOptions={(x) => x}
      groupBy={(o) => (o.kind === 'task' ? 'task' : o.kind === 'tag' ? 'tag' : '')}
      renderGroup={(g) => <li key={g.key}>{g.children}</li>}
      getOptionLabel={(o) =>
        typeof o === 'string' ? o
        : o.kind === 'tag' ? o.tag.name
        : o.kind === 'new' ? o.name
        : o.kind === 'task' ? o.task.tags.map((tag) => tag.name).join(' · ')
        : t('search.create', { tags: o.names.join(' · ') })}
      isOptionEqualToValue={(a, b) => a === b}
      onInputChange={(_e, value, reason) => reason !== 'reset' && setInput(value)}
      onChange={(_e, value) => {
        const last = value.at(-1);
        const rest = value.slice(0, -1).filter((v): v is Chosen => typeof v !== 'string' && (v.kind === 'tag' || v.kind === 'new'));
        if (last === undefined) return setChosen([]);
        if (typeof last === 'string') {
          if (last.trim()) setChosen([...rest, { kind: 'new', name: last.trim() }]);
        } else if (last.kind === 'task') {
          return open(last.task.id);
        } else if (last.kind === 'create') {
          return create.mutate({ tags: last.names });
        } else {
          setChosen([...rest, last]);
        }
        setInput('');
      }}
      renderValue={(value, getItemProps) =>
        value.map((v, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          const label = typeof v === 'string' ? v : v.kind === 'tag' || v.kind === 'new' ? name(v) : '';
          return <Chip key={key} size="small" label={label} {...itemProps} />;
        })}
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key} {...props} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {o.kind === 'task' && (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>#{o.task.id}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, flexGrow: 1 }}>
                {o.task.tags.map((tag) => <TagChip key={tag.id} size="small" tag={tag} />)}
              </Box>
              {o.task.deadline && o.task.deadline <= new Date() && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('search.closed')}</Typography>
              )}
            </>
          )}
          {o.kind === 'tag' && <TagChip size="small" variant="outlined" tag={o.tag} />}
          {o.kind === 'create' && (
            <>
              <Add fontSize="small" />
              {t('search.create', { tags: o.names.join(' · ') })}
            </>
          )}
        </Box>
      )}
      noOptionsText={query || chosen.length ? t('search.noResults') : t('search.hint')}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={inputRef}
          variant="outlined"
          placeholder={chosen.length ? '' : t('search.placeholder')}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <>
                  <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>
                  {params.InputProps.startAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}

