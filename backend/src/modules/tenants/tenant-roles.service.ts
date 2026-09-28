import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { ADMIN_ROLE_CODE, PermissionKey, groupPermissionCatalog, isPermissionKey } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CreateRoleDto, SetRolePermissionDto, UpdateRoleDto } from './dto/access-management.dto';

export interface AssignableRole {
  id: string;
  role_code: string;
  role_name: string;
}

/**
 * Tenant-owned roles and the permissions they grant.
 *
 * Every lookup is keyed by the session's tenant, so a role id from another
 * workspace is indistinguishable from one that does not exist.
 */
@Injectable()
export class TenantRolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
  ) {}

  /** Every permission, grouped by sidebar section and feature, straight from the catalog. */
  getPermissionCatalog() {
    return groupPermissionCatalog();
  }

  async listRoles(tenantId: string) {
    const roles = await this.prisma.rndtechnosoft_roles.findMany({
      where: { tenant_id: tenantId, role_status: 'ACTIVE' },
      include: {
        _count: {
          select: {
            rndtechnosoft_tenant_member_roles: {
              where: { rndtechnosoft_tenant_members: { membership_status: { not: 'ARCHIVED' } } },
            },
          },
        },
        rndtechnosoft_role_permissions: {
          where: { tenant_id: tenantId },
          select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
        },
      },
      orderBy: [{ is_system_role: 'desc' }, { created_at: 'asc' }],
    });

    return roles.map((role) => ({
      id: role.id,
      code: role.role_code,
      name: role.role_name,
      description: role.description,
      is_system: role.is_system_role,
      // The owner role's grants are locked so a workspace cannot remove its own administration.
      is_admin: role.role_code === ADMIN_ROLE_CODE,
      users_count: role._count.rndtechnosoft_tenant_member_roles,
      permissions: role.rndtechnosoft_role_permissions
        .map((grant) => grant.rndtechnosoft_permissions.permission_code)
        .filter(isPermissionKey),
    }));
  }

  /**
   * Roles for the member picker, each marked with whether this caller may
   * assign it, so the client shows the server's answer instead of guessing.
   */
  async listRoleOptions(tenantId: string, actor: AuthenticatedTenantUser) {
    const [roles, held] = await Promise.all([
      this.listRoles(tenantId),
      this.accessService.getMemberPermissions(tenantId, actor.tenantMemberId),
    ]);

    return roles.map(({ id, code, name, is_admin, permissions }) => ({
      id,
      code,
      name,
      is_admin,
      assignable: permissions.every((key) => held.includes(key)),
    }));
  }

  async createRole(tenantId: string, input: CreateRoleDto, actor: AuthenticatedTenantUser) {
    const code = (input.code || input.name)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);

    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
      throw new BadRequestException('Enter a role code that starts with a letter, for example SALES_MANAGER.');
    }

    await this.assertRoleIdentityAvailable(tenantId, input.name, code);

    const role = await this.prisma.rndtechnosoft_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        role_code: code,
        role_name: input.name,
        description: input.description || null,
        // Custom roles start with no permissions; an administrator grants them.
        is_system_role: false,
        role_status: 'ACTIVE',
      },
    });

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'ROLE_CREATED',
      entityType: 'ROLE',
      entityId: role.id,
      newValues: { code: role.role_code, name: role.role_name },
    });

    return {
      success: true,
      message: `Role "${role.role_name}" created. It has no permissions until you grant some.`,
      data: { id: role.id, code: role.role_code, name: role.role_name },
    };
  }

  async updateRole(tenantId: string, roleId: string, input: UpdateRoleDto, actor: AuthenticatedTenantUser) {
    const role = await this.findActiveRole(tenantId, roleId);

    if (role.role_code === ADMIN_ROLE_CODE) {
      throw new BadRequestException('The Administrator role is built in and cannot be edited.');
    }

    if (input.name && input.name.toLowerCase() !== role.role_name.toLowerCase()) {
      await this.assertRoleIdentityAvailable(tenantId, input.name);
    }

    const updated = await this.prisma.rndtechnosoft_roles.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: role.id } },
      data: {
        ...(input.name !== undefined ? { role_name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        updated_at: new Date(),
      },
    });

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'ROLE_UPDATED',
      entityType: 'ROLE',
      entityId: role.id,
      oldValues: { name: role.role_name, description: role.description },
      newValues: { name: updated.role_name, description: updated.description },
    });

    return { success: true, message: `Role "${updated.role_name}" saved.` };
  }

  async deleteRole(tenantId: string, roleId: string, actor: AuthenticatedTenantUser) {
    const role = await this.findActiveRole(tenantId, roleId);

    if (role.is_system_role) {
      throw new BadRequestException('Built-in roles cannot be deleted.');
    }

    const assigned = await this.prisma.rndtechnosoft_tenant_member_roles.count({
      where: { tenant_id: tenantId, role_id: role.id },
    });
    if (assigned > 0) {
      throw new ConflictException(
        `"${role.role_name}" is assigned to ${assigned} member${assigned === 1 ? '' : 's'}. Give them another role first.`,
      );
    }

    const permissions = await this.getRolePermissionKeys(tenantId, role.id);

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_role_permissions.deleteMany({ where: { tenant_id: tenantId, role_id: role.id } }),
      this.prisma.rndtechnosoft_roles.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: role.id } } }),
    ]);

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'ROLE_DELETED',
      entityType: 'ROLE',
      entityId: role.id,
      oldValues: { code: role.role_code, name: role.role_name, permissions },
    });

    return { success: true, message: `Role "${role.role_name}" deleted.` };
  }

  async setRolePermission(
    tenantId: string,
    roleId: string,
    input: SetRolePermissionDto,
    actor: AuthenticatedTenantUser,
  ) {
    if (!isPermissionKey(input.permissionKey)) {
      throw new BadRequestException('Unknown permission.');
    }
    const key = input.permissionKey;
    const role = await this.findActiveRole(tenantId, roleId);

    if (role.role_code === ADMIN_ROLE_CODE) {
      throw new BadRequestException('Administrators always hold every permission; their access cannot be edited.');
    }

    await this.accessService.assertHoldsAll(
      tenantId,
      actor.tenantMemberId,
      [key],
      'You can only grant or remove permissions you hold yourself.',
    );

    const permission = await this.prisma.rndtechnosoft_permissions.findUnique({
      where: { permission_code: key },
      select: { id: true, permission_name: true },
    });
    if (!permission) {
      // The catalog is installed by migration; its absence is a deployment fault.
      throw new InternalServerErrorException('The permission catalog is not installed.');
    }

    if (input.granted) {
      await this.prisma.rndtechnosoft_role_permissions.createMany({
        data: [{ id: randomUUID(), tenant_id: tenantId, role_id: role.id, permission_id: permission.id }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.rndtechnosoft_role_permissions.deleteMany({
        where: { tenant_id: tenantId, role_id: role.id, permission_id: permission.id },
      });
    }

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: input.granted ? 'ROLE_PERMISSION_GRANTED' : 'ROLE_PERMISSION_REVOKED',
      entityType: 'ROLE',
      entityId: role.id,
      metadata: { role: role.role_code, permission: key },
    });

    return {
      success: true,
      message: input.granted
        ? `"${role.role_name}" can now: ${permission.permission_name.toLowerCase()}.`
        : `"${role.role_name}" can no longer: ${permission.permission_name.toLowerCase()}.`,
    };
  }

  /** A role of this tenant, or 404 whether it belongs to another tenant or does not exist. */
  async findActiveRole(tenantId: string, roleId: string) {
    const role = await this.prisma.rndtechnosoft_roles.findFirst({
      where: { id: roleId, tenant_id: tenantId, role_status: 'ACTIVE' },
    });
    if (!role) {
      throw new NotFoundException('Role not found in this workspace.');
    }
    return role;
  }

  /**
   * Stops a member from handing out more access than they hold: a role can
   * only be assigned by someone who already has every permission it grants.
   * The owner role grants everything, so in practice only owners assign it.
   */
  async assertCanAssignRole(tenantId: string, actor: AuthenticatedTenantUser, role: AssignableRole) {
    const granted = await this.getRolePermissionKeys(tenantId, role.id);
    await this.accessService.assertHoldsAll(
      tenantId,
      actor.tenantMemberId,
      granted,
      `You can only assign roles whose permissions you already hold. "${role.role_name}" grants more.`,
    );
  }

  /** A member whose roles carry more access than the caller has cannot be changed by that caller. */
  async assertCanManageMember(tenantId: string, actor: AuthenticatedTenantUser, memberRoleIds: string[]) {
    const granted = new Set<PermissionKey>();
    for (const roleId of memberRoleIds) {
      for (const key of await this.getRolePermissionKeys(tenantId, roleId)) granted.add(key);
    }
    await this.accessService.assertHoldsAll(
      tenantId,
      actor.tenantMemberId,
      [...granted],
      'You cannot change a member who has access you do not have.',
    );
  }

  private async getRolePermissionKeys(tenantId: string, roleId: string): Promise<PermissionKey[]> {
    const grants = await this.prisma.rndtechnosoft_role_permissions.findMany({
      where: { tenant_id: tenantId, role_id: roleId },
      select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
    });
    return grants.map((grant) => grant.rndtechnosoft_permissions.permission_code).filter(isPermissionKey);
  }

  private async assertRoleIdentityAvailable(tenantId: string, name: string, code?: string) {
    const clash = await this.prisma.rndtechnosoft_roles.findFirst({
      where: {
        tenant_id: tenantId,
        OR: [
          ...(code ? [{ role_code: code }] : []),
          { role_status: 'ACTIVE', role_name: { equals: name, mode: 'insensitive' as const } },
        ],
      },
      select: { role_code: true, role_name: true },
    });

    if (clash) {
      throw new ConflictException(
        code && clash.role_code === code
          ? `A role with the code ${code} already exists in this workspace. Choose another code.`
          : `A role named "${clash.role_name}" already exists in this workspace.`,
      );
    }
  }

  private auditActor(tenantId: string, actor: AuthenticatedTenantUser) {
    return { tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId };
  }
}
