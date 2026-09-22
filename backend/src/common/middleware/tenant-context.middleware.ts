import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithTenant } from '../interfaces/request-with-tenant.interface';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithTenant, _res: Response, next: NextFunction): void {
    // 1. First priority: tenant from authenticated token/session if already decoded
    const authTenantId = req.user?.tenantMemberId ? req.tenantId : undefined;

    // 2. Second priority (dev/direct API client): x-tenant-id header
    let headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId === 'tenant_rnd_001') {
      headerTenantId = 'e813544d-5b1a-412b-b310-64f21efaf4a9';
    }

    req.tenantId = authTenantId || headerTenantId || 'e813544d-5b1a-412b-b310-64f21efaf4a9';

    next();
  }
}
