import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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

/** "#12" in text — not a part of a word, an address or a number. */
const TASK_REF = /(?<![\p{L}\p{N}_/#&])#(\d{1,9})(?![\p{L}\p{N}_])/gu;

/**
 * A task number in a comment or a context ("see #12") is a link to the
 * task, in what is shown only: nothing is stored, so old texts get it too.
 * Text already a link or code is left alone. RichView opens it in the app.
 */
export const TaskRefs = Extension.create({
  name: 'taskRefs',
  addProseMirrorPlugins() {
    return [new Plugin({
      props: {
        decorations: (state) => {
          const found: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'codeBlock') return false;
            if (!node.isText || node.marks.some((m) => m.type.name === 'link' || m.type.name === 'code')) return;
            for (const m of node.text!.matchAll(TASK_REF)) {
              found.push(Decoration.inline(pos + m.index, pos + m.index + m[0].length, {
                nodeName: 'a',
                href: `/tasks/${m[1]}`,
                'data-task-ref': m[1]!,
              }));
            }
          });
          return DecorationSet.create(state.doc, found);
        },
      },
    })];
  },
});
