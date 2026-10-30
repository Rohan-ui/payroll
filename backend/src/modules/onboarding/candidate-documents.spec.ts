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

  it('calculates state for named slots like Aadhaar front and back correctly', () => {
    const slots = ['Front Side', 'Back Side'];
    const opts = { slots, minFiles: 2, maxFiles: 2, requiresFrontBack: true };

    // Nothing uploaded
    expect(requestState([], opts)).toBe('MISSING');

    // Only front uploaded (pending review)
    expect(requestState([{ id: '1', version_number: 1, review_status: 'PENDING_REVIEW', slot_name: 'Front Side' }], opts)).toBe('INCOMPLETE');

    // Only front uploaded and verified (back still missing)
    expect(requestState([{ id: '1', version_number: 1, review_status: 'VERIFIED', slot_name: 'Front Side' }], opts)).toBe('PARTIALLY_VERIFIED');

    // Both uploaded and pending
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'PENDING_REVIEW', slot_name: 'Front Side' },
      { id: '2', version_number: 1, review_status: 'PENDING_REVIEW', slot_name: 'Back Side' },
    ], opts)).toBe('PENDING_REVIEW');

    // Front verified, back pending
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'VERIFIED', slot_name: 'Front Side' },
      { id: '2', version_number: 1, review_status: 'PENDING_REVIEW', slot_name: 'Back Side' },
    ], opts)).toBe('PARTIALLY_VERIFIED');

    // Both verified
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'VERIFIED', slot_name: 'Front Side' },
      { id: '2', version_number: 1, review_status: 'VERIFIED', slot_name: 'Back Side' },
    ], opts)).toBe('VERIFIED');

    // Front verified, back rejected -> REJECTED
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'VERIFIED', slot_name: 'Front Side' },
      { id: '2', version_number: 1, review_status: 'REJECTED', slot_name: 'Back Side' },
    ], opts)).toBe('REJECTED');

    // Back rejected, front replaced with pending review
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'REJECTED', slot_name: 'Front Side' },
      { id: '2', version_number: 2, review_status: 'PENDING_REVIEW', slot_name: 'Front Side', replaced_file_id: '1' },
      { id: '3', version_number: 1, review_status: 'REJECTED', slot_name: 'Back Side' },
    ], opts)).toBe('REJECTED');

    // Both rejected
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'REJECTED', slot_name: 'Front Side' },
      { id: '2', version_number: 1, review_status: 'REJECTED', slot_name: 'Back Side' },
    ], opts)).toBe('REJECTED');
  });

  it('calculates state for generic multi-file documents correctly', () => {
    const opts = { minFiles: 1, maxFiles: 5 };

    // 0 files
    expect(requestState([], opts)).toBe('MISSING');

    // 1 file pending
    expect(requestState([{ id: '1', version_number: 1, review_status: 'PENDING_REVIEW' }], opts)).toBe('PENDING_REVIEW');

    // 1 file verified
    expect(requestState([{ id: '1', version_number: 1, review_status: 'VERIFIED' }], opts)).toBe('VERIFIED');

    // 2 files: 1 verified, 1 pending
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'VERIFIED' },
      { id: '2', version_number: 1, review_status: 'PENDING_REVIEW' },
    ], opts)).toBe('PARTIALLY_VERIFIED');

    // 2 files: 1 verified, 1 rejected -> REJECTED
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'VERIFIED' },
      { id: '2', version_number: 1, review_status: 'REJECTED' },
    ], opts)).toBe('REJECTED');

    // 1 file rejected, then replaced
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'REJECTED' },
      { id: '2', version_number: 2, review_status: 'PENDING_REVIEW', replaced_file_id: '1' },
    ], opts)).toBe('PENDING_REVIEW');

    // 1 file rejected, replaced and verified
    expect(requestState([
      { id: '1', version_number: 1, review_status: 'REJECTED' },
      { id: '2', version_number: 2, review_status: 'VERIFIED', replaced_file_id: '1' },
    ], opts)).toBe('VERIFIED');
  });

  it('moves the candidate by their required documents only', () => {
    expect(documentStage([])).toBeNull();
    expect(documentStage([{ isRequired: true, state: 'MISSING' }, { isRequired: true, state: 'VERIFIED' }])).toBe('DOCUMENT_COLLECTION');
    expect(documentStage([{ isRequired: true, state: 'INCOMPLETE' }, { isRequired: true, state: 'VERIFIED' }])).toBe('DOCUMENT_COLLECTION');
    expect(documentStage([{ isRequired: true, state: 'REJECTED' }])).toBe('DOCUMENT_COLLECTION');
    expect(documentStage([{ isRequired: true, state: 'PENDING_REVIEW' }, { isRequired: true, state: 'VERIFIED' }])).toBe('VERIFICATION');
    expect(documentStage([{ isRequired: true, state: 'PARTIALLY_VERIFIED' }])).toBe('VERIFICATION');
    expect(documentStage([{ isRequired: true, state: 'VERIFIED' }, { isRequired: false, state: 'MISSING' }])).toBe('READY_TO_JOIN');
  });
});
