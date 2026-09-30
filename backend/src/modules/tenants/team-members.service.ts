import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { CreateTeamMemberDto, UpdateTeamMemberDto } from './dto/access-management.dto';
import { TenantRolesService } from './tenant-roles.service';

/** Memberships a workspace administrator manages. ARCHIVED members were removed. */
const LISTED_STATUSES = ['ACTIVE', 'SUSPENDED'];

const memberInclude = {
  rndtechnosoft_users: {
    select: { id: true, email: true, display_name: true, mobile_number: true, user_status: true },
  },
  rndtechnosoft_tenant_member_roles: {
    include: { rndtechnosoft_roles: { select: { id: true, role_code: true, role_name: true } } },
  },
} satisfies Prisma.rndtechnosoft_tenant_membersInclude;

type MemberWithUser = Prisma.rndtechnosoft_tenant_membersGetPayload<{ include: typeof memberInclude }>;

/**
 * People in the session's workspace. A user is a global login; membership is
 * what ties them to this tenant, so every lookup here goes through the
 * membership row keyed by (tenant_id, user_id).
 */
@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rolesService: TenantRolesService,
    private readonly auditService: AuditService,
  ) {}

  async listMembers(tenantId: string) {
    const [members, leadCounts] = await Promise.all([
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: { in: LISTED_STATUSES } },
        include: memberInclude,
        orderBy: [{ joined_at: 'asc' }, { created_at: 'asc' }],
      }),
      // Leads each member owns now (the lead's assigned member), one grouped query for everyone.
      this.prisma.rndtechnosoft_crm_leads.groupBy({
        by: ['assigned_tenant_member_id'],
        where: { tenant_id: tenantId, assigned_tenant_member_id: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(leadCounts.map((row) => [row.assigned_tenant_member_id, row._count._all]));

    return members.map((member) => ({ ...this.toResponse(member), leads_count: counts.get(member.id) ?? 0 }));
  }

  async createMember(tenantId: string, input: CreateTeamMemberDto, actor: AuthenticatedTenantUser) {
    const role = await this.rolesService.findActiveRole(tenantId, input.role_id);
    await this.rolesService.assertCanAssignRole(tenantId, actor, role);

    const displayName = [input.first_name, input.last_name].filter(Boolean).join(' ');

    const { user, member, temporaryPassword } = await this.prisma.$transaction(async (tx) => {
      let user = await tx.rndtechnosoft_users.findUnique({ where: { email: input.email } });
      let temporaryPassword: string | null = null;

      if (!user) {
        // A one-time random password per new account. It is returned once to
        // the administrator who created the account and is never stored in clear.
        temporaryPassword = randomBytes(12).toString('base64url');
        user = await tx.rndtechnosoft_users.create({
          data: {
            id: randomUUID(),
            email: input.email,
            password_hash: await hashPassword(temporaryPassword),
            password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
            display_name: displayName,
            mobile_number: input.phone || null,
            user_status: 'ACTIVE',
          },
        });
      }

      const existing = await tx.rndtechnosoft_tenant_members.findUnique({
        where: { tenant_id_user_id: { tenant_id: tenantId, user_id: user.id } },
      });

      if (existing && existing.membership_status !== 'ARCHIVED') {
        throw new ConflictException(`${input.email} is already a member of this workspace.`);
      }

      const now = new Date();
      const member = existing
        ? await tx.rndtechnosoft_tenant_members.update({
            where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } },
            data: { membership_status: 'ACTIVE', joined_at: now, archived_at: null, updated_at: now },
          })
        : await tx.rndtechnosoft_tenant_members.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              user_id: user.id,
              membership_status: 'ACTIVE',
              joined_at: now,
            },
          });

      await tx.rndtechnosoft_tenant_member_roles.deleteMany({
        where: { tenant_id: tenantId, tenant_member_id: member.id },
      });
      await tx.rndtechnosoft_tenant_member_roles.create({
        data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: member.id, role_id: role.id },
      });

      return { user, member, temporaryPassword };
    });

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'MEMBER_ADDED',
      entityType: 'TENANT_MEMBER',
      entityId: member.id,
      metadata: { userId: user.id, role: role.role_code, newAccount: temporaryPassword !== null },
    });

    return {
      success: true,
      message: temporaryPassword
        ? `${displayName} can now sign in to this workspace. Share the temporary password with them securely; it is shown only once.`
        : `${input.email} already has an account and was added to this workspace. They sign in with their existing password.`,
      data: {
        id: user.id,
        member_id: member.id,
        email: user.email,
        display_name: user.display_name,
        temporaryPassword,
      },
    };
  }

  async updateMember(tenantId: string, userId: string, input: UpdateTeamMemberDto, actor: AuthenticatedTenantUser) {
    const member = await this.findListedMember(tenantId, userId);
    const isSelf = member.id === actor.tenantMemberId;
    const targetIsAdmin = this.hasAdminRole(member);
    const currentRoleId = member.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles.id ?? null;

    const roleChange = input.role_id && input.role_id !== currentRoleId ? input.role_id : null;
    const statusChange =
      input.is_active !== undefined && input.is_active !== (member.membership_status === 'ACTIVE')
        ? input.is_active
        : undefined;

    const [currentFirst, ...currentRest] = (member.rndtechnosoft_users.display_name ?? '').split(' ');
    const currentLast = currentRest.join(' ');
    const nextFirst = input.first_name ?? currentFirst;
    const nextLast = input.last_name !== undefined ? input.last_name : currentLast;
    const nextPhone = input.phone !== undefined ? input.phone || null : member.rndtechnosoft_users.mobile_number;
    const identityChange =
      nextFirst !== currentFirst || nextLast !== currentLast || nextPhone !== member.rndtechnosoft_users.mobile_number;

    if (!isSelf) {
      await this.rolesService.assertCanManageMember(tenantId, actor, this.roleIds(member));
    }
    if (isSelf && (roleChange || statusChange !== undefined)) {
      throw new BadRequestException('You cannot change your own role or access. Ask another administrator.');
    }

    const role = roleChange ? await this.rolesService.findActiveRole(tenantId, roleChange) : null;
    if (role) {
      await this.rolesService.assertCanAssignRole(tenantId, actor, role);
    }

    if (identityChange) {
      // Name and phone live on the global account, which other workspaces see too.
      const otherWorkspaces = await this.prisma.rndtechnosoft_tenant_members.count({
        where: { user_id: userId, tenant_id: { not: tenantId }, membership_status: { not: 'ARCHIVED' } },
      });
      if (otherWorkspaces > 0) {
        throw new BadRequestException(
          'This person belongs to more than one workspace, so their name and phone can only be changed from their own account.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();

      if (identityChange) {
        await tx.rndtechnosoft_users.update({
          where: { id: member.user_id },
          data: {
            display_name: [nextFirst, nextLast].filter(Boolean).join(' ') || null,
            mobile_number: nextPhone,
            updated_at: now,
          },
        });
      }

      if (role) {
        if (targetIsAdmin && role.role_code !== ADMIN_ROLE_CODE) {
          await this.assertAnotherActiveAdmin(tx, tenantId, member.id);
        }
        await tx.rndtechnosoft_tenant_member_roles.deleteMany({
          where: { tenant_id: tenantId, tenant_member_id: member.id },
        });
        await tx.rndtechnosoft_tenant_member_roles.create({
          data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: member.id, role_id: role.id },
        });
      }

      if (statusChange !== undefined) {
        if (!statusChange && targetIsAdmin) {
          await this.assertAnotherActiveAdmin(tx, tenantId, member.id);
        }
        await tx.rndtechnosoft_tenant_members.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: member.id } },
          data: { membership_status: statusChange ? 'ACTIVE' : 'SUSPENDED', updated_at: now },
        });
        if (!statusChange) {
          // Access in this workspace ends now, not when the session expires.
          await tx.rndtechnosoft_user_sessions.updateMany({
            where: { tenant_id: tenantId, tenant_member_id: member.id, revoked_at: null },
            data: { revoked_at: now },
          });
        }
      }
    });

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'MEMBER_UPDATED',
      entityType: 'TENANT_MEMBER',
      entityId: member.id,
      metadata: {
        userId,
        ...(role ? { roleFrom: this.primaryRoleCode(member), roleTo: role.role_code } : {}),
        ...(statusChange !== undefined ? { status: statusChange ? 'ACTIVE' : 'SUSPENDED' } : {}),
        identityChanged: identityChange,
      },
    });

    return { success: true, message: 'Team member saved.' };
  }

  async removeMember(tenantId: string, userId: string, actor: AuthenticatedTenantUser) {
    const member = await this.findListedMember(tenantId, userId);

    if (member.id === actor.tenantMemberId) {
      throw new BadRequestException('You cannot remove yourself. Ask another administrator.');
    }
    await this.rolesService.assertCanManageMember(tenantId, actor, this.roleIds(member));
    const targetIsAdmin = this.hasAdminRole(member);

    await this.prisma.$transaction(async (tx) => {
      if (targetIsAdmin) {
        await this.assertAnotherActiveAdmin(tx, tenantId, member.id);
      }
      const now = new Date();
      await tx.rndtechnosoft_tenant_member_roles.deleteMany({
        where: { tenant_id: tenantId, tenant_member_id: member.id },
      });
      // The membership is archived, not deleted: payroll runs, approvals and
      // audit entries still reference it.
      await tx.rndtechnosoft_tenant_members.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: member.id } },
        data: { membership_status: 'ARCHIVED', archived_at: now, updated_at: now },
      });
      await tx.rndtechnosoft_user_sessions.updateMany({
        where: { tenant_id: tenantId, tenant_member_id: member.id, revoked_at: null },
        data: { revoked_at: now },
      });
    });

    await this.auditService.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'MEMBER_REMOVED',
      entityType: 'TENANT_MEMBER',
      entityId: member.id,
      metadata: { userId, role: this.primaryRoleCode(member) },
    });

    return { success: true, message: 'Team member removed from this workspace. Their account and history are kept.' };
  }

  /** 404 whether the user belongs to another workspace or does not exist. */
  private async findListedMember(tenantId: string, userId: string): Promise<MemberWithUser> {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: userId, membership_status: { in: LISTED_STATUSES } },
      include: memberInclude,
    });
    if (!member) {
      throw new NotFoundException('Team member not found in this workspace.');
    }
    return member;
  }

  private async assertAnotherActiveAdmin(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludingMemberId: string,
  ): Promise<void> {
    const others = await tx.rndtechnosoft_tenant_members.count({
      where: {
        tenant_id: tenantId,
        id: { not: excludingMemberId },
        membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: {
          some: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE } },
        },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'This is the only active administrator. Make someone else an administrator first.',
      );
    }
  }

  private roleIds(member: MemberWithUser): string[] {
    return member.rndtechnosoft_tenant_member_roles.map((link) => link.rndtechnosoft_roles.id);
  }

  /** The last-owner safeguard: a workspace always keeps an active member with the owner role. */
  private hasAdminRole(member: MemberWithUser): boolean {
    return member.rndtechnosoft_tenant_member_roles.some(
      (link) => link.rndtechnosoft_roles.role_code === ADMIN_ROLE_CODE,
    );
  }

  private primaryRoleCode(member: MemberWithUser): string | null {
    return member.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles.role_code ?? null;
  }

  private toResponse(member: MemberWithUser) {
    const user = member.rndtechnosoft_users;
    const role = member.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles ?? null;
    const [firstName, ...rest] = (user.display_name || user.email.split('@')[0]).split(' ');

    return {
      id: user.id,
      member_id: member.id,
      first_name: firstName,
      last_name: rest.join(' '),
      name: user.display_name,
      email: user.email,
      phone: user.mobile_number,
      role_id: role?.id ?? null,
      role_code: role?.role_code ?? null,
      role_name: role?.role_name ?? null,
      membership_status: member.membership_status,
      is_active: member.membership_status === 'ACTIVE' && user.user_status === 'ACTIVE',
      joined_at: member.joined_at,
    };
  }
}
