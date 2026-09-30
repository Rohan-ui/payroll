import { documentStage, requestState, safeFilename, sniffFileKind } from './candidate-documents';

describe('candidate documents', () => {
  it('knows a file by its first bytes, not its name', () => {
    expect(sniffFileKind(Buffer.from('%PDF-1.7\n...'))).toEqual({ contentType: 'application/pdf', extension: 'pdf' });
    expect(sniffFileKind(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toEqual({ contentType: 'image/jpeg', extension: 'jpg' });
    expect(sniffFileKind(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toEqual({ contentType: 'image/png', extension: 'png' });
    expect(sniffFileKind(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffFileKind(Buffer.from('%PD'))).toBeNull();
    expect(sniffFileKind(Buffer.alloc(0))).toBeNull();
  });

  it('keeps file names safe and gives them the real extension', () => {
    expect(safeFilename('C:\\Users\\me\\pan card.PDF', 'pdf', 'x')).toBe('pan card.pdf');
    expect(safeFilename('../../etc/passwd', 'png', 'x')).toBe('passwd.png');
    expect(safeFilename('a"b<c>.exe', 'jpg', 'x')).toBe('abc.jpg');
    expect(safeFilename('', 'pdf', 'Resume')).toBe('Resume.pdf');
    expect(safeFilename(undefined, 'pdf', 'Resume')).toBe('Resume.pdf');
    expect(safeFilename('x'.repeat(400), 'pdf', 'y')).toHaveLength(154);
  });

  it('takes a request’s state from its live upload, else its last one', () => {
    expect(requestState([])).toBe('MISSING');
    expect(requestState([{ version_number: 1, review_status: 'REJECTED' }])).toBe('REJECTED');
    expect(requestState([{ version_number: 1, review_status: 'REJECTED' }, { version_number: 2, review_status: 'PENDING_REVIEW' }])).toBe('PENDING_REVIEW');
    expect(requestState([{ version_number: 1, review_status: 'SUPERSEDED' }, { version_number: 2, review_status: 'VERIFIED' }])).toBe('VERIFIED');
  });

  it('moves the candidate by their required documents only', () => {
    expect(documentStage([])).toBeNull();
    expect(documentStage([{ isRequired: true, state: 'MISSING' }, { isRequired: true, state: 'VERIFIED' }])).toBe('DOCUMENT_COLLECTION');
    expect(documentStage([{ isRequired: true, state: 'REJECTED' }])).toBe('DOCUMENT_COLLECTION');
    expect(documentStage([{ isRequired: true, state: 'PENDING_REVIEW' }, { isRequired: true, state: 'VERIFIED' }])).toBe('VERIFICATION');
    expect(documentStage([{ isRequired: true, state: 'VERIFIED' }, { isRequired: false, state: 'MISSING' }])).toBe('READY_TO_JOIN');
  });
});
