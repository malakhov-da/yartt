import { Chip, type ChipProps } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ElementType } from 'react';
import type { Tag } from '#shared/task.ts';

/** Colors offered for a tag; any #RRGGBB is accepted. */
export const TAG_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a',
] as const;

/** A tag in the viewer's own color (Tags tab); without one — the default chip. */
export default function (p: { tag: Pick<Tag, 'name' | 'color'> } & Omit<ChipProps, 'label' | 'color'>
  // As a link: Chip renders it on its root.
  & { component?: ElementType; href?: string; target?: string; rel?: string }) {
  const { tag, sx, ...rest } = p;
  return (
    <Chip
      {...rest}
      label={tag.name}
      sx={[
        tag.color !== null && {
          bgcolor: alpha(tag.color, 0.16),
          border: 1,
          borderColor: alpha(tag.color, 0.55),
          '&:hover': { bgcolor: alpha(tag.color, 0.26) },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
