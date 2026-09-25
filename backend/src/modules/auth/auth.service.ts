import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ADMIN_ROLE_CODE, PermissionKey, isPermissionKey } from '@/common/access/access-catalog';
import { AccessService } from '@/common/access/access.service';
import { grantDefaultRolePermissions, templatePermissionKeys } from '@/common/access/role-defaults';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';

export interface RegisterUserInput {
  email: string;
  password?: string;
  displayName: string;
  mobileNumber?: string;
}

export interface RegisterTenantInput {
  companyName: string;
  tenantCode: string;
  subdomain?: string;
  displayName?: string;
  email: string;
  password?: string;
  adminName?: string;
  countryCode?: string;
  currency?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly domains: TenantDomainsService,
  ) {}

  /**
   * Registration writes a scrypt hash, matching what sign-in verifies.
   * Legacy SHA-256 hashes still verify and are upgraded on next sign-in.
   */
  private async hashNewPassword(password: string): Promise<string> {
    return hashPassword(password);
  }

  async registerUser(input: RegisterUserInput) {
    const existing = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const userId = randomUUID();
    const user = await this.prisma.rndtechnosoft_users.create({
      data: {
        id: userId,
        email: input.email.toLowerCase(),
        password_hash: input.password ? await this.hashNewPassword(input.password) : null,
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: input.displayName,
        mobile_number: input.mobileNumber || null,
        user_status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        display_name: true,
        mobile_number: true,
        user_status: true,
        created_at: true,
      },
    });

    return user;
  }

  /** Name and address of a workspace, as shown on its own sign-in page. */
  async workspaceSummary(tenantId: string) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { display_name: true, legal_name: true, tenant_status: true },
    });
    return tenant ? { name: tenant.display_name || tenant.legal_name, status: tenant.tenant_status } : null;
  }

  async registerTenant(input: RegisterTenantInput) {
    const code = input.tenantCode.toUpperCase().trim();
    const existingTenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { tenant_code: code },
    });

    if (existingTenant) {
      throw new ConflictException(`Company with code '${code}' already exists`);
    }

    const email = input.email.toLowerCase();
    const existingUser = await this.prisma.rndtechnosoft_users.findUnique({ where: { email } });

    // This route is public. Attaching an existing account here would make that
    // person administrator of a workspace they never asked for, so an address
    // that already has an account must sign in instead.
    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists. Sign in instead, or register the workspace with a different email.',
      );
    }

    const tenantId = randomUUID();
    const companyName = input.displayName || input.companyName;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.rndtechnosoft_users.create({
        data: {
          id: randomUUID(),
          email,
          password_hash: input.password ? await this.hashNewPassword(input.password) : null,
          password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
          display_name: input.adminName || email.split('@')[0],
          user_status: 'ACTIVE',
        },
      });

      const tenant = await tx.rndtechnosoft_tenants.create({
        data: {
          id: tenantId,
          tenant_code: code,
          legal_name: input.companyName,
          display_name: companyName,
          country_code: input.countryCode || 'IN',
          default_currency_code: input.currency || 'INR',
          tenant_status: 'ACTIVE',
        },
      });

      // The workspace's address, <subdomain>.<base domain>, unique across the platform.
      const subdomain = await this.domains.assignPrimarySubdomain(tx, tenantId, {
        requested: input.subdomain,
        derivedFrom: code,
      });

      // Settings
      await tx.rndtechnosoft_tenant_settings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          settings: {
            payroll: {
              payFrequency: 'MONTHLY',
              currency: 'INR',
              workingDaysPerMonth: 30,
            },
            compliance: {
              epfWageCeiling: 15000,
              esicThreshold: 21000,
            },
            timezone: 'Asia/Kolkata',
            // The organization profile starts from what the registrant entered,
            // so the workspace never shows another organization's details.
            profile: {
              company_name: companyName,
              currency: input.currency || 'INR',
              timezone: 'Asia/Kolkata',
              primary_contact_name: input.adminName || null,
              primary_contact_email: email,
            },
          },
        },
      });

      // The workspace owner role, holding every permission as role_permissions rows.
      const adminRole = await tx.rndtechnosoft_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          role_code: ADMIN_ROLE_CODE,
          role_name: 'Administrator',
          is_system_role: true,
          role_status: 'ACTIVE',
        },
      });
      await grantDefaultRolePermissions(tx, tenantId, adminRole.id, ADMIN_ROLE_CODE);

      // Member
      const memberId = randomUUID();
      await tx.rndtechnosoft_tenant_members.create({
        data: {
          id: memberId,
          tenant_id: tenantId,
          user_id: user.id,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });

      // Member Role
      await tx.rndtechnosoft_tenant_member_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          tenant_member_id: memberId,
          role_id: adminRole.id,
        },
      });

      // Session creation lives in TenantSessionService, so registration only
      // reports what it created and the caller signs in with it.
      return {
        tenantId,
        tenantCode: code,
        subdomain,
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
      };
    });
  }

  /**
   * Adds an existing account to the caller's own workspace. The workspace and
   * the acting member come from the session, and the new member may only be
   * given a role whose permissions the caller already holds.
   */
  async addMemberToTenant(actor: AuthenticatedTenantUser, userId: string, roleCode = 'EMPLOYEE') {
    const tenantId = actor.tenantId;

    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.prisma.rndtechnosoft_tenant_members.findUnique({
      where: {
        tenant_id_user_id: {
          tenant_id: tenantId,
          user_id: userId,
        },
      },
    });

    if (existingMember) {
      return existingMember;
    }

    const existingRole = await this.prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: roleCode, role_status: 'ACTIVE' },
      include: {
        rndtechnosoft_role_permissions: {
          where: { tenant_id: tenantId },
          select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
        },
      },
    });

    // A missing role is created from its template, so the template's grants are what it grants.
    const granted: readonly PermissionKey[] = existingRole
      ? existingRole.rndtechnosoft_role_permissions
          .map((grant) => grant.rndtechnosoft_permissions.permission_code)
          .filter(isPermissionKey)
      : await templatePermissionKeys(this.prisma, roleCode);

    await this.accessService.assertHoldsAll(
      tenantId,
      actor.tenantMemberId,
      granted,
      'You can only give a new member access you already hold.',
    );

    return this.prisma.$transaction(async (tx) => {
      const memberId = randomUUID();
      const member = await tx.rndtechnosoft_tenant_members.create({
        data: {
          id: memberId,
          tenant_id: tenantId,
          user_id: userId,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });

      let roleId = existingRole?.id;
      if (!roleId) {
        const role = await tx.rndtechnosoft_roles.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            role_code: roleCode,
            role_name: roleCode,
            is_system_role: true,
            role_status: 'ACTIVE',
          },
        });
        await grantDefaultRolePermissions(tx, tenantId, role.id, roleCode);
        roleId = role.id;
      }

      await tx.rndtechnosoft_tenant_member_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          tenant_member_id: memberId,
          role_id: roleId,
        },
      });

      return member;
    });
  }

  /**
   * Seeds demo Indian company, 5 realistic employees, salary structures,
   * bank accounts, and returns a logged-in admin session.
   */
}
