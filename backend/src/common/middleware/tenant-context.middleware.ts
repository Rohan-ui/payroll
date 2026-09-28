import { Injectable, NestMiddleware } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { RequestWithUser } from '../interfaces/authenticated-user.interface';

/**
 * Clears any tenant hint the caller supplied.
 *
 * This middleware used to derive the tenant from an `x-tenant-id` header with
 * a hardcoded fallback, which let anyone read any tenant's records without
 * credentials. Tenant scope is now set by TenantAuthGuard from the stored
 * session. This runs before the guard and exists to guarantee that nothing
 * downstream can observe a caller-supplied value.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: RequestWithUser, _res: Response, next: NextFunction): void {
    req.tenantId = undefined;
    req.user = undefined;
    next();
  }
}
