import { Box } from '@mui/material';
import { RichTextReadOnly } from 'mui-tiptap';
import { useMemo } from 'react';
import { imageSx, richTextExtensions } from './richText.ts';

/**
 * Shows sanitized HTML of a comment or a context with the editor's own
 * styles. An image opens in full size in a new tab on click.
 */
export default function (p: { html: string }) {
  const extensions = useMemo(() => richTextExtensions(), []);
  return (
    <Box
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLImageElement) window.open(target.src, '_blank', 'noopener');
      }}
      sx={{ ...imageSx, '& img': { ...imageSx['& img'], cursor: 'zoom-in' }, '& p:first-of-type': { mt: 0 }, '& p:last-of-type': { mb: 0 } }}
    >
      <RichTextReadOnly content={p.html} extensions={extensions} immediatelyRender />
    </Box>
  );
}
