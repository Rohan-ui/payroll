import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { RequestWithUser } from '../interfaces/authenticated-user.interface';

/**
 * Injects the tenant this request is scoped to.
 *
 * The value is set by TenantAuthGuard from the authenticated session. It is
 * never read from a header, query parameter or body, so it is safe to use
 * directly as the tenant filter in a query.
 */
export const CurrentTenant = createParamDecorator(
  (_required: boolean | undefined, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.tenantId) {
      // Reaching here means a route ran without the guard.
      throw new UnauthorizedException('Authentication is required.');
    }

    return request.tenantId;
  },
);

export { CurrentUser } from './auth.decorators';
