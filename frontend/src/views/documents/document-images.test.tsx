import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LETTER_FORMAT, heading, letter, paragraph, text } from '../../test-support/letterDocument';
import { LetterEditor } from './LetterEditor';
import { PAGE_SIZES, uniformMargins } from './letterhead-geometry';
import type { LetterDocument } from '../../api/documents.api';
import { DocumentAssetLibraryModal } from './DocumentAssetLibraryModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Document Images & Signatures Frontend', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders toolbar with Insert Image and Insert Signature buttons', async () => {
    const doc: LetterDocument = letter(
      paragraph(text('Offer of employment for candidate.')),
    );

    await act(async () => {
      root.render(
        <LetterEditor
          document={doc}
          format={LETTER_FORMAT}
          editable={true}
          table="OFFER_LETTER"
          page={PAGE_SIZES.A4}
          margins={uniformMargins(20)}
          letterhead={null}
          letterheadImages={{}}
          elementImages={{}}
          showPageNumbers={true}
          zoom={1}
          zoomControls={<button type="button">100%</button>}
          onReady={() => undefined}
          onChange={() => undefined}
        />
      );
    });

    const insertImageBtn = container.querySelector('button[title*="Insert Image"]');
    const insertSigBtn = container.querySelector('button[title*="Insert Signature"]');

    expect(insertImageBtn).not.toBeNull();
    expect(insertSigBtn).not.toBeNull();
  });

  it('opens DocumentAssetLibraryModal when Insert Signature is clicked', async () => {
    const doc: LetterDocument = letter(
      paragraph(text('Sincerely,')),
    );

    await act(async () => {
      root.render(
        <LetterEditor
          document={doc}
          format={LETTER_FORMAT}
          editable={true}
          table="OFFER_LETTER"
          page={PAGE_SIZES.A4}
          margins={uniformMargins(20)}
          letterhead={null}
          letterheadImages={{}}
          elementImages={{}}
          showPageNumbers={true}
          zoom={1}
          zoomControls={<button type="button">100%</button>}
          onReady={() => undefined}
          onChange={() => undefined}
        />
      );
    });

    const insertSigBtn = container.querySelector('button[title*="Insert Signature"]') as HTMLButtonElement;
    expect(insertSigBtn).not.toBeNull();

    await act(async () => {
      insertSigBtn.click();
    });

    const modalTitle = document.body.textContent;
    expect(modalTitle).toContain('Insert Authorized Signature');
  });

  it('renders DocumentAssetLibraryModal with category filters and upload controls', async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    await act(async () => {
      root.render(
        <DocumentAssetLibraryModal
          isOpen={true}
          onClose={onClose}
          onSelect={onSelect}
          initialCategory="ALL"
          isSignatureOnly={false}
        />
      );
    });

    expect(document.body.textContent).toContain('Document Image & Signature Library');
    expect(document.body.textContent).toContain('Signatures');
    expect(document.body.textContent).toContain('Stamps & Seals');
    expect(document.body.textContent).toContain('Company Logos');
    expect(document.body.textContent).toContain('Browse File');
  });

  it('renders free-positioned images inside the letter document', async () => {
    const docWithImage: LetterDocument = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'For RnD Technosoft' }],
        },
        {
          type: 'documentImage',
          attrs: {
            id: 'sig-test-1',
            src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            category: 'AUTHORIZED_SIGNATURE',
            widthMm: 45,
            heightMm: 20,
            aspectRatio: 2.25,
            lockAspectRatio: true,
            positionMode: 'front',
            page: 1,
            xMm: 30,
            yMm: 150,
            alignment: 'left',
            zIndex: 10,
            isLocked: false,
            opacity: 1,
          },
        },
      ],
    };

    await act(async () => {
      root.render(
        <LetterEditor
          document={docWithImage}
          format={LETTER_FORMAT}
          editable={true}
          table="OFFER_LETTER"
          page={PAGE_SIZES.A4}
          margins={uniformMargins(20)}
          letterhead={null}
          letterheadImages={{}}
          elementImages={{}}
          showPageNumbers={true}
          zoom={1}
          zoomControls={<button type="button">100%</button>}
          onReady={() => undefined}
          onChange={() => undefined}
        />
      );
    });

    const imgWrapper = container.querySelector('.document-image-wrapper') as HTMLElement;
    expect(imgWrapper).not.toBeNull();
    expect(imgWrapper.style.width).toBe('45mm');
    expect(imgWrapper.style.height).toBe('20mm');
    expect(imgWrapper.style.position).toBe('absolute');
    expect(imgWrapper.style.left).toBe('30mm');
    expect(imgWrapper.style.top).toBe('150mm');
  });
});
