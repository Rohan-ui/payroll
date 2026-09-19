import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { RequestWithTenant } from '../interfaces/request-with-tenant.interface';

export const CurrentTenant = createParamDecorator(
  (required = true, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenant>();
    const tenantId = request.tenantId;

    if (required && !tenantId) {
      throw new BadRequestException('Tenant context is required. Please provide a valid tenant context via authentication or x-tenant-id header.');
    }

    return tenantId;
  },
);

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestWithTenant>();
    return request.user;
  },
);
