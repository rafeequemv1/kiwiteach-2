import '../../types';
import React, { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import './blogEditor.css';

export type BlogEditorApi = {
  getSelectedText: () => string;
  replaceSelectionWithHtml: (html: string) => void;
};

interface BlogRichEditorProps {
  content: string;
  onChange: (html: string) => void;
  onEditorReady?: (api: BlogEditorApi) => void;
  disabled?: boolean;
}

export default function BlogRichEditor({ content, onChange, onEditorReady, disabled }: BlogRichEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const onUploadRef = useRef<(file: File) => Promise<void>>(async () => {});

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Write the article… Use headings for GEO-friendly structure.' }),
    ],
    content,
    editable: !disabled,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  useEffect(() => {
    if (!editor) return;
    const cur = editor.getHTML();
    if (content !== cur) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  useEffect(() => {
    if (!editor || !onEditorReady) return;
    onEditorReady({
      getSelectedText: () => {
        const { from, to, empty } = editor.state.selection;
        if (empty) return '';
        return editor.state.doc.textBetween(from, to, '\n\n');
      },
      replaceSelectionWithHtml: (html: string) => {
        editor.chain().focus().deleteSelection().insertContent(html).run();
      },
    });
  }, [editor, onEditorReady]);

  useEffect(() => {
    onUploadRef.current = async (file: File) => {
      const { uploadBlogImage } = await import('./blogImageUpload');
      const url = await uploadBlogImage(file);
      editor?.chain().focus().setImage({ src: url, alt: '' }).run();
    };
  }, [editor]);

  if (!editor) {
    return <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-8 text-sm text-zinc-500">Loading editor…</div>;
  }

  const addLink = () => {
    const prev = editor.getAttributes('link').href;
    const url = window.prompt('Link URL', prev || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="blog-editor-root rounded-lg border border-zinc-200 bg-white overflow-hidden">
      <div className="flex flex-wrap gap-1 border-b border-zinc-200 bg-zinc-50/90 px-2 py-1.5">
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${editor.isActive('bold') ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}
        >
          B
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`rounded px-2 py-1 text-xs font-semibold italic ${editor.isActive('italic') ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}
        >
          I
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${editor.isActive('heading', { level: 2 }) ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}
        >
          H2
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${editor.isActive('heading', { level: 3 }) ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}
        >
          H3
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`rounded px-2 py-1 text-xs font-semibold ${editor.isActive('bulletList') ? 'bg-zinc-900 text-white' : 'text-zinc-700 hover:bg-zinc-200'}`}
        >
          List
        </button>
        <button type="button" disabled={disabled} onClick={addLink} className="rounded px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200">
          Link
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="rounded px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
        >
          Image
        </button>
      </div>
      <EditorContent editor={editor} className="max-h-[min(70vh,640px)] overflow-y-auto" />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            await onUploadRef.current(f);
          } catch (err: unknown) {
            alert(err instanceof Error ? err.message : 'Image upload failed');
          }
        }}
      />
    </div>
  );
}
