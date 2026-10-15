import { Add } from '@mui/icons-material';
import { Autocomplete, Box, Chip, TextField, type SxProps, type Theme } from '@mui/material';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { TagPart } from '#shared/tags.ts';
import { TagName, type Tag } from '#shared/task.ts';
import { useTRPC } from '#client/hooks/trpc.ts';
import TagChip from './TagChip.tsx';

type Option =
  | { kind: 'tag'; tag: Tag }
  | { kind: 'variant'; parts: TagPart[] }
  | { kind: 'create'; name: string };

const partName = (part: TagPart) => ('tag' in part ? part.tag.name : part.name);

/**
 * Tags typed into one line, as in the search and a new task's title:
 * suggestions forgive typos, transliteration and the other layout, several
 * words come as ready sets of tags (Tags.suggest), and the last item creates
 * a tag spelled exactly as typed when there is none. A new tag is created at
 * once (Tags.create); Enter does the same with the typed text.
 */
export default function (p: {
  value: Tag[];
  onChange: (tags: Tag[]) => void;
  input: string;
  onInputChange: (input: string) => void;
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
  const text = p.input.trim();
  const suggested = useQuery(trpc.Tags.suggest.queryOptions(
    { text: p.input },
    { enabled: text !== '', placeholderData: keepPreviousData },
  ));
  const create = useMutation(trpc.Tags.create.mutationOptions());

  const ids = new Set(p.value.map((tag) => tag.id));
  const names = new Set(p.value.map((tag) => tag.name));
  const data = text === '' ? undefined : suggested.data;
  const name = TagName.safeParse(text);
  const options: Option[] = [
    ...(data?.variants ?? [])
      .filter((parts) => parts.some((part) => !names.has(partName(part))))
      .map((parts) => ({ kind: 'variant' as const, parts })),
    ...(data?.tags ?? []).filter((tag) => !ids.has(tag.id)).map((tag) => ({ kind: 'tag' as const, tag })),
    ...(name.success && !names.has(name.data) && !data?.exact && !suggested.isPlaceholderData
      ? [{ kind: 'create' as const, name: name.data }] : []),
  ];

  // New names become tags first, so the value is always existing tags.
  const add = async (parts: TagPart[]) => {
    p.onInputChange('');
    const tags = await Promise.all(parts.map((part) => ('tag' in part ? part.tag : create.mutateAsync({ name: part.name }))));
    const seen = new Set(ids);
    p.onChange([...p.value, ...tags.filter((tag) => !seen.has(tag.id) && !!seen.add(tag.id))]);
  };

  return (
    <Autocomplete<Option, true, false, true>
      multiple
      freeSolo
      // Picking keeps the list open: the next tag is typed right away.
      disableCloseOnSelect
      sx={p.sx}
      value={p.value.map((tag) => ({ kind: 'tag' as const, tag }))}
      inputValue={p.input}
      options={options}
      filterOptions={(x) => x}
      loading={create.isPending}
      getOptionLabel={(o) =>
        typeof o === 'string' ? o
        : o.kind === 'tag' ? o.tag.name
        : o.kind === 'variant' ? o.parts.map(partName).join(' ')
        : t('tagInput.create', { name: o.name })}
      isOptionEqualToValue={(a, b) => a === b}
      onInputChange={(_e, value, reason) => reason !== 'reset' && p.onInputChange(value)}
      onChange={(_e, value, reason) => {
        if (reason === 'removeOption' || reason === 'clear') {
          return p.onChange(value.flatMap((v) => (typeof v !== 'string' && v.kind === 'tag' ? [v.tag] : [])));
        }
        const last = value.at(-1);
        if (last === undefined) return;
        if (typeof last === 'string') {
          const typed = TagName.safeParse(last);
          if (typed.success) void add([{ name: typed.data }]);
        } else if (last.kind === 'tag') {
          void add([{ tag: last.tag }]);
        } else if (last.kind === 'variant') {
          void add(last.parts);
        } else {
          void add([{ name: last.name }]);
        }
      }}
      renderValue={(value, getItemProps) =>
        value.map((v, index) => {
          const { key, ...itemProps } = getItemProps({ index });
          return typeof v !== 'string' && v.kind === 'tag'
            ? <TagChip key={key} size="small" tag={v.tag} {...itemProps} />
            : null;
        })}
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key} {...props} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
          {o.kind === 'tag' && <TagChip size="small" variant="outlined" tag={o.tag} />}
          {o.kind === 'variant' && o.parts.map((part, i) => ('tag' in part
            ? <TagChip key={i} size="small" variant="outlined" tag={part.tag} />
            : <Chip key={i} size="small" variant="outlined" icon={<Add />} label={part.name} sx={{ borderStyle: 'dashed' }} />))}
          {o.kind === 'create' && (
            <>
              <Add fontSize="small" />
              {t('tagInput.create', { name: o.name })}
            </>
          )}
        </Box>
      )}
      noOptionsText={t('tagInput.hint')}
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
