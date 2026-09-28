import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('People pagination controls', () => {
  it('keeps server pagination and page-size controls visible on a single populated page', () => {
    const source = readFileSync(join(process.cwd(), 'src/views/EmployeesView.tsx'), 'utf8');

    expect(source).toContain('aria-label="Employee pagination"');
    expect(source).toContain('htmlFor="employee-page-size"');
    expect(source).not.toContain('totalPages > 1');
  });
});
