import {
  insertImages, MenuButtonBlockquote, MenuButtonBold, MenuButtonBulletedList, MenuButtonCode, MenuButtonImageUpload,
  MenuButtonItalic, MenuButtonOrderedList, MenuButtonStrikethrough, MenuControlsContainer, MenuDivider, RichTextEditor,
  type RichTextEditorRef,
} from 'mui-tiptap';
import { useMemo, useRef, type Ref, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentUrl, uploadFile } from '#client/hooks/upload.ts';
import { imageSx, richTextExtensions } from './richText.ts';

export type RichEditorHandle = {
  getHtml: () => string;
  setHtml: (html: string) => void;
  isEmpty: () => boolean;
  focus: () => void;
};

/**
 * mui-tiptap editor for comments and the context. Images (button, paste,
 * drop) are uploaded and shown inline; other dropped or pasted files go to
 * `onFiles` — the caller attaches them.
 */
export default function (p: {
  handle: Ref<RichEditorHandle>;
  initial: string;
  placeholder: string;
  onFiles?: (files: File[]) => void;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  /** Every change, as HTML ('' when empty): for drafts. */
  onChange?: (html: string) => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const rte = useRef<RichTextEditorRef>(null);
  const extensions = useMemo(() => richTextExtensions(p.placeholder), [p.placeholder]);
  const submit = useRef(p.onSubmit);
  submit.current = p.onSubmit;
  const onFiles = useRef(p.onFiles);
  onFiles.current = p.onFiles;
  const onChange = useRef(p.onChange);
  onChange.current = p.onChange;

  useImperativeHandle(p.handle, () => ({
    getHtml: () => rte.current?.editor?.getHTML() ?? '',
    setHtml: (html) => rte.current?.editor?.commands.setContent(html),
    isEmpty: () => rte.current?.editor?.isEmpty ?? true,
    focus: () => rte.current?.editor?.commands.focus('end'),
  }));

  const uploadImages = async (files: File[]) =>
    Promise.all(files.map(async (file) => ({ src: attachmentUrl(await uploadFile(file)), alt: file.name })));

  // Images go into the text, everything else to the caller as attachments.
  const takeFiles = (files: File[], position?: number): boolean => {
    if (files.length === 0) return false;
    const images = files.filter((f) => f.type.startsWith('image/') && f.type !== 'image/svg+xml');
    const others = files.filter((f) => !images.includes(f));
    if (others.length > 0) onFiles.current?.(others);
    if (images.length > 0) {
      void uploadImages(images).then((uploaded) =>
        insertImages({ images: uploaded, editor: rte.current?.editor ?? null, position }));
    }
    return true;
  };

  return (
    <RichTextEditor
      ref={rte}
      extensions={extensions}
      content={p.initial}
      autofocus={p.autoFocus ? 'end' : false}
      immediatelyRender
      onUpdate={({ editor }) => onChange.current?.(editor.isEmpty ? '' : editor.getHTML())}
      editorProps={{
        handlePaste: (_view, event) => takeFiles(Array.from(event.clipboardData?.files ?? [])),
        handleDrop: (view, event) => {
          const files = Array.from((event as DragEvent).dataTransfer?.files ?? []);
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          if (files.length > 0) event.preventDefault();
          return takeFiles(files, position);
        },
        handleKeyDown: (_view, event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && submit.current) {
            submit.current();
            return true;
          }
          return false;
        },
      }}
      renderControls={() => (
        <MenuControlsContainer>
          <MenuButtonBold />
          <MenuButtonItalic />
          <MenuButtonStrikethrough />
          <MenuDivider />
          <MenuButtonBulletedList />
          <MenuButtonOrderedList />
          <MenuButtonBlockquote />
          <MenuButtonCode />
          <MenuDivider />
          <MenuButtonImageUpload tooltipLabel={t('task.composer.addImage')} onUploadFiles={uploadImages} />
        </MenuControlsContainer>
      )}
      RichTextFieldProps={{ variant: 'outlined' }}
      sx={{ '& .ProseMirror': { minHeight: 64, ...imageSx } }}
    />
  );
}
