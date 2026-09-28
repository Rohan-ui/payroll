import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { ModuleStates, PermissionKey, isPermissionKey, resolveModuleStates } from './access-catalog';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Permission keys a tenant member holds: exactly the `role_permissions`
   * rows of that member's active roles inside `tenantId`. No role is
   * authorized by its code; the owner role holds its keys as rows too.
   */
  async getMemberPermissions(tenantId: string, tenantMemberId: string): Promise<PermissionKey[]> {
    const grants = await this.prisma.rndtechnosoft_role_permissions.findMany({
      where: {
        tenant_id: tenantId,
        rndtechnosoft_roles: {
          role_status: 'ACTIVE',
          rndtechnosoft_tenant_member_roles: {
            some: { tenant_id: tenantId, tenant_member_id: tenantMemberId },
          },
        },
      },
      select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
    });

    const keys = new Set<PermissionKey>();
    for (const grant of grants) {
      const code = grant.rndtechnosoft_permissions.permission_code;
      if (isPermissionKey(code)) keys.add(code);
    }
    return [...keys];
  }

  /**
   * Refuses to let a member hand out access they do not have themselves:
   * granting a permission, assigning a role, or managing someone whose role
   * carries more than the caller holds.
   */
  async assertHoldsAll(
    tenantId: string,
    tenantMemberId: string,
    required: readonly PermissionKey[],
    message: string,
  ): Promise<void> {
    if (required.length === 0) return;
    const held = await this.getMemberPermissions(tenantId, tenantMemberId);
    if (required.some((key) => !held.includes(key))) {
      throw new ForbiddenException(message);
    }
  }

  async getModuleStates(tenantId: string): Promise<ModuleStates> {
    // Only the module switches are read; the rest of the settings document can be large.
    const rows = await this.prisma.$queryRaw<{ modules: unknown }[]>`
      SELECT settings->'modules' AS modules
      FROM rndtechnosoft_tenant_settings
      WHERE tenant_id = ${tenantId}::uuid
    `;
    return resolveModuleStates(rows[0]?.modules);
  }
}
