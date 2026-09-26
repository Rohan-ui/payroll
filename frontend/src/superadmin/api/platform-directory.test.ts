import { describe, expect, it } from 'vitest';
import { normalizeTenantDetail } from './platform-directory.api';

describe('normalizeTenantDetail', () => {
  it('keeps the detail page renderable when an older response omits health', () => {
    const detail = normalizeTenantDetail({
      overview: {
        id: 'tenant-1',
        tenantCode: 'ACME',
        name: 'Acme',
        legalName: 'Acme Ltd',
        status: 'ACTIVE',
        subscription: null,
      },
      organization: {},
      users: {},
      modules: [],
      roles: [],
    });

    expect(detail.health).toMatchObject({
      status: 'ACTIVE',
      subscriptionStatus: null,
      activeSessions: 0,
      configuration: [],
    });
  });
});
