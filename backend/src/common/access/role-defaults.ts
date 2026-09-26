import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ADMIN_ROLE_CODE, PERMISSION_KEYS, PermissionKey, isPermissionKey } from './access-catalog';

type TemplateReader = Pick<Prisma.TransactionClient, 'rndtechnosoft_role_templates'>;
type RolePermissionWriter = TemplateReader &
  Pick<Prisma.TransactionClient, 'rndtechnosoft_permissions' | 'rndtechnosoft_role_permissions'>;

/**
 * The permissions a new role with this code starts with: every permission for
 * the Administrator role; otherwise the grants of the role template with the
 * same code, as managed from the platform console; otherwise none.
 */
export async function templatePermissionKeys(db: TemplateReader, roleCode: string): Promise<PermissionKey[]> {
  if (roleCode === ADMIN_ROLE_CODE) return [...PERMISSION_KEYS];

  const template = await db.rndtechnosoft_role_templates.findUnique({
    where: { template_code: roleCode },
    select: {
      rndtechnosoft_role_template_permissions: {
        select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
      },
    },
  });
  return (template?.rndtechnosoft_role_template_permissions ?? [])
    .map((grant) => grant.rndtechnosoft_permissions.permission_code)
    .filter(isPermissionKey);
}

/**
 * Grants a newly created role the starting permissions for its code. Every
 * path that creates a role from a template (workspace registration, platform
 * provisioning, adding a member with a new role code) goes through here. The
 * grants are copied: the workspace owns its role from then on, so a later
 * change to the template does not change it.
 */
export async function grantDefaultRolePermissions(
  db: RolePermissionWriter,
  tenantId: string,
  roleId: string,
  roleCode: string,
): Promise<void> {
  const keys = await templatePermissionKeys(db, roleCode);
  if (keys.length === 0) return;

  const permissions = await db.rndtechnosoft_permissions.findMany({
    where: { permission_code: { in: keys } },
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
