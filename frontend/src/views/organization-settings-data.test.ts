import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * A new workspace once opened Organization Settings and saw another company's
 * name, contact, GSTIN and address, because defaults for one tenant were baked
 * into the code. Settings screens must show only what the API returns for the
 * signed-in workspace.
 */

const SCREENS = [
  'views/OrganizationSettingsView.tsx',
  'components/crm/LeadIntegrationsCenter.tsx',
  'components/crm/CRMMastersManager.tsx',
];

const FORBIDDEN = [
  /rndtechnosoft\.com/i, // another tenant's domain and contact addresses
  /Ravi Shah/,
  /27AABCU9603R1ZM/, // another tenant's GSTIN
  /tenant_rnd_001/,
  /demo_tenant/,
  /role_rnd_mgr/,
  /voogyo_verify/, // a shared default webhook secret
  /Voogyo@2026!/, // the retired shared default password
];

describe('organization settings screens carry no tenant-specific data', () => {
  it.each(SCREENS)('%s contains no hardcoded organization, tenant or secret values', (screen) => {
    const source = readFileSync(join(process.cwd(), 'src', screen), 'utf8');
    const found = FORBIDDEN.filter((pattern) => pattern.test(source)).map(String);
    expect(found).toEqual([]);
  });
});
