import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORY = /^[a-z0-9-]{1,40}$/;
const EXTENSION = /^[a-z0-9]{1,8}$/;

/**
 * Private files (generated letters, and later uploaded documents) on the
 * server's disk, under PRIVATE_STORAGE_DIR (default ./storage/private), which
 * nothing serves directly. Each workspace's files sit under its own folder and
 * are read back only through its own tenant id, so one workspace can never
 * reach another's file, and a stored key can never point outside the folder.
 */
@Injectable()
export class PrivateStorageService {
  private readonly root = path.resolve(process.env.PRIVATE_STORAGE_DIR?.trim() || path.join(process.cwd(), 'storage', 'private'));

  /** Stores the bytes and returns the key to keep, with the file's SHA-256. */
  async save(tenantId: string, category: string, bytes: Buffer, extension: string) {
    if (!UUID.test(tenantId) || !CATEGORY.test(category) || !EXTENSION.test(extension)) {
      throw new InternalServerErrorException('The file could not be stored.');
    }
    const key = `${tenantId.toLowerCase()}/${category}/${randomUUID()}.${extension}`;
    const target = this.pathOf(key);
    await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    // Written under a temporary name, then renamed, so a half-written file never appears under its key.
    const temporary = `${target}.${randomUUID()}.partial`;
    await fs.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, target);
    return { key, sha256: createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }

  /** The file for a key, only when the key belongs to this workspace. */
  async read(tenantId: string, key: string): Promise<Buffer> {
    if (!key.startsWith(`${tenantId.toLowerCase()}/`)) throw new NotFoundException('File not found.');
    try {
      return await fs.readFile(this.pathOf(key));
    } catch {
      throw new NotFoundException('File not found.');
    }
  }

  private pathOf(key: string) {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new NotFoundException('File not found.');
    return target;
  }
}
