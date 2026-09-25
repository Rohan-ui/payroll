import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DEFAULT_ROLE_PERMISSIONS } from './access-catalog';

type RolePermissionWriter = Pick<Prisma.TransactionClient, 'rndtechnosoft_permissions' | 'rndtechnosoft_role_permissions'>;

/**
 * Grants a newly created role the default permissions for its code. Every
 * path that creates a built-in role (workspace registration, platform
 * provisioning, adding a member with a new role code) goes through here, so
 * the defaults live in one place: DEFAULT_ROLE_PERMISSIONS.
 */
export async function grantDefaultRolePermissions(
  db: RolePermissionWriter,
  tenantId: string,
  roleId: string,
  roleCode: string,
): Promise<void> {
  const keys = DEFAULT_ROLE_PERMISSIONS[roleCode] ?? [];
  if (keys.length === 0) return;

  const permissions = await db.rndtechnosoft_permissions.findMany({
    where: { permission_code: { in: [...keys] } },
    select: { id: true },
  });

  await db.rndtechnosoft_role_permissions.createMany({
    data: permissions.map((permission) => ({
      id: randomUUID(),
      tenant_id: tenantId,
      role_id: roleId,
      permission_id: permission.id,
    })),
    skipDuplicates: true,
  });
}
