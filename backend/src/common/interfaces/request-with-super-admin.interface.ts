import { Request } from 'express';

/**
 * Identity attached by SuperAdminAuthGuard after a platform session token
 * has been validated. Platform identities are global by design: they are not
 * tenant members and never carry a tenant_id.
 */
export interface AuthenticatedSuperAdmin {
  superAdminId: string;
  sessionId: string;
  email: string;
  displayName: string;
  role: string;
  /** True while only the second-factor challenge may be completed. */
  isMfaPending: boolean;
}

export interface RequestWithSuperAdmin extends Request {
  superAdmin?: AuthenticatedSuperAdmin;
}
