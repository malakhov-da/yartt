import { SubdirectoryArrowRight } from '@mui/icons-material';
import { Stack, Typography } from '@mui/material';
import type { MentionReply } from '#shared/comment.ts';
import { useFormat } from '#client/hooks/format.ts';

/** The answer inside its mention: who answered, when, and the beginning of it. */
export default function (p: { who: string; reply: MentionReply }) {
  const format = useFormat();
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'flex-start', pl: 1, borderLeft: 2, borderColor: 'primary.light', minWidth: 0 }}>
      <SubdirectoryArrowRight fontSize="small" sx={{ color: 'text.secondary', mt: 0.125 }} />
      <Typography variant="body2" sx={{ color: 'text.secondary', minWidth: 0, overflowWrap: 'anywhere' }}>
        <b>{p.who}</b> · {format.relative(p.reply.at)}: «{p.reply.excerpt}»
      </Typography>
    </Stack>
  );
}
