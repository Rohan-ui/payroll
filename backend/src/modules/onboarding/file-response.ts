import { StreamableFile } from '@nestjs/common';

/** Previews are shown in the app (inline); a file is saved (attachment) only when a download is asked for with ?download=1. */
export function fileResponse(bytes: Buffer, type: string, filename: string, download?: string) {
  const disposition = download === '1' || download === 'true' ? 'attachment' : 'inline';
  return new StreamableFile(bytes, { type, disposition: `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}` });
}
