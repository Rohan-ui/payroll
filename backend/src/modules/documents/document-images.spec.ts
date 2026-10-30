import { jest } from '@jest/globals';
import { parseDocument, fillDocument, DocNode } from './rich-document';
import { DocumentPdfService } from './document-pdf.service';
import { DocumentDocxService } from './document-docx.service';
import { DocumentAssetsService } from './document-assets.service';
import { makePng } from '../../../test/support/png';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PrivateStorageService } from '../../common/storage/private-storage.service';

describe('Document Images & Digital Signatures', () => {
  describe('rich document schema with documentImage nodes', () => {
    it('parses and validates documentImage nodes with positioning attributes', () => {
      const inputDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Please sign below:' }],
          },
          {
            type: 'documentImage',
            attrs: {
              src: '/api/v1/documents/assets/11111111-1111-1111-1111-111111111111/file',
              assetId: '11111111-1111-1111-1111-111111111111',
              category: 'AUTHORIZED_SIGNATURE',
              alt: 'Authorized Signature',
              widthMm: 45,
              heightMm: 20,
              aspectRatio: 2.25,
              lockAspectRatio: true,
              positionMode: 'front',
              page: 1,
              xMm: 30,
              yMm: 180,
              alignment: 'left',
              zIndex: 15,
              isLocked: false,
              opacity: 0.95,
            },
          },
          {
            type: 'documentImage',
            attrs: {
              src: '/api/v1/documents/assets/22222222-2222-2222-2222-222222222222/file',
              assetId: '22222222-2222-2222-2222-222222222222',
              category: 'STAMP_SEAL',
              alt: 'Company Seal',
              widthMm: 35,
              heightMm: 35,
              positionMode: 'behind',
              page: 2,
              xMm: 80,
              yMm: 200,
            },
          },
        ],
      };

      const parsed = parseDocument('OFFER_LETTER', inputDoc);
      expect(parsed.type).toBe('doc');
      expect(parsed.content).toHaveLength(3);

      const sigNode = parsed.content![1];
      expect(sigNode.type).toBe('documentImage');
      expect(sigNode.attrs?.category).toBe('AUTHORIZED_SIGNATURE');
      expect(sigNode.attrs?.widthMm).toBe(45);
      expect(sigNode.attrs?.heightMm).toBe(20);
      expect(sigNode.attrs?.positionMode).toBe('front');
      expect(sigNode.attrs?.page).toBe(1);
      expect(sigNode.attrs?.xMm).toBe(30);
      expect(sigNode.attrs?.yMm).toBe(180);
      expect(sigNode.attrs?.opacity).toBe(0.95);

      const stampNode = parsed.content![2];
      expect(stampNode.type).toBe('documentImage');
      expect(stampNode.attrs?.category).toBe('STAMP_SEAL');
      expect(stampNode.attrs?.positionMode).toBe('behind');
      expect(stampNode.attrs?.page).toBe(2);
      expect(stampNode.attrs?.xMm).toBe(80);
      expect(stampNode.attrs?.yMm).toBe(200);
    });

    it('applies default positioning attributes when unspecified', () => {
      const inputDoc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Offer wording' }],
          },
          {
            type: 'documentImage',
            attrs: {
              src: 'data:image/png;base64,sample',
            },
          },
        ],
      };

      const parsed = parseDocument('OFFER_LETTER', inputDoc);
      const img = parsed.content![1];
      expect(img.attrs?.widthMm).toBe(45);
      expect(img.attrs?.heightMm).toBe(20);
      expect(img.attrs?.page).toBe(1);
      expect(img.attrs?.positionMode).toBe('front');
      expect(img.attrs?.isLocked).toBe(false);
      expect(img.attrs?.opacity).toBe(1);
      expect(img.attrs?.category).toBe('OTHER');
    });

    it('preserves documentImage nodes through fillDocument', () => {
      const doc: DocNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'placeholder', attrs: { key: 'candidate_name' } }],
          },
          {
            type: 'documentImage',
            attrs: {
              id: 'sig-1',
              src: 'test.png',
              widthMm: 45,
              heightMm: 20,
              aspectRatio: 2.25,
              lockAspectRatio: true,
              positionMode: 'front',
              page: 1,
              xMm: 25,
              yMm: 150,
              alignment: 'left',
              zIndex: 10,
              isLocked: true,
              opacity: 1,
            },
          },
        ],
      };

      const filled = fillDocument(doc, { candidate_name: 'Priya Sharma' });
      expect(filled.content).toHaveLength(2);
      expect(filled.content![0].content![0].text).toBe('Priya Sharma');
      expect(filled.content![1].type).toBe('documentImage');
      expect(filled.content![1].attrs?.id).toBe('sig-1');
      expect(filled.content![1].attrs?.xMm).toBe(25);
      expect(filled.content![1].attrs?.yMm).toBe(150);
      expect(filled.content![1].attrs?.isLocked).toBe(true);
    });
  });

  describe('PDF generation with free-position signatures and stamps', () => {
    it('renders multi-page PDF with free-floating transparent signature on page 1 and stamp on page 2', async () => {
      const pdfService = new DocumentPdfService();
      const sigPng = makePng(400, 150);
      const stampPng = makePng(200, 200);

      // Multi-page body so document spans across pages
      const longText = Array.from({ length: 15 }, (_, i) => `Paragraph ${i + 1}: Details of the terms.`).join('\n\n');

      const richDoc: DocNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: longText }],
          },
          {
            type: 'documentImage',
            attrs: {
              src: '/assets/sig.png',
              assetId: 'sig-asset',
              category: 'AUTHORIZED_SIGNATURE',
              widthMm: 50,
              heightMm: 20,
              aspectRatio: 2.5,
              lockAspectRatio: true,
              positionMode: 'front',
              page: 1,
              xMm: 25,
              yMm: 120,
              alignment: 'left',
              zIndex: 20,
              isLocked: false,
              opacity: 1,
            },
          },
          {
            type: 'documentImage',
            attrs: {
              src: '/assets/stamp.png',
              assetId: 'stamp-asset',
              category: 'STAMP_SEAL',
              widthMm: 40,
              heightMm: 40,
              aspectRatio: 1,
              lockAspectRatio: true,
              positionMode: 'behind',
              page: 2,
              xMm: 140,
              yMm: 210,
              alignment: 'right',
              zIndex: 5,
              isLocked: false,
              opacity: 0.85,
            },
          },
        ],
      };

      const pdfBytes = await pdfService.render({
        companyName: 'RnD Technosoft',
        reference: 'OFFER-2026-999',
        dateText: '30 October 2026',
        title: 'Standard Offer Letter',
        body: longText,
        document: richDoc,
        images: {
          '/assets/sig.png': sigPng,
          'sig-asset': sigPng,
          '/assets/stamp.png': stampPng,
          'stamp-asset': stampPng,
        },
      });

      expect(pdfBytes).toBeDefined();
      expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pdfBytes.subarray(-6).toString()).toContain('%%EOF');
      expect(pdfBytes.length).toBeGreaterThan(1000);
    });

    it('renders flow-positioned images (inline, topBottom, square)', async () => {
      const pdfService = new DocumentPdfService();
      const imgPng = makePng(100, 50);

      const richDoc: DocNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Above the inline image.' }],
          },
          {
            type: 'documentImage',
            attrs: {
              src: 'inline.png',
              widthMm: 30,
              heightMm: 15,
              positionMode: 'inline',
              page: 1,
              xMm: 0,
              yMm: 0,
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Below the inline image.' }],
          },
        ],
      };

      const pdfBytes = await pdfService.render({
        companyName: 'RnD Technosoft',
        reference: 'OFFER-FLOW',
        dateText: '30 October 2026',
        title: 'Offer Letter',
        body: 'Above the inline image.\n\nBelow the inline image.',
        document: richDoc,
        images: {
          'inline.png': imgPng,
        },
      });

      expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('DOCX export with embedded images', () => {
    it('generates DOCX containing documentImage nodes', async () => {
      const docxService = new DocumentDocxService();
      const sigPng = makePng(300, 100);

      const richDoc: DocNode = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Candidate Offer Letter' }],
          },
          {
            type: 'documentImage',
            attrs: {
              src: 'sig.png',
              assetId: 'sig-id',
              widthMm: 45,
              heightMm: 20,
              positionMode: 'front',
              page: 1,
              xMm: 25,
              yMm: 100,
            },
          },
        ],
      };

      const docxBuffer = await docxService.render(richDoc, {
        companyName: 'RnD Technosoft',
        title: 'Offer Letter',
        images: {
          'sig.png': sigPng,
          'sig-id': sigPng,
        },
      });

      expect(docxBuffer).toBeDefined();
      expect(Buffer.isBuffer(docxBuffer)).toBe(true);
      expect(docxBuffer.length).toBeGreaterThan(500);
      // PK zip magic header for docx
      expect(docxBuffer[0]).toBe(0x50);
      expect(docxBuffer[1]).toBe(0x4b);
    });
  });

  describe('DocumentAssetsService library and tenant isolation', () => {
    let assetsService: DocumentAssetsService;
    let mockPrisma: any;
    let mockAudit: any;
    let mockStorage: any;
    const mockActor = {
      tenantMemberId: '11111111-1111-1111-1111-111111111111',
      userId: '22222222-2222-2222-2222-222222222222',
      tenantId: '33333333-3333-3333-3333-333333333333',
    } as any;

    beforeEach(() => {
      mockPrisma = {
        rndtechnosoft_document_assets: {
          create: jest.fn(),
          findMany: jest.fn(),
          findFirst: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
      };
      mockAudit = {
        log: (jest.fn() as any).mockResolvedValue(undefined),
      };
      mockStorage = {
        save: (jest.fn() as any).mockResolvedValue({
          key: 'tenants/tenant-1/document-assets/asset-123.png',
          sha256: 'abc123hash',
        }),
        read: (jest.fn() as any).mockResolvedValue(makePng(100, 50)),
      };

      assetsService = new DocumentAssetsService(
        mockPrisma as PrismaService,
        mockAudit as AuditService,
        mockStorage as PrivateStorageService
      );
    });

    it('rejects unsupported file mime types', async () => {
      const badFile = {
        buffer: Buffer.from('%PDF-1.4 not an image'),
        size: 100,
      };

      await expect(
        assetsService.upload('tenant-1', badFile, {
          category: 'AUTHORIZED_SIGNATURE',
          name: 'Signature',
        }, mockActor)
      ).rejects.toThrow('Upload a PNG, JPEG or WebP image.');
    });

    it('rejects files exceeding 5MB', async () => {
      const hugeFile = {
        buffer: Buffer.alloc(6 * 1024 * 1024),
        size: 6 * 1024 * 1024,
      };

      await expect(
        assetsService.upload('tenant-1', hugeFile, {
          category: 'COMPANY_LOGO',
          name: 'Logo',
        }, mockActor)
      ).rejects.toThrow('The image is larger than 5 MB. Upload a smaller copy.');
    });

    it('uploads valid signature PNG, saves to storage, and writes DB record scoped to tenant', async () => {
      const validPng = makePng(300, 100);
      const file = {
        buffer: validPng,
        size: validPng.length,
      };

      mockPrisma.rndtechnosoft_document_assets.create.mockImplementation(({ data }: any) =>
        Promise.resolve({
          id: data.id,
          tenant_id: data.tenant_id,
          asset_name: data.asset_name,
          category: data.category,
          storage_key: data.storage_key,
          file_type: data.file_type,
          file_size: data.file_size,
          width_px: data.width_px,
          height_px: data.height_px,
          created_at: new Date(),
          updated_at: new Date(),
        })
      );

      const result = await assetsService.upload('tenant-1', file, {
        category: 'AUTHORIZED_SIGNATURE',
        name: 'CEO Signature',
      }, mockActor);

      expect(mockStorage.save).toHaveBeenCalledWith(
        'tenant-1',
        'document-assets',
        validPng,
        'png'
      );
      expect(mockPrisma.rndtechnosoft_document_assets.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          category: 'AUTHORIZED_SIGNATURE',
          asset_name: 'CEO Signature',
          file_type: 'image/png',
          created_by_tenant_member_id: mockActor.tenantMemberId,
        }),
      });
      expect(result.name).toBe('CEO Signature');
      expect(mockAudit.log).toHaveBeenCalled();
    });

    it('lists assets filtered strictly by tenant_id and category', async () => {
      mockPrisma.rndtechnosoft_document_assets.findMany.mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          tenant_id: 'tenant-1',
          category: 'AUTHORIZED_SIGNATURE',
          asset_name: 'Sig 1',
          file_type: 'image/png',
          file_size: 1024,
          width_px: 200,
          height_px: 80,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const items = await assetsService.list('tenant-1', 'AUTHORIZED_SIGNATURE');
      expect(mockPrisma.rndtechnosoft_document_assets.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: 'tenant-1',
          category: 'AUTHORIZED_SIGNATURE',
        },
        orderBy: { created_at: 'desc' },
        take: 200,
        include: expect.any(Object),
      });
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('Sig 1');
    });

    it('enforces tenant boundary on delete (prevents deleting cross-tenant assets)', async () => {
      mockPrisma.rndtechnosoft_document_assets.findFirst.mockResolvedValue(null);

      await expect(
        assetsService.delete('tenant-1', '22222222-2222-2222-2222-222222222222', mockActor)
      ).rejects.toThrow('Document asset not found.');

      expect(mockPrisma.rndtechnosoft_document_assets.delete).not.toHaveBeenCalled();
    });

    it('deletes asset when tenant matches', async () => {
      mockPrisma.rndtechnosoft_document_assets.findFirst.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        tenant_id: 'tenant-1',
        asset_name: 'Sig 1',
        category: 'AUTHORIZED_SIGNATURE',
        storage_key: 'tenants/tenant-1/document-assets/asset-1.png',
      });
      mockPrisma.rndtechnosoft_document_assets.delete.mockResolvedValue({});

      const res = await assetsService.delete('tenant-1', '22222222-2222-2222-2222-222222222222', mockActor);
      expect(res.id).toBe('22222222-2222-2222-2222-222222222222');
      expect(mockPrisma.rndtechnosoft_document_assets.delete).toHaveBeenCalledWith({
        where: { id: '22222222-2222-2222-2222-222222222222' },
      });
      expect(mockAudit.log).toHaveBeenCalled();
    });
  });
});
