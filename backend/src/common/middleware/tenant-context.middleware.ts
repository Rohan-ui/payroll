import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithTenant } from '../interfaces/request-with-tenant.interface';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithTenant, _res: Response, next: NextFunction): void {
    // 1. First priority: tenant from authenticated token/session if already decoded
    const authTenantId = req.user?.tenantMemberId ? req.tenantId : undefined;

    // 2. Second priority (dev/direct API client): x-tenant-id header
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;

    req.tenantId = authTenantId || headerTenantId;

    next();
  }
}
