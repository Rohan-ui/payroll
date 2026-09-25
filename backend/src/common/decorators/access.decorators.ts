import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../access/access-catalog';

export const REQUIRED_PERMISSIONS = 'requiredPermissions';

/**
 * Requires every listed permission. Enforced by the global PermissionsGuard,
 * so the decorator alone is enough; no `@UseGuards` is needed. The global
 * ModuleAccessGuard also refuses the route while a workspace module owning
 * one of these permissions is switched off.
 */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
