import { Typography, type SxProps, type Theme } from '@mui/material';
import type { Tag } from '#shared/task.ts';
import TagChip from './TagChip.tsx';

/**
 * A task's title (decision 56): its tags as chips — what it is grouped by —
 * and its phrase, the tag no other task carries, as plain text after them,
 * so the title reads "[склад] [инвентаризация] подписать акт до пятницы".
 * `large` — on the task page.
 */
export default function (p: { tags: Tag[]; large?: boolean; chipSx?: SxProps<Theme> }) {
  const rubrics = p.tags.filter((tag) => !tag.phrase);
  const phrases = p.tags.filter((tag) => tag.phrase);
  return (
    <>
      {rubrics.map((tag) => <TagChip key={tag.id} size={p.large ? 'medium' : 'small'} tag={tag} sx={p.chipSx} />)}
      {phrases.length > 0 && (
        <Typography component="span" variant={p.large ? 'h3' : 'body2'} sx={{ fontWeight: p.large ? 600 : 500 }}>
          {phrases.map((tag, i) => (
            <span key={tag.id} style={tag.color ? { color: tag.color } : undefined}>{i > 0 && ' · '}{tag.name}</span>
          ))}
        </Typography>
      )}
    </>
  );
}
