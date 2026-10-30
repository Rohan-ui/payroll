import React, { useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, Highlighter, IndentDecrease, IndentIncrease, Italic, List, ListOrdered,
  Redo2, RemoveFormatting, SeparatorHorizontal, Strikethrough, Subscript, Superscript, Table2, Underline, Undo2, X,
  Image as ImageIcon, PenLine,
} from 'lucide-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { DocumentFormat, Letterhead, LetterDocument, PageMargins, DocumentAssetCategory } from '../../api/documents.api';
import { letterCss, letterExtensions, type TableKind } from './letter-document';
import { LetterheadCanvas, PageElements, type CanvasImage } from './LetterheadCanvas';
import { PT, pageFrame, type Page } from './letterhead-geometry';
import { toLayout } from './LetterheadsView';
import { TableToolbar } from './TableToolbar';
import { InsertTableModal } from './InsertTableModal';
import { TablePropertiesModal } from './TablePropertiesModal';
import {
  insertTable,
  insertSalaryStructure,
  getTableSelectionInfo,
} from './table-extension';
import type { DocumentImageAttrs } from './document-image-extension';
import { ImagePropertiesToolbar } from './ImagePropertiesToolbar';
import { DocumentAssetLibraryModal } from './DocumentAssetLibraryModal';

/**
 * The letter as a page: a formatting toolbar over an A4 (or Letter) sheet with
 * the template's margins and letterhead, at a zoom that changes only what is on
 * screen. Text is set in points and spacing in points and millimetres, as the
 * PDF prints it.
 */

const LINE_HEIGHTS = [1, 1.15, 1.3, 1.5, 2, 2.5, 3];
const STYLES = [
  { value: 0, label: 'Normal text' },
  { value: 1, label: 'Heading 1' },
  { value: 2, label: 'Heading 2' },
  { value: 3, label: 'Heading 3' },
  { value: 4, label: 'Subheading' },
];
const BLOCKS = ['paragraph', 'heading'] as const;
const button = 'inline-flex items-center justify-center h-8 min-w-8 px-1.5 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-40 disabled:hover:bg-transparent aria-pressed:bg-teal-50 aria-pressed:text-teal-800 aria-pressed:ring-1 aria-pressed:ring-teal-300 dark:aria-pressed:bg-teal-500/20 dark:aria-pressed:text-teal-200';
const control = 'h-8 rounded-md border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111B] text-xs px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
const icon = 'w-4 h-4';

/** Formats the paragraphs and headings in the selection. */
function setBlock(editor: Editor, attrs: Record<string, unknown>, focus = true) {
  const chain = focus ? editor.chain().focus() : editor.chain();
  BLOCKS.reduce((c, type) => c.updateAttributes(type, attrs), chain).run();
}

/** Sets (or, with null, removes) part of the text style of the selection. */
function setText(editor: Editor, attrs: Record<string, unknown>, focus = false) {
  const chain = focus ? editor.chain().focus() : editor.chain();
  chain.setMark('textStyle', attrs).removeEmptyTextStyle().run();
}

/** A number typed in place: passed on once it is in range, shown as the selection has it otherwise. */
const NumberBox: React.FC<{ label: string; value: number | null; min: number; max: number; step: number; list?: string; disabled: boolean; width: string; onCommit: (n: number) => void }> = ({
  label, value, min, max, step, list, disabled, width, onCommit,
}) => {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setDraft(value === null ? '' : String(value)); }, [value, focused]);
  const valid = (t: string) => t.trim() !== '' && Number.isFinite(Number(t)) && Number(t) >= min && Number(t) <= max;
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      min={min}
      max={max}
      step={step}
      list={list}
      value={draft}
      disabled={disabled}
      aria-invalid={draft !== '' && !valid(draft)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); setDraft(value === null ? '' : String(value)); }}
      onChange={(e) => {
        setDraft(e.target.value);
        if (valid(e.target.value)) onCommit(Number(e.target.value));
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={`${control} ${width} tabular-nums`}
    />
  );
};

const Separator = () => <span aria-hidden="true" className="w-px h-6 bg-slate-200 dark:bg-[#2B293E] mx-0.5" />;

