import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * The tenant API requires authentication, so a component calling `fetch`
 * directly sends no credentials and its request is refused. That is exactly
 * what happened when authentication was first switched on: the pages rendered,
 * then every CRM call returned 401.
 *
 * Calls must go through `apiClient` or `apiFetch`, which attach the session
 * token and report an expired session centrally.
 */

const SOURCE_ROOT = join(process.cwd(), 'src');

/** Files allowed to call `fetch` directly, with the reason. */
const ALLOWED = new Set([
  'api/client.ts', // defines apiFetch, the wrapper itself
  'superadmin/api/platform-client.ts', // the platform portal's own wrapper
  'superadmin/api/platform-auth.api.ts', // sign-in, before a session exists
  'views/AddEmployeeView.tsx', // public IFSC lookup, a third party that must not receive our token
]);

/** Files allowed to mention a localhost address, with the reason. None today. */
const ALLOWED_LOCALHOST = new Set<string>();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe('API calls go through the authenticated client', () => {
  const files = sourceFiles(SOURCE_ROOT);

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('calls fetch nowhere outside the wrappers', () => {
    // Deliberately matches every `fetch(` call, not only literal '/api/...'
    // paths. Calls built from a variable, such as fetch(endpoint), are the
    // ones that slipped through when authentication was first switched on.
    const anyFetchCall = /(?<![A-Za-z0-9_$.])fetch\s*\(/;

    const offenders = files
      .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'))
      .filter((name) => !ALLOWED.has(name))
      .filter((name) => anyFetchCall.test(readFileSync(join(SOURCE_ROOT, name), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('hardcodes no backend origin', () => {
    // An absolute developer URL breaks in production and defeats
    // connect-src 'self' in the Content-Security-Policy.
    const offenders = files
      .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'))
      .filter((name) => !ALLOWED_LOCALHOST.has(name))
      .filter((name) => /localhost:\d{4}/.test(readFileSync(join(SOURCE_ROOT, name), 'utf8')));

    expect(offenders).toEqual([]);
  });

  it('sends no tenant identifier from the client', () => {
    // The server derives the workspace from the session. A tenant header from
    // the client is ignored, and sending one invites the old mental model back.
    const offenders = files
      .filter((file) => /['"]x-tenant-id['"]/i.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SOURCE_ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
