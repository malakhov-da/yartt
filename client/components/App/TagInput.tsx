import { Add } from '@mui/icons-material';
import { Autocomplete, Box, Button, Chip, Stack, TextField, type SxProps, type Theme } from '@mui/material';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagPart } from '#shared/tags.ts';
import { TagName } from '#shared/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TagChip from './TagChip.tsx';

type Option =
  | { kind: 'part'; part: TagPart }
  | { kind: 'variant'; parts: TagPart[] };

export const partName = (part: TagPart) => ('tag' in part ? part.tag.name : part.name);

/** A new tag: dashed, with a plus — it does not exist until the task is saved. */
function PartChip(p: { part: TagPart; outlined?: boolean } & Record<string, unknown>) {
  const { part, outlined, ...rest } = p;
  return 'tag' in part
    ? <TagChip size="small" variant={outlined ? 'outlined' : 'filled'} tag={part.tag} {...rest} />
    : <Chip size="small" variant="outlined" icon={<Add />} label={part.name} sx={{ borderStyle: 'dashed' }} {...rest} />;
}

/**
 * A title of tags — the search, a new task, a title being changed, a task to
 * link (decision 55). Suggestions forgive typos, transliteration and the
 * wrong layout; several words come as ready sets of tags (Tags.suggest).
 * A tag is never made by accident: Enter takes the tag spelled exactly so
 * (in the search, the best suggestion), and with `allowNew` a new tag is
 * the button under the field — only when no tag is spelled so, the whole
 * phrase one tag, created when the task is saved. Text left unpicked is
 * the caller's (useTitle): it becomes a tag of its own on creating a task.
 */
