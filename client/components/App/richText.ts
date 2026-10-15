import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from 'mui-tiptap';

// One set of extensions for editing and for showing comments and contexts,
// matching what the server keeps (server/html.ts): no tables, no colors.
// Images are resized by dragging their corner; the width is kept.

/** Only our own attachments may be images (the server enforces it too). */
const OWN_IMAGE = /^\/api\/attachments\/\d+$/;

/** An image without a chosen width is not wider than this, and opens in full on click. */
export const IMAGE_MAX_WIDTH = 480;
export const imageSx = {
  '& img': { maxWidth: '100%', height: 'auto' },
  '& img:not([width])': { maxWidth: `min(100%, ${IMAGE_MAX_WIDTH}px)` },
};
export function richTextExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
    }),
    ResizableImage.configure({ inline: false, isAllowedImgSrc: (src) => OWN_IMAGE.test(src ?? '') }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}
