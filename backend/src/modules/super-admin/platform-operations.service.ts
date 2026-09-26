import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { generateTemporaryPassword } from '@/common/security/password.util';
import { replaceWithTemporaryPassword } from '@/common/security/temporary-password';
import { EmailService, PlatformActor, SendOutcome } from '@/modules/email/email.service';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { recordPlatformAction } from './platform-activity';
import { activeSubscriptionPlan, dateOnly } from './tenant-provisioning.service';
import { ProvisionSubscriptionDto, TenantOrganizationDto } from './dto/provision-tenant.dto';
import { AddMembershipDto, UpdateMembershipDto, UpdatePlatformUserDto } from './dto/platform-operations.dto';

const LIVE_SUBSCRIPTIONS = ['ACTIVE', 'TRIALING'];
const DAY_MS = 86_400_000;

const memberInclude = {
  rndtechnosoft_tenants: { select: { tenant_code: true } },
  rndtechnosoft_tenant_member_roles: { select: { rndtechnosoft_roles: { select: { role_code: true } } } },
} satisfies Prisma.rndtechnosoft_tenant_membersInclude;

/**
 * Changes the platform console makes to workspaces and accounts: organization
 * details, module switches, subscriptions, a user's own details and their
 * workspace memberships.
 *
 * Deliberately cross-tenant (only the SUPER_ADMIN-guarded platform API reaches
 * it), but every membership change is keyed by the workspace the membership
 * belongs to, and roles are only ever taken from that same workspace. A user
 * account is global: removing someone from a workspace archives that one
 * membership and never deletes the account. Every change is recorded in the
 * platform activity log.
 */
@Injectable()
export class PlatformOperationsService {
  private readonly logger = new Logger(PlatformOperationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly domains: TenantDomainsService,
    private readonly email: EmailService,
  ) {}

  // ── Workspaces ───────────────────────────────────────────────

  async updateTenant(tenantId: string, input: TenantOrganizationDto, actor: PlatformActor) {
    const before = await this.findTenant(tenantId);
    const countryCode = input.countryCode || null;

    const changedFields = await this.organizationSettings.saveProfile(
      tenantId,
      {
        company_name: input.organizationName,
        industry_type: input.industry || undefined,
        currency: input.currency,
        timezone: input.timezone,
        tax_gstin: input.taxId || undefined,
        website_url: input.website || undefined,
        primary_contact_name: input.contactName || undefined,
        primary_contact_email: input.contactEmail || undefined,
        primary_contact_phone: input.contactPhone || undefined,
        company_address: input.address || undefined,
      },
      { legal_name: input.legalName, country_code: countryCode },
    );
    if (before.legal_name !== input.legalName) changedFields.push('legal_name');
    if (before.country_code !== countryCode) changedFields.push('country_code');

    await recordPlatformAction(this.prisma, actor, {
      category: 'TENANT',
      action: 'TENANT_UPDATED',
      targetTenantId: tenantId,
      description: `Updated the organization details of ${before.tenant_code}`,
      // Field names only: contact details and tax identifiers stay out of the log.
      metadata: { changedFields },
    });
    return { id: tenantId, changedFields };
  }

  async setModule(tenantId: string, moduleCode: string, enabled: boolean, actor: PlatformActor) {
    const tenant = await this.findTenant(tenantId);
    const target = await this.organizationSettings.applyModuleSwitch(tenantId, moduleCode, enabled);

    await recordPlatformAction(this.prisma, actor, {
      category: 'TENANT',
      action: enabled ? 'TENANT_MODULE_ENABLED' : 'TENANT_MODULE_DISABLED',
      targetTenantId: tenantId,
      description: `Turned ${target.name} ${enabled ? 'on' : 'off'} for ${tenant.tenant_code}`,
      metadata: { module: target.code },
    });
    return { code: target.code, name: target.name, enabled };
  }

