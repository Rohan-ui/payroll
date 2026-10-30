import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { DocumentImageView } from './DocumentImageView';

export type PositionMode = 'inline' | 'square' | 'topBottom' | 'behind' | 'front';
export type ImageCategory = 'COMPANY_LOGO' | 'AUTHORIZED_SIGNATURE' | 'STAMP_SEAL' | 'OTHER';
export type ImageAlignment = 'left' | 'center' | 'right' | 'custom';

export interface DocumentImageAttrs {
  id: string;
  src: string;
  assetId?: string | null;
  alt?: string;
  category: ImageCategory;
  widthMm: number;
  heightMm: number;
  aspectRatio: number;
  lockAspectRatio: boolean;
  positionMode: PositionMode;
  page: number;
  xMm: number;
  yMm: number;
  alignment: ImageAlignment;
  zIndex: number;
  isLocked: boolean;
  opacity: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    documentImage: {
      insertDocumentImage: (attrs: Partial<DocumentImageAttrs> & { src: string }) => ReturnType;
      updateDocumentImage: (attrs: Partial<DocumentImageAttrs>) => ReturnType;
    };
  }
}

export const DocumentImageExtension = Node.create({
  name: 'documentImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-id') || crypto.randomUUID(),
        renderHTML: (a) => ({ 'data-id': a.id }),
      },
      src: {
        default: '',
        parseHTML: (el) => el.getAttribute('src') || el.getAttribute('data-src') || '',
        renderHTML: (a) => ({ src: a.src }),
      },
      assetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-asset-id') || null,
        renderHTML: (a) => (a.assetId ? { 'data-asset-id': a.assetId } : {}),
      },
      alt: {
        default: '',
        parseHTML: (el) => el.getAttribute('alt') || '',
        renderHTML: (a) => ({ alt: a.alt || '' }),
      },
      category: {
        default: 'OTHER',
        parseHTML: (el) => el.getAttribute('data-category') || 'OTHER',
        renderHTML: (a) => ({ 'data-category': a.category }),
      },
      widthMm: {
        default: 45,
        parseHTML: (el) => {
          const v = el.getAttribute('data-width-mm');
          return v ? parseFloat(v) : 45;
        },
        renderHTML: (a) => ({ 'data-width-mm': String(a.widthMm) }),
      },
      heightMm: {
        default: 20,
        parseHTML: (el) => {
          const v = el.getAttribute('data-height-mm');
          return v ? parseFloat(v) : 20;
        },
        renderHTML: (a) => ({ 'data-height-mm': String(a.heightMm) }),
      },
      aspectRatio: {
        default: 2.25,
        parseHTML: (el) => {
          const v = el.getAttribute('data-aspect-ratio');
          return v ? parseFloat(v) : 2.25;
        },
        renderHTML: (a) => ({ 'data-aspect-ratio': String(a.aspectRatio) }),
      },
      lockAspectRatio: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-lock-aspect-ratio') !== 'false',
        renderHTML: (a) => ({ 'data-lock-aspect-ratio': String(a.lockAspectRatio) }),
      },
      positionMode: {
        default: 'front',
        parseHTML: (el) => (el.getAttribute('data-position-mode') as PositionMode) || 'front',
        renderHTML: (a) => ({ 'data-position-mode': a.positionMode }),
      },
      page: {
        default: 1,
        parseHTML: (el) => {
          const v = el.getAttribute('data-page');
          return v ? parseInt(v, 10) : 1;
        },
        renderHTML: (a) => ({ 'data-page': String(a.page) }),
      },
      xMm: {
        default: 20,
        parseHTML: (el) => {
          const v = el.getAttribute('data-x-mm');
          return v ? parseFloat(v) : 20;
        },
        renderHTML: (a) => ({ 'data-x-mm': String(a.xMm) }),
      },
      yMm: {
        default: 20,
        parseHTML: (el) => {
          const v = el.getAttribute('data-y-mm');
          return v ? parseFloat(v) : 20;
        },
        renderHTML: (a) => ({ 'data-y-mm': String(a.yMm) }),
      },
      alignment: {
        default: 'left',
        parseHTML: (el) => (el.getAttribute('data-alignment') as ImageAlignment) || 'left',
        renderHTML: (a) => ({ 'data-alignment': a.alignment }),
      },
      zIndex: {
        default: 10,
        parseHTML: (el) => {
          const v = el.getAttribute('data-z-index');
          return v ? parseInt(v, 10) : 10;
        },
        renderHTML: (a) => ({ 'data-z-index': String(a.zIndex) }),
      },
      isLocked: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-is-locked') === 'true',
        renderHTML: (a) => ({ 'data-is-locked': String(a.isLocked) }),
      },
      opacity: {
        default: 1,
        parseHTML: (el) => {
          const v = el.getAttribute('data-opacity');
          return v ? parseFloat(v) : 1;
        },
        renderHTML: (a) => ({ 'data-opacity': String(a.opacity) }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-document-image]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-document-image': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentImageView);
  },

  addCommands() {
    return {
      insertDocumentImage:
        (attrs) =>
        ({ commands, state }) => {
          const id = attrs.id || crypto.randomUUID();
          const widthMm = attrs.widthMm ?? 45;
          const heightMm = attrs.heightMm ?? 20;
          const aspectRatio = attrs.aspectRatio ?? Math.round((widthMm / heightMm) * 1000) / 1000;
          const posMode = attrs.positionMode ?? 'front';
          const nodeAttrs: DocumentImageAttrs = {
            id,
            src: attrs.src,
            assetId: attrs.assetId || null,
            alt: attrs.alt || '',
            category: attrs.category || 'OTHER',
            widthMm,
            heightMm,
            aspectRatio,
            lockAspectRatio: attrs.lockAspectRatio ?? true,
            positionMode: posMode,
            page: attrs.page ?? 1,
            xMm: attrs.xMm ?? 20,
            yMm: attrs.yMm ?? 40,
            alignment: attrs.alignment ?? 'left',
            zIndex: attrs.zIndex ?? 10,
            isLocked: attrs.isLocked ?? false,
            opacity: attrs.opacity ?? 1,
          };

          return commands.insertContent({
            type: this.name,
            attrs: nodeAttrs,
          });
        },
      updateDocumentImage:
        (attrs) =>
        ({ commands }) => {
          return commands.updateAttributes(this.name, attrs);
        },
    };
  },
});