/** The toolbar: it shows the formatting where the cursor is, and changes the selection. */
const tableName = (table: TableKind) => (table === 'QUOTATION' ? 'items table' : 'pay table');

export const LetterToolbar: React.FC<{
  editor: Editor;
  format: DocumentFormat;
  disabled: boolean;
  table: TableKind | null;
  onOpenInsertTable?: () => void;
  onOpenInsertImage?: () => void;
  onOpenInsertSignature?: () => void;
}> = ({ editor, format, disabled, table, onOpenInsertTable, onOpenInsertImage, onOpenInsertSignature }) => {
  const s = format.style;
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const level = [1, 2, 3, 4].find((l) => e.isActive('heading', { level: l })) ?? 0;
      const block = level ? e.getAttributes('heading') : e.getAttributes('paragraph');
      const text = e.getAttributes('textStyle');
      const inList = e.isActive('listItem');
      let hasTable = false;
      e.state.doc.forEach((n) => { if (n.type.name === 'compensationTable') hasTable = true; });
      const heading = level ? s.headings[String(level) as '1'] : null;
      const spacing = heading ?? (inList ? s.listParagraph : s.paragraph);
      return {
        level,
        align: (block.textAlign as string | null) ?? 'left',
        lineHeight: (block.lineHeight as number | null) ?? (heading ? s.headingLineHeight : s.lineHeight),
        spaceBefore: (block.spaceBefore as number | null) ?? spacing.spaceBefore,
        spaceAfter: (block.spaceAfter as number | null) ?? spacing.spaceAfter,
        indent: (block.indent as number | null) ?? 0,
        fontFamily: (text.fontFamily as string | null) ?? '',
        fontSize: (text.fontSize as number | null) ?? heading?.fontSize ?? s.fontSize,
        color: (text.color as string | null) ?? heading?.color ?? s.color,
        highlight: (text.backgroundColor as string | null) ?? null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        superscript: e.isActive('superscript'),
        subscript: e.isActive('subscript'),
        bulletList: e.isActive('bulletList'),
        orderedList: e.isActive('orderedList'),
        inList,
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        hasTable,
      };
    },
  });
  if (!state) return null;
  const run = (fn: (e: Editor) => void) => () => fn(editor);
  const toggle = (label: string, active: boolean, Icon: React.ComponentType<{ className?: string }>, action: () => void, shortcut?: string) => (
    <button type="button" aria-label={label} title={shortcut ? `${label} (${shortcut})` : label} aria-pressed={active} disabled={disabled} onClick={action} className={button}>
      <Icon className={icon} aria-hidden="true" />
    </button>
  );
  const plain = (label: string, Icon: React.ComponentType<{ className?: string }>, action: () => void, off = false) => (
    <button type="button" aria-label={label} title={label} disabled={disabled || off} onClick={action} className={button}>
      <Icon className={icon} aria-hidden="true" />
    </button>
  );
  const indent = (by: number) => () => {
    if (state.inList) {
      if (by > 0) editor.chain().focus().sinkListItem('listItem').run();
      else editor.chain().focus().liftListItem('listItem').run();
    } else {
      setBlock(editor, { indent: Math.min(80, Math.max(0, state.indent + by)) || null });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
      <div role="group" aria-label="History" className="flex items-center">
        {plain('Undo', Undo2, run((e) => e.chain().focus().undo().run()), !state.canUndo)}
        {plain('Redo', Redo2, run((e) => e.chain().focus().redo().run()), !state.canRedo)}
      </div>
      <Separator />
      <div role="group" aria-label="Paragraph style and font" className="flex items-center gap-1">
        <select
          aria-label="Paragraph style"
          value={state.level}
          disabled={disabled}
          onChange={(e) => {
            const level = Number(e.target.value);
            if (level) editor.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 }).run();
            else editor.chain().focus().setParagraph().run();
          }}
          className={`${control} w-28`}
        >
          {STYLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select aria-label="Font" value={state.fontFamily} disabled={disabled} onChange={(e) => setText(editor, { fontFamily: e.target.value || null }, true)} className={`${control} w-36`}>
          <option value="">{`Default (${format.fonts.find((f) => f.key === s.fontFamily)?.label ?? 'Helvetica'})`}</option>
          {format.fonts.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <NumberBox label="Font size (pt)" value={state.fontSize} min={format.fontSizes.min} max={format.fontSizes.max} step={0.5} list="letter-font-sizes" disabled={disabled} width="w-16" onCommit={(n) => setText(editor, { fontSize: n })} />
        <datalist id="letter-font-sizes">{format.fontSizes.presets.map((n) => <option key={n} value={n} />)}</datalist>
      </div>
      <Separator />
      <div role="group" aria-label="Text formatting" className="flex items-center">
        {toggle('Bold', state.bold, Bold, run((e) => e.chain().focus().toggleBold().run()), 'Ctrl+B')}
        {toggle('Italic', state.italic, Italic, run((e) => e.chain().focus().toggleItalic().run()), 'Ctrl+I')}
        {toggle('Underline', state.underline, Underline, run((e) => e.chain().focus().toggleUnderline().run()), 'Ctrl+U')}
        {toggle('Strikethrough', state.strike, Strikethrough, run((e) => e.chain().focus().toggleStrike().run()))}
        {toggle('Superscript', state.superscript, Superscript, run((e) => e.chain().focus().toggleSuperscript().run()))}
        {toggle('Subscript', state.subscript, Subscript, run((e) => e.chain().focus().toggleSubscript().run()))}
      </div>
      <Separator />
      <div role="group" aria-label="Colour" className="flex items-center gap-0.5">
        <label className={`${button} relative cursor-pointer`} title="Text colour">
          <Baseline className={icon} aria-hidden="true" style={{ color: state.color }} />
          <input type="color" aria-label="Text colour" value={state.color} disabled={disabled} onChange={(e) => setText(editor, { color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        <label className={`${button} relative cursor-pointer`} title="Highlight colour">
          <Highlighter className={icon} aria-hidden="true" style={{ color: state.highlight ?? undefined }} />
          <input type="color" aria-label="Highlight colour" value={state.highlight ?? '#fff59d'} disabled={disabled} onChange={(e) => setText(editor, { backgroundColor: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
        </label>
        {state.highlight && plain('Remove highlight', X, () => setText(editor, { backgroundColor: null }, true))}
      </div>
      <Separator />
      <div role="group" aria-label="Alignment" className="flex items-center">
        {toggle('Align left', state.align === 'left', AlignLeft, () => setBlock(editor, { textAlign: null }))}
        {toggle('Centre', state.align === 'center', AlignCenter, () => setBlock(editor, { textAlign: 'center' }))}
        {toggle('Align right', state.align === 'right', AlignRight, () => setBlock(editor, { textAlign: 'right' }))}
        {toggle('Justify', state.align === 'justify', AlignJustify, () => setBlock(editor, { textAlign: 'justify' }))}
      </div>
      <Separator />
      <div role="group" aria-label="Spacing" className="flex items-center gap-1">
        <select aria-label="Line height" title="Line height" value={String(state.lineHeight)} disabled={disabled} onChange={(e) => setBlock(editor, { lineHeight: Number(e.target.value) })} className={`${control} w-16`}>
          {[...new Set([...LINE_HEIGHTS, state.lineHeight])].sort((a, b) => a - b).map((n) => <option key={n} value={String(n)}>{n}</option>)}
        </select>
        <NumberBox label="Space before paragraph (pt)" value={state.spaceBefore} min={0} max={72} step={1} disabled={disabled} width="w-14" onCommit={(n) => setBlock(editor, { spaceBefore: n }, false)} />
        <NumberBox label="Space after paragraph (pt)" value={state.spaceAfter} min={0} max={72} step={1} disabled={disabled} width="w-14" onCommit={(n) => setBlock(editor, { spaceAfter: n }, false)} />
      </div>
      <Separator />
      <div role="group" aria-label="Lists and indent" className="flex items-center">
        {toggle('Bulleted list', state.bulletList, List, run((e) => e.chain().focus().toggleBulletList().run()))}
        {toggle('Numbered list', state.orderedList, ListOrdered, run((e) => e.chain().focus().toggleOrderedList().run()))}
        {plain('Decrease indent', IndentDecrease, indent(-10), !state.inList && state.indent <= 0)}
        {plain('Increase indent', IndentIncrease, indent(10))}
      </div>
      <Separator />
      <div role="group" aria-label="Insert" className="flex items-center">
        {plain('Insert divider', SeparatorHorizontal, run((e) => e.chain().focus().setHorizontalRule().run()))}
        {onOpenInsertTable && plain('Insert Table', Table2, onOpenInsertTable)}
        {onOpenInsertImage && plain('Insert Image', ImageIcon, onOpenInsertImage)}
        {onOpenInsertSignature && plain('Insert Signature', PenLine, onOpenInsertSignature)}
        {table && plain(state.hasTable ? `The ${tableName(table)} is already in the document` : `Insert ${tableName(table)}`, Table2, run((e) => e.chain().focus().insertContentAt(e.state.selection.$from.after(1), { type: 'compensationTable' }).run()), state.hasTable)}
        {plain('Clear formatting', RemoveFormatting, () => {
          editor.chain().focus().unsetAllMarks().run();
          setBlock(editor, { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null });
        })}
      </div>
    </div>
  );
};

/** The sheet: page size and margins in millimetres, the letterhead drawn as it prints, the letter in between. */
const LetterPage: React.FC<{
  page: Page;
  margins: PageMargins;
  letterhead: Letterhead | null;
  images: Partial<Record<'logo' | 'header' | 'footer', CanvasImage>>;
  /** Images of the letterhead's page elements, by image id. */
  elementImages: Record<string, CanvasImage>;
  showPageNumbers: boolean;
  children: React.ReactNode;
}> = ({ page, margins, letterhead, images, elementImages, showPageNumbers, children }) => {
  // Where the PDF's text starts and stops: inside the margins, 12 pt below the header and 8 pt above the footer.
  const { header, footer, body } = pageFrame(page, margins, letterhead && toLayout(letterhead));
  const bodyMm = Math.max(1, body.height);
  // Page numbers sit below the footer (or the text), or just above the footer when there is no room below it.
  const below = footer ? page.height - footer.top - footer.height : margins.bottom;
  const numberBottom = below >= 10 * PT ? Math.max(1, (below - 3) / 2) : (footer ? page.height - footer.top : below) + 1;
  const canvas = letterhead && (
    <LetterheadCanvas
      page={page}
      margins={margins}
      zoom={1}
      layout={toLayout(letterhead)}
      details={{ companyName: letterhead.companyName, addressText: letterhead.addressText ?? '', phone: letterhead.phone ?? '', email: letterhead.email ?? '', website: letterhead.website ?? '', registrationText: letterhead.registrationText ?? '', footerText: letterhead.footerText ?? '' }}
      images={images}
      editable={false}
      selected={null}
      onSelect={() => undefined}
      onChange={() => undefined}
      printOnly
    />
  );
  return (
    <div data-letter-page className="letter-page relative bg-white shadow-md ring-1 ring-slate-300" style={{ width: `${page.width}mm`, minHeight: `${page.height}mm` }}>
      {/* Watermarks behind the text, as on the first page of the PDF (which repeats them on every page). */}
      {letterhead && <PageElements elements={letterhead.elements} images={elementImages} page={page} zoom={1} layer="behind" />}
      {canvas && (
        <>
          <div aria-hidden="true" className="absolute inset-x-0 top-0 overflow-hidden pointer-events-none" style={{ height: `${(header?.top ?? 0) + (header?.height ?? 0) + 2}mm` }}>{canvas}</div>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 overflow-hidden pointer-events-none" style={{ height: `${page.height - (footer?.top ?? page.height)}mm` }}>
            <div className="absolute left-0 bottom-0">{canvas}</div>
          </div>
        </>
      )}
      <div
        className="relative"
        style={{
          paddingTop: `${body.top}mm`,
          paddingBottom: `${page.height - body.top - body.height}mm`,
          paddingLeft: `${body.left}mm`,
          paddingRight: `${page.width - body.left - body.width}mm`,
          // Faint lines where pages break, roughly; the PDF preview shows the exact pages.
          backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent calc(${bodyMm}mm - 1px), #cbd5e1 calc(${bodyMm}mm - 1px), #cbd5e1 ${bodyMm}mm)`,
          backgroundOrigin: 'content-box',
          backgroundClip: 'content-box',
        }}
      >
        {children}
      </div>
      {/* Watermarks in front of the text: shown, but never in the way of typing or selecting. */}
      {letterhead && <PageElements elements={letterhead.elements} images={elementImages} page={page} zoom={1} layer="front" />}
      {showPageNumbers && (
        <span aria-hidden="true" className="absolute text-[8pt] text-[#555555]" style={{ right: `${margins.right}mm`, bottom: `${numberBottom}mm`, fontFamily: 'Helvetica, Arial, sans-serif' }}>Page 1</span>
      )}
    </div>
  );
};

/** The editor for one version's document. Mount it again (a new key) to load a different version. */
export const LetterEditor: React.FC<{
  document: LetterDocument;
  format: DocumentFormat;
  editable: boolean;
  /** The table this kind of document has, if any. */
  table: TableKind | null;
  page: Page;
  margins: PageMargins;
  letterhead: Letterhead | null;
  letterheadImages: Partial<Record<'logo' | 'header' | 'footer', CanvasImage>>;
  elementImages: Record<string, CanvasImage>;
  showPageNumbers: boolean;
  zoom: number;
  stageRef?: React.Ref<HTMLDivElement>;
  zoomControls: React.ReactNode;
  onReady: (editor: Editor, document: LetterDocument) => void;
  onChange: (document: LetterDocument) => void;
}> = ({ document, format, editable, table, page, margins, letterhead, letterheadImages, elementImages, showPageNumbers, zoom, stageRef, zoomControls, onReady, onChange }) => {
  const extensions = useMemo(() => letterExtensions(format, table), [format, table]);
  const editor = useEditor({
    extensions,
    content: document,
    editable,
    editorProps: { attributes: { 'aria-label': 'Letter', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true' } },
    onCreate: ({ editor: e }) => onReady(e, e.getJSON() as LetterDocument),
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as LetterDocument),
  });
  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);
  const css = useMemo(() => letterCss('.letter-page', format), [format]);

  const [isInsertTableOpen, setIsInsertTableOpen] = useState(false);
  const [isTablePropertiesOpen, setIsTablePropertiesOpen] = useState(false);
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [isSignatureOnly, setIsSignatureOnly] = useState(false);
  const [isReplacingImage, setIsReplacingImage] = useState(false);

  const tableInfo = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? getTableSelectionInfo(e.state) : null),
  });

  const selectedImageAttrs = useEditorState({
    editor,
    selector: ({ editor: e }): DocumentImageAttrs | null => {
      if (!e) return null;
      const { selection } = e.state;
      if (selection instanceof NodeSelection && selection.node.type.name === 'documentImage') {
        return selection.node.attrs as DocumentImageAttrs;
      }
      return null;
    },
  });

  const handleAssetSelected = (asset: {
    src: string;
    assetId: string;
    name: string;
    category: DocumentAssetCategory;
    widthPx: number;
    heightPx: number;
  }) => {
    if (!editor) return;

    if (isReplacingImage && selectedImageAttrs) {
      editor.commands.updateAttributes('documentImage', {
        src: asset.src,
        assetId: asset.assetId,
        category: asset.category,
      });
      setIsReplacingImage(false);
      return;
    }

    const defaultW =
      asset.category === 'AUTHORIZED_SIGNATURE'
        ? 45
        : asset.category === 'STAMP_SEAL'
        ? 35
        : asset.category === 'COMPANY_LOGO'
        ? 50
        : 60;
    const ratio =
      asset.widthPx && asset.heightPx
        ? Math.round((asset.widthPx / asset.heightPx) * 1000) / 1000
        : 2.25;
    const defaultH = Math.round((defaultW / ratio) * 10) / 10;

    editor.commands.insertDocumentImage({
      src: asset.src,
      assetId: asset.assetId,
      alt: asset.name,
      category: asset.category,
      widthMm: defaultW,
      heightMm: defaultH,
      aspectRatio: ratio,
      positionMode: 'front',
      page: 1,
      xMm: 25,
      yMm: 50,
      alignment: 'left',
      zIndex: 10,
      isLocked: false,
      opacity: 1,
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#181724] min-w-0">
      <style>{css}</style>
      {/* Sticks flush with the top of the scrolling page: the offsets cancel main's padding (p-4 sm:p-6 lg:p-8 in App), which a sticky element otherwise stays below. */}
      <div className="sticky -top-4 sm:-top-6 lg:-top-8 z-20 flex flex-col border-b border-slate-200 dark:border-[#2B293E] bg-white/95 dark:bg-[#181724]/95 backdrop-blur rounded-t-2xl">
        <div className="flex flex-wrap items-center justify-between gap-1">
          {editor && editable ? (
            <LetterToolbar
              editor={editor}
              format={format}
              disabled={!editable}
              table={table}
              onOpenInsertTable={() => setIsInsertTableOpen(true)}
              onOpenInsertImage={() => {
                setIsSignatureOnly(false);
                setIsReplacingImage(false);
                setIsAssetModalOpen(true);
              }}
              onOpenInsertSignature={() => {
                setIsSignatureOnly(true);
                setIsReplacingImage(false);
                setIsAssetModalOpen(true);
              }}
            />
          ) : (
            <p className="px-3 py-2.5 text-xs text-slate-500">Read only</p>
          )}
          <div className="px-2 py-1.5">{zoomControls}</div>
        </div>
        {editor && editable && tableInfo?.isInTable && (
          <TableToolbar
            editor={editor}
            onOpenProperties={() => setIsTablePropertiesOpen(true)}
          />
        )}
        {editor && editable && selectedImageAttrs && (
          <ImagePropertiesToolbar
            editor={editor}
            imageAttrs={selectedImageAttrs}
            onOpenReplaceModal={() => {
              setIsReplacingImage(true);
              setIsSignatureOnly(selectedImageAttrs.category === 'AUTHORIZED_SIGNATURE');
              setIsAssetModalOpen(true);
            }}
          />
        )}
      </div>
      <div ref={stageRef} className="overflow-x-auto bg-slate-100 dark:bg-[#12111B] p-4 sm:p-6 rounded-b-2xl">
        <div className="mx-auto w-fit" style={{ zoom }}>
          <LetterPage page={page} margins={margins} letterhead={letterhead} images={letterheadImages} elementImages={elementImages} showPageNumbers={showPageNumbers}>
            <EditorContent editor={editor} />
          </LetterPage>
        </div>
      </div>
      <p className="px-4 py-2 text-xs text-slate-500 border-t border-slate-200 dark:border-[#2B293E]">
        Faint lines mark roughly where pages break. Preview PDF shows the exact pages.
      </p>

      {editor && (
        <>
          <InsertTableModal
            isOpen={isInsertTableOpen}
            onClose={() => setIsInsertTableOpen(false)}
            onInsertTable={(rows, cols, withHeader) => insertTable(editor, rows, cols, withHeader)}
            onInsertSalaryStructure={() => insertSalaryStructure(editor)}
          />
          <TablePropertiesModal
            editor={editor}
            isOpen={isTablePropertiesOpen}
            onClose={() => setIsTablePropertiesOpen(false)}
            cellAttrs={tableInfo?.cellAttrs ?? null}
            rowCount={tableInfo?.rowCount ?? 0}
            colCount={tableInfo?.colCount ?? 0}
          />
          <DocumentAssetLibraryModal
            isOpen={isAssetModalOpen}
            onClose={() => {
              setIsAssetModalOpen(false);
              setIsReplacingImage(false);
            }}
            onSelect={handleAssetSelected}
            isSignatureOnly={isSignatureOnly}
            initialCategory={isSignatureOnly ? 'AUTHORIZED_SIGNATURE' : 'ALL'}
          />
        </>
      )}
    </div>
  );
};
