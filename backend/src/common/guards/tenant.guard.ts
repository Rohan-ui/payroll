import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RequestWithTenant } from '../interfaces/request-with-tenant.interface';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithTenant>();

    if (!request.tenantId) {
      throw new ForbiddenException('Access denied: Tenant scope is required for this resource.');
    }

    return true;
  }
}
