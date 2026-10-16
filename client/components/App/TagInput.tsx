import { Add } from '@mui/icons-material';
import { Autocomplete, Box, Chip, TextField, type SxProps, type Theme } from '@mui/material';
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
 * Tags typed into one line: suggestions forgive typos, transliteration and
 * the wrong layout, several words come as ready sets of tags (Tags.suggest).
 * With `allowNew` (a task's title) a name no tag has is offered as a new
 * tag, created only when the task is saved; without it (the search) only
 * existing tags can be picked — a missing one would find nothing — and
 * Enter takes the best suggestion.
 */
export default function (p: {
  value: TagPart[];
  onChange: (parts: TagPart[]) => void;
  input: string;
  onInputChange: (input: string) => void;
  allowNew?: boolean;
  label?: string;
  placeholder?: string;
  helperText?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  startAdornment?: ReactNode;
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
  const data = text === '' ? undefined : suggested.data;
  const typed = TagName.safeParse(text);
  const options: Option[] = [
    ...(data?.variants ?? [])
      .filter((parts) => (p.allowNew || parts.every((part) => 'tag' in part)) && parts.some((part) => !names.has(partName(part))))
      .map((parts) => ({ kind: 'variant' as const, parts })),
    ...(data?.tags ?? []).filter((tag) => !names.has(tag.name)).map((tag) => ({ kind: 'part' as const, part: { tag } })),
    ...(p.allowNew && typed.success && !names.has(typed.data) && !data?.exact && !suggested.isPlaceholderData
      ? [{ kind: 'part' as const, part: { name: typed.data } }] : []),
  ];

  const add = (parts: TagPart[]) => {
    p.onInputChange('');
    const seen = new Set(names);
    p.onChange([...p.value, ...parts.filter((part) => !seen.has(partName(part)) && !!seen.add(partName(part)))]);
  };

  // Enter on typed text: the tag spelled so, else a new one (title) or the
  // best suggestion (search) — for this very text, so Enter pressed before
  // the suggestions came waits for them (from the cache when they did).
  const enter = async (value: string) => {
    const name = TagName.safeParse(value);
    if (!name.success) return;
    const found = await queryClient.fetchQuery(trpc.Tags.suggest.queryOptions({ text: value }));
    const exact = found.tags.find((tag) => tag.name === name.data);
    if (exact) add([{ tag: exact }]);
    else if (p.allowNew) add([{ name: name.data }]);
    else if (found.tags[0]) add([{ tag: found.tags[0] }]);
  };

  return (
    <Autocomplete<Option, true, false, true>
      multiple
      freeSolo
      // Picking keeps the list open: the next tag is typed right away.
      disableCloseOnSelect
      sx={p.sx}
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
            },
          }}
        />
      )}
    />
  );
}