  /**
   * Moves the workspace to a new subscription. The current one is kept as
   * history: it ends the day before the new one starts.
   */
  async changeSubscription(tenantId: string, input: ProvisionSubscriptionDto, actor: PlatformActor) {
    const tenant = await this.findTenant(tenantId);
    const plan = await activeSubscriptionPlan(this.prisma, input);
    const startsOn = dateOnly(input.startsOn);
    const endOfPrevious = new Date(startsOn.getTime() - DAY_MS);

    const previous = await this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const live = await tx.rndtechnosoft_tenant_subscriptions.findMany({
        where: { tenant_id: tenantId, subscription_status: { in: LIVE_SUBSCRIPTIONS } },
        include: { rndtechnosoft_plans: { select: { plan_code: true } } },
      });
      for (const current of live) {
        if (startsOn <= current.starts_on) {
          throw new BadRequestException(
            `The new subscription must start after the current one, which started on ${current.starts_on.toISOString().slice(0, 10)}.`,
          );
        }
        await tx.rndtechnosoft_tenant_subscriptions.update({
          where: { id: current.id },
          data: {
            subscription_status: 'ENDED',
            ends_on: current.ends_on && current.ends_on < endOfPrevious ? current.ends_on : endOfPrevious,
            updated_at: new Date(),
          },
        });
      }
      await tx.rndtechnosoft_tenant_subscriptions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          plan_id: plan.id,
          subscription_status: input.status,
          starts_on: startsOn,
          ends_on: input.endsOn ? dateOnly(input.endsOn) : null,
          trial_ends_on: input.trialEndsOn ? dateOnly(input.trialEndsOn) : null,
        },
      });
      const previousPlans = live.map((s) => s.rndtechnosoft_plans.plan_code);
      await recordPlatformAction(tx, actor, {
        category: 'BILLING',
        action: 'TENANT_SUBSCRIPTION_CHANGED',
        targetTenantId: tenantId,
        description: `Moved ${tenant.tenant_code} to ${plan.plan_name} (${input.status}) from ${input.startsOn}`,
        metadata: { planCode: plan.plan_code, status: input.status, startsOn: input.startsOn, previousPlans },
      });
      return previousPlans;
    });

    return { planCode: plan.plan_code, planName: plan.plan_name, status: input.status, startsOn: input.startsOn, previousPlans: previous };
  }

  /** The roles a member of this workspace can be given: its active roles, and templates it does not have yet. */
  async assignableRoles(tenantId: string) {
    await this.findTenant(tenantId);
    const [roles, templates] = await Promise.all([
      this.prisma.rndtechnosoft_roles.findMany({
        where: { tenant_id: tenantId },
        orderBy: [{ is_system_role: 'desc' }, { role_name: 'asc' }],
        select: { role_code: true, role_name: true, role_status: true },
      }),
      this.prisma.rndtechnosoft_role_templates.findMany({
        orderBy: { template_name: 'asc' },
        select: { template_code: true, template_name: true },
      }),
    ]);
    const existing = new Set(roles.map((r) => r.role_code));
    return [
      ...roles
        .filter((r) => r.role_status === 'ACTIVE')
        .map((r) => ({ code: r.role_code, name: r.role_name, source: 'WORKSPACE' as const })),
      ...(existing.has(ADMIN_ROLE_CODE) ? [] : [{ code: ADMIN_ROLE_CODE, name: 'Administrator', source: 'TEMPLATE' as const }]),
      ...templates
        .filter((t) => !existing.has(t.template_code))
        .map((t) => ({ code: t.template_code, name: t.template_name, source: 'TEMPLATE' as const })),
    ];
  }

  // ── User accounts ────────────────────────────────────────────

  /** The global account's name, sign-in email and phone. Memberships are not touched. */
  async updateUser(userId: string, input: UpdatePlatformUserDto, actor: PlatformActor) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
      select: { email: true, display_name: true, mobile_number: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const phone = input.phone || null;
    const changedFields = [
      user.display_name !== input.name ? 'name' : null,
      user.email !== input.email ? 'email' : null,
      user.mobile_number !== phone ? 'phone' : null,
    ].filter((field): field is string => field !== null);
    if (changedFields.length === 0) return { id: userId, changedFields };

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_users.update({
          where: { id: userId },
          data: {
            display_name: input.name,
            email: input.email,
            mobile_number: phone,
            // A new address has not been confirmed by its owner.
            ...(user.email !== input.email ? { email_verified_at: null } : {}),
            updated_at: new Date(),
          },
        });
        await recordPlatformAction(tx, actor, {
          category: 'USER',
          action: 'USER_ACCOUNT_UPDATED',
          description: `Updated a user account (${changedFields.join(', ')})`,
          metadata: { userId, changedFields },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Another account already uses that email address.');
      }
      throw error;
    }
    return { id: userId, changedFields };
  }

  /**
   * Resets the account's password to a new temporary one and emails it. The
   * previous password and any earlier temporary password stop working, every
   * session ends, and the person must choose a new password at next sign-in.
   * The temporary password is never stored (only its hash), logged or
   * returned: the response says only whether the email was delivered.
   */
  async resetPassword(userId: string, actor: PlatformActor) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
      select: { email: true, display_name: true, user_status: true, password_hash: true },
    });
    if (!user) throw new NotFoundException('User not found.');
    if (user.user_status !== 'ACTIVE') {
      throw new BadRequestException('This account is disabled. Enable it before resetting its password.');
    }

    // Where they can sign in; checked before anything changes, so a reset never leaves an account unreachable.
    const memberships = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { user_id: userId, membership_status: 'ACTIVE', rndtechnosoft_tenants: { tenant_status: { in: ['ACTIVE', 'TRIALING'] } } },
      orderBy: [{ joined_at: 'asc' }, { created_at: 'asc' }],
      select: { tenant_id: true, rndtechnosoft_tenants: { select: { display_name: true, legal_name: true } } },
    });
    if (memberships.length === 0) {
      throw new BadRequestException('This account is not an active member of any active workspace, so it could not sign in. Add it to a workspace first.');
    }
    const subdomains = await this.domains.primarySubdomains(memberships.map((m) => m.tenant_id));
    const workspaces = memberships.flatMap((m) => {
      const subdomain = subdomains.get(m.tenant_id)?.subdomain;
      const url = subdomain ? this.domains.workspaceUrl(subdomain) : null;
      return url ? [{ tenantId: m.tenant_id, name: m.rndtechnosoft_tenants.display_name || m.rndtechnosoft_tenants.legal_name, url }] : [];
    });
    if (workspaces.length === 0) {
      throw new BadRequestException('None of this account\'s workspaces has a web address yet (PLATFORM_BASE_DOMAIN is not set), so the email would have no working link.');
    }
    if (!(await this.email.getSmtpSettings()).configured) {
      throw new BadRequestException('Outgoing email is not set up. Configure SMTP in Global Settings, then reset the password again.');
    }

    const temporaryPassword = generateTemporaryPassword();
    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      // Conditional on the hash just read: of two resets at once, only one issues a password.
      const revoked = await replaceWithTemporaryPassword(tx, userId, temporaryPassword, user.password_hash);
      if (revoked === null) throw new ConflictException('This password was changed or reset a moment ago. Refresh and try again.');
      await recordPlatformAction(tx, actor, {
        category: 'USER',
        action: 'USER_PASSWORD_RESET',
        description: 'Reset a user password to a temporary one and ended every session',
        metadata: { userId, revokedSessions: revoked },
      });
      return revoked;
    });

    let outcome: SendOutcome;
    try {
      outcome = await this.email.sendPasswordResetEmail(
        { userName: user.display_name, email: user.email, workspaces, temporaryPassword },
        { tenantId: workspaces.length === 1 ? workspaces[0].tenantId : null, requestedBySuperAdminId: actor.superAdminId },
      );
    } catch (error) {
      this.logger.error(`Password reset email could not be attempted userId=${userId}: ${error instanceof Error ? error.name : 'unknown'}`);
      outcome = { status: 'NOT_SENT', deliveryId: null, error: 'The email could not be sent because of a server error. Reset the password again.' };
    }
    await recordPlatformAction(this.prisma, actor, {
      category: 'USER',
      action: outcome.status === 'SENT' ? 'USER_PASSWORD_RESET_EMAIL_SENT' : 'USER_PASSWORD_RESET_EMAIL_FAILED',
      description: outcome.status === 'SENT' ? 'Emailed the temporary password' : `Password reset email not delivered: ${outcome.error}`,
      metadata: { userId, deliveryId: outcome.deliveryId, status: outcome.status },
    });

    return {
      userId,
      revokedSessions,
      email: { status: outcome.status, recipient: user.email, error: outcome.status === 'SENT' ? null : outcome.error, deliveryId: outcome.deliveryId },
    };
  }

  // ── Workspace memberships ────────────────────────────────────

  /** Adds the user to a workspace with one role, or restores a membership that was removed. */
  async addMembership(userId: string, input: AddMembershipDto, actor: PlatformActor) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found.');
    const tenant = await this.findTenant(input.tenantId);

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockTenant(tx, input.tenantId);
        const role = await this.roleForCode(tx, input.tenantId, input.roleCode);
        const existing = await tx.rndtechnosoft_tenant_members.findUnique({
          where: { tenant_id_user_id: { tenant_id: input.tenantId, user_id: userId } },
          select: { id: true, membership_status: true },
        });
        if (existing && existing.membership_status !== 'ARCHIVED') {
          throw new ConflictException(`This person is already a member of ${tenant.tenant_code}.`);
        }

        const now = new Date();
        const memberId = existing?.id ?? randomUUID();
        if (existing) {
          await tx.rndtechnosoft_tenant_members.update({
            where: { tenant_id_id: { tenant_id: input.tenantId, id: memberId } },
            data: { membership_status: 'ACTIVE', joined_at: now, archived_at: null, updated_at: now },
          });
        } else {
          await tx.rndtechnosoft_tenant_members.create({
            data: { id: memberId, tenant_id: input.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: now },
          });
        }
        await this.setOnlyRole(tx, input.tenantId, memberId, role.id);

        await recordPlatformAction(tx, actor, {
          category: 'USER',
          action: 'MEMBERSHIP_ADDED',
          targetTenantId: input.tenantId,
          description: `Added a user to ${tenant.tenant_code} as ${role.role_name}${existing ? ' (restored a removed membership)' : ''}`,
          metadata: { userId, memberId, roleCode: role.role_code, restored: Boolean(existing) },
        });
        return { memberId, tenantId: input.tenantId, roleCode: role.role_code, status: 'ACTIVE' };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`This person is already a member of ${tenant.tenant_code}.`);
      }
      throw error;
    }
  }

  /** Changes a member's role, suspends them or reactivates them. */
  async updateMembership(userId: string, memberId: string, input: UpdateMembershipDto, actor: PlatformActor) {
    if (input.roleCode === undefined && input.status === undefined) {
      throw new BadRequestException('Choose a new role or status.');
    }
    const member = await this.findMembership(userId, memberId);
    if (member.membership_status === 'ARCHIVED') {
      throw new BadRequestException('This person was removed from the workspace. Add them to it again instead.');
    }
    const tenantId = member.tenant_id;
    const roleFrom = member.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles.role_code ?? null;

    return this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      const now = new Date();
      let isAdmin = member.rndtechnosoft_tenant_member_roles.some((link) => link.rndtechnosoft_roles.role_code === ADMIN_ROLE_CODE);
      let roleTo: string | null = null;

      if (input.roleCode !== undefined && input.roleCode !== roleFrom) {
        const role = await this.roleForCode(tx, tenantId, input.roleCode);
        if (isAdmin && role.role_code !== ADMIN_ROLE_CODE) await this.assertAnotherActiveAdmin(tx, tenantId, memberId);
        await this.setOnlyRole(tx, tenantId, memberId, role.id);
        isAdmin = role.role_code === ADMIN_ROLE_CODE;
        roleTo = role.role_code;
      }

      const statusChange = input.status !== undefined && input.status !== member.membership_status ? input.status : null;
      if (statusChange) {
        if (statusChange === 'SUSPENDED' && isAdmin) await this.assertAnotherActiveAdmin(tx, tenantId, memberId);
        await tx.rndtechnosoft_tenant_members.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: memberId } },
          data: { membership_status: statusChange, updated_at: now },
        });
        if (statusChange === 'SUSPENDED') {
          // Access to this workspace ends now, not when the session expires.
          await this.endSessions(tx, tenantId, memberId, now);
        }
      }

      if (roleTo || statusChange) {
        await recordPlatformAction(tx, actor, {
          category: 'USER',
          action: 'MEMBERSHIP_UPDATED',
          targetTenantId: tenantId,
          description: `Changed a membership of ${member.rndtechnosoft_tenants.tenant_code}: ${[
            roleTo ? `role ${roleFrom ?? 'none'} → ${roleTo}` : null,
            statusChange ? `status ${member.membership_status} → ${statusChange}` : null,
          ]
            .filter(Boolean)
            .join(', ')}`,
          metadata: { userId, memberId, roleFrom, roleTo, statusFrom: member.membership_status, statusTo: statusChange },
        });
      }
      return { memberId, tenantId, roleCode: roleTo ?? roleFrom, status: statusChange ?? member.membership_status };
    });
  }

  /**
   * Removes the user from one workspace. The membership is archived, not
   * deleted (payroll runs, approvals and audit entries still reference it),
   * and the global account and its other memberships are untouched.
   */
  async removeMembership(userId: string, memberId: string, actor: PlatformActor) {
    const member = await this.findMembership(userId, memberId);
    if (member.membership_status === 'ARCHIVED') {
      throw new ConflictException('This person was already removed from the workspace.');
    }
    const tenantId = member.tenant_id;
    const isAdmin = member.rndtechnosoft_tenant_member_roles.some((link) => link.rndtechnosoft_roles.role_code === ADMIN_ROLE_CODE);

    await this.prisma.$transaction(async (tx) => {
      await this.lockTenant(tx, tenantId);
      if (isAdmin) await this.assertAnotherActiveAdmin(tx, tenantId, memberId);
      const now = new Date();
      await tx.rndtechnosoft_tenant_member_roles.deleteMany({ where: { tenant_id: tenantId, tenant_member_id: memberId } });
      await tx.rndtechnosoft_tenant_members.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: memberId } },
        data: { membership_status: 'ARCHIVED', archived_at: now, updated_at: now },
      });
      await this.endSessions(tx, tenantId, memberId, now);
      await recordPlatformAction(tx, actor, {
        category: 'USER',
        action: 'MEMBERSHIP_REMOVED',
        targetTenantId: tenantId,
        description: `Removed a user from ${member.rndtechnosoft_tenants.tenant_code}; their account was kept`,
        metadata: { userId, memberId, role: member.rndtechnosoft_tenant_member_roles[0]?.rndtechnosoft_roles.role_code ?? null },
      });
    });
    return { memberId, tenantId, status: 'ARCHIVED' };
  }

  // ── Internals ────────────────────────────────────────────────

  private async findTenant(tenantId: string) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { tenant_code: true, legal_name: true, country_code: true },
    });
    if (!tenant) throw new NotFoundException('Workspace not found.');
    return tenant;
  }

  /** The membership must belong to this user; a mismatched pair is reported as not found. */
  private async findMembership(userId: string, memberId: string) {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { id: memberId, user_id: userId },
      include: memberInclude,
    });
    if (!member) throw new NotFoundException('Membership not found.');
    return member;
  }

  /** Serializes membership and subscription changes of one workspace, so safeguards cannot race. */
  private async lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;
  }

  /**
   * The workspace's active role with this code; failing that, a new role in
   * that workspace created from the role template with this code (with the
   * template's grants copied onto it).
   */
  private async roleForCode(tx: Prisma.TransactionClient, tenantId: string, roleCode: string) {
    const role = await tx.rndtechnosoft_roles.findUnique({
      where: { tenant_id_role_code: { tenant_id: tenantId, role_code: roleCode } },
      select: { id: true, role_code: true, role_name: true, role_status: true },
    });
    if (role) {
      if (role.role_status !== 'ACTIVE') throw new BadRequestException(`The ${role.role_name} role is archived in this workspace.`);
      return role;
    }

    const template =
      roleCode === ADMIN_ROLE_CODE
        ? { template_name: 'Administrator', description: null, is_system_template: true }
        : await tx.rndtechnosoft_role_templates.findUnique({
            where: { template_code: roleCode },
            select: { template_name: true, description: true, is_system_template: true },
          });
    if (!template) {
      throw new BadRequestException('That role does not exist in this workspace, and no role template has that code.');
    }
    const created = await tx.rndtechnosoft_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        role_code: roleCode,
        role_name: template.template_name,
        description: template.description,
        is_system_role: template.is_system_template,
        role_status: 'ACTIVE',
      },
      select: { id: true, role_code: true, role_name: true, role_status: true },
    });
    await grantDefaultRolePermissions(tx, tenantId, created.id, roleCode);
    return created;
  }

  private async setOnlyRole(tx: Prisma.TransactionClient, tenantId: string, memberId: string, roleId: string) {
    await tx.rndtechnosoft_tenant_member_roles.deleteMany({ where: { tenant_id: tenantId, tenant_member_id: memberId } });
    await tx.rndtechnosoft_tenant_member_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId },
    });
  }

  /** A workspace always keeps an active administrator, so it cannot be locked out of its own administration. */
  private async assertAnotherActiveAdmin(tx: Prisma.TransactionClient, tenantId: string, excludingMemberId: string) {
    const others = await tx.rndtechnosoft_tenant_members.count({
      where: {
        tenant_id: tenantId,
        id: { not: excludingMemberId },
        membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: { some: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE } } },
      },
    });
    if (others === 0) {
      throw new BadRequestException('This is the only active administrator of the workspace. Make someone else an administrator first.');
    }
  }

  private async endSessions(tx: Prisma.TransactionClient, tenantId: string, memberId: string, now: Date) {
    await tx.rndtechnosoft_user_sessions.updateMany({
      where: { tenant_id: tenantId, tenant_member_id: memberId, revoked_at: null },
      data: { revoked_at: now },
    });
  }
}
