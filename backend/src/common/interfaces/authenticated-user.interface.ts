import { Request } from 'express';

/**
 * The authenticated tenant identity, resolved from a stored session.
 *
 * Every field here comes from the database row the session points at. None of
 * it is read from a header, query string or request body, which is what makes
 * it safe to authorize against.
 */
export interface AuthenticatedTenantUser {
  userId: string;
  email: string;
  displayName: string | null;
  sessionId: string;
  /** The tenant this session is pinned to. The only tenant the request may touch. */
  tenantId: string;
  /** Membership row linking the user to that tenant. */
  tenantMemberId: string;
  /** Role codes granted inside this tenant, for example ADMIN or EMPLOYEE. */
  roles: string[];
  /** True until the account's temporary password is replaced; the session reaches nothing else. */
  mustChangePassword: boolean;
}

export interface RequestWithUser extends Request {
  user?: AuthenticatedTenantUser;
  tenantId?: string;
}