export default function (p: {
  value: TagPart[];
  onChange: (parts: TagPart[]) => void;
  input: string;
  onInputChange: (input: string) => void;
  allowNew?: boolean;
  label?: string;
  placeholder?: string;
  helperText?: ReactNode;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  sx?: SxProps<Theme>;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const text = p.input.trim();
  const suggested = useQuery(trpc.Tags.suggest.queryOptions(
    { text: p.input },
    { enabled: text !== '', placeholderData: keepPreviousData },
  ));

  const names = new Set(p.value.map(partName));
  // With tags picked and nothing typed: what usually goes with them (decision 56).
  const pickedIds = p.value.flatMap((part) => ('tag' in part ? [part.tag.id] : []));
  const related = useQuery(trpc.Tags.related.queryOptions(
    { tagIds: pickedIds },
    { enabled: pickedIds.length > 0 && text === '', placeholderData: keepPreviousData },
  ));
  const together = text === '' && pickedIds.length > 0 ? (related.data ?? []).filter((tag) => !names.has(tag.name)) : [];
  const data = text === '' ? undefined : suggested.data;
  const typed = TagName.safeParse(text);
  const options: Option[] = [
    ...(data?.variants ?? [])
      .filter((parts) => (p.allowNew || parts.every((part) => 'tag' in part)) && parts.some((part) => !names.has(partName(part))))
      .map((parts) => ({ kind: 'variant' as const, parts })),
    ...(data?.tags ?? []).filter((tag) => !names.has(tag.name)).map((tag) => ({ kind: 'part' as const, part: { tag } })),
  ];
  // A new tag is offered apart, under the field: only when no tag is spelled so.
  const newTag = p.allowNew && typed.success && !names.has(typed.data) && data !== undefined && !data.exact && !suggested.isPlaceholderData
    ? typed.data : null;

  const add = (parts: TagPart[]) => {
    p.onInputChange('');
    const seen = new Set(names);
    p.onChange([...p.value, ...parts.filter((part) => !seen.has(partName(part)) && !!seen.add(partName(part)))]);
  };

  // Enter on typed text: the tag spelled so, else (search) the best
  // suggestion — never a new tag — for this very text, so Enter pressed
  // before the suggestions came waits for them (from the cache when they did).
  const enter = async (value: string) => {
    const name = TagName.safeParse(value);
    if (!name.success) return;
    const found = await queryClient.fetchQuery(trpc.Tags.suggest.queryOptions({ text: value }));
    const exact = found.tags.find((tag) => tag.name === name.data);
    if (exact) add([{ tag: exact }]);
    else if (!p.allowNew && found.tags[0]) add([{ tag: found.tags[0] }]);
    // Nothing taken: the text stays as typed (the field would clear itself on Enter).
    else p.onInputChange(value);
  };

  return (
    <Stack spacing={0.5} sx={p.sx}>
    <Autocomplete<Option, true, false, true>
      multiple
      freeSolo
      // Picking keeps the list open: the next tag is typed right away.
      disableCloseOnSelect
      value={p.value.map((part) => ({ kind: 'part' as const, part }))}
      inputValue={p.input}
      options={options}
      filterOptions={(x) => x}
      getOptionLabel={(o) =>
        typeof o === 'string' ? o
        : o.kind === 'part' ? ('tag' in o.part ? o.part.tag.name : t('tagInput.newTag', { name: o.part.name }))
        : o.parts.map(partName).join(' ')}
      isOptionEqualToValue={(a, b) => a === b}
      onInputChange={(_e, value, reason) => reason !== 'reset' && p.onInputChange(value)}
      onChange={(_e, value, reason) => {
        if (reason === 'removeOption' || reason === 'clear') {
          return p.onChange(value.flatMap((v) => (typeof v !== 'string' && v.kind === 'part' ? [v.part] : [])));
        }
        const last = value.at(-1);
        if (last === undefined) return;
        if (typeof last === 'string') void enter(last);
        else if (last.kind === 'part') add([last.part]);
        else add(last.parts);
      }}
      renderValue={(value, getItemProps) =>
        value.map((v, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return typeof v !== 'string' && v.kind === 'part' ? <PartChip key={key} part={v.part} {...itemProps} /> : null;
        })}
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key} {...props} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
          {o.kind === 'variant'
            ? o.parts.map((part, i) => <PartChip key={i} part={part} outlined />)
            : 'tag' in o.part ? <PartChip part={o.part} outlined /> : (
              <>
                <Add fontSize="small" />
                {t('tagInput.newTag', { name: o.part.name })}
              </>
            )}
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          inputRef={p.inputRef}
          autoFocus={p.autoFocus}
          label={p.label}
          helperText={p.helperText}
          placeholder={p.value.length ? '' : p.placeholder}
          slotProps={{
            input: {
              ...params.InputProps,
              startAdornment: (
                <>
                  {p.startAdornment}
                  {params.InputProps.startAdornment}
                </>
              ),
              endAdornment: (
                <>
                  {params.InputProps.endAdornment}
                  {p.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
    {together.length > 0 && (
      <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
        <Box component="span" sx={{ typography: 'caption', color: 'text.secondary', mr: 0.5 }}>{t('tagInput.together')}</Box>
        {together.map((tag) => (
          <TagChip key={tag.id} size="small" variant="outlined" tag={tag} onClick={() => add([{ tag }])} />
        ))}
      </Stack>
    )}
    {newTag && (
      <Box>
        <Button size="small" startIcon={<Add />} onClick={() => add([{ name: newTag }])}>
          {t('tagInput.newTag', { name: newTag })}
        </Button>
      </Box>
    )}
    </Stack>
  );
}

/**
 * What a title typed so far makes (decision 55): the picked tags and the
 * text left unpicked, which becomes a new tag of its own when a task is
 * created — unless a tag is spelled so: that one has to be picked first.
 * `taken` — a task with exactly this title exists (titles are unique);
 * `ready` — a task can be created with it.
 */
export function useTitle(parts: TagPart[], input: string, own?: number) {
  const trpc = useTRPC();
  const typed = TagName.safeParse(input);
  const rest = typed.success && !parts.some((part) => partName(part) === typed.data) ? typed.data : null;
  const suggested = useQuery(trpc.Tags.suggest.queryOptions({ text: input }, { enabled: rest !== null }));
  const pickFirst = rest !== null && suggested.data?.exact ? rest : null;
  const names = [...parts.map(partName), ...(rest !== null ? [rest] : [])];
  const check = useQuery(trpc.Task.byTags.queryOptions(
    { tags: names },
    { enabled: names.length > 0 && names.length <= 20, placeholderData: keepPreviousData },
  ));
  const taken = check.isPlaceholderData || !check.data || check.data.id === own ? null : check.data;
  const checking = (rest !== null && suggested.isPending) || (names.length > 0 && (check.isPending || check.isPlaceholderData));
  return {
    names,
    /** Every part, the unpicked text as a new tag. */
    parts: rest !== null ? [...parts, { name: rest }] : parts,
    pickFirst,
    taken,
    ready: names.length > 0 && pickFirst === null && taken === null && !checking,
  };
}
