import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID, createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import * as nodemailer from 'nodemailer';

export interface CreateTenantInput {
  tenantCode: string;
  legalName: string;
  displayName: string;
  countryCode?: string;
  defaultCurrencyCode?: string;
}

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTenant(input: CreateTenantInput) {
    const existing = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { tenant_code: input.tenantCode },
    });

    if (existing) {
      throw new ConflictException(`Tenant with code '${input.tenantCode}' already exists`);
    }

    const tenantId = randomUUID();

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.rndtechnosoft_tenants.create({
        data: {
          id: tenantId,
          tenant_code: input.tenantCode,
          legal_name: input.legalName,
          display_name: input.displayName,
          country_code: input.countryCode || 'IN',
          default_currency_code: input.defaultCurrencyCode || 'INR',
          tenant_status: 'ACTIVE',
        },
      });

      // Default tenant settings
      await tx.rndtechnosoft_tenant_settings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          settings: {
            payroll: {
              payFrequency: 'MONTHLY',
              currency: input.defaultCurrencyCode || 'INR',
              workingDaysPerMonth: 30,
            },
            timezone: 'Asia/Kolkata',
          },
        },
      });

      return tenant;
    });
  }

  async getTenantById(tenantId: string) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      include: {
        rndtechnosoft_tenant_settings: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant not found`);
    }

    return tenant;
  }

  async updateSettings(tenantId: string, settings: Record<string, unknown>) {
    await this.getTenantById(tenantId);

    return this.prisma.rndtechnosoft_tenant_settings.upsert({
      where: { tenant_id: tenantId },
      update: {
        settings: settings as Prisma.InputJsonValue,
      },
      create: {
        id: randomUUID(),
        tenant_id: tenantId,
        settings: settings as Prisma.InputJsonValue,
      },
    });
  }

  // ════════════════════════════════════════════════════════════════
  // 1. FULL ORGANIZATION SETTINGS (Profile, SMTP, WhatsApp, Quotas)
  // ════════════════════════════════════════════════════════════════

  async getTenantSettings(tenantId: string) {
    const [tenant, tenantSetting, quotas] = await Promise.all([
      this.prisma.rndtechnosoft_tenants.findUnique({
        where: { id: tenantId },
      }),
      this.prisma.rndtechnosoft_tenant_settings.findUnique({
        where: { tenant_id: tenantId },
      }),
      this.prisma.rndtechnosoft_tenant_quotas.findUnique({
        where: { tenant_id: tenantId },
      }),
    ]);

    const settingsJson: any = (tenantSetting?.settings as any) || {};
    const profile = settingsJson.profile || {};
    const smtp = settingsJson.smtp || null;
    const whatsapp = settingsJson.whatsapp || null;

    const mergedTenant = {
      id: tenantId,
      company_name: profile.company_name || tenant?.display_name || 'RND Technosoft',
      legal_name: profile.legal_name || tenant?.legal_name || 'RND Technosoft Private Limited',
      subdomain: profile.subdomain || 'rnd',
      custom_domain: profile.custom_domain || 'erp.rndtechnosoft.com',
      is_custom_domain_verified: profile.is_custom_domain_verified !== undefined ? profile.is_custom_domain_verified : true,
      primary_contact_name: profile.primary_contact_name || 'Ravi Shah',
      primary_contact_email: profile.primary_contact_email || 'ravi@rndtechnosoft.com',
      primary_contact_phone: profile.primary_contact_phone || '+919876543210',
      industry_type: profile.industry_type || 'DIGITAL_AGENCY',
      currency: profile.currency || tenant?.default_currency_code || 'INR',
      timezone: profile.timezone || 'Asia/Kolkata',
      tax_gstin: profile.tax_gstin || '27AABCU9603R1ZM',
      pan: profile.pan || 'AABCU9603R',
      company_address: profile.company_address || 'BKC Tech Park, Bandra East, Mumbai, Maharashtra — 400051',
      website_url: profile.website_url || 'https://rndtechnosoft.com',
      brand_logo_url: profile.brand_logo_url || '/voogyo-logo.svg',
      primary_color: profile.primary_color || '#2563EB',
      secondary_color: profile.secondary_color || '#1E40AF',
      max_seats: quotas?.user_seats_limit || 50,
      max_branches: quotas?.branch_limit || 5,
      storage_limit_mb: quotas?.storage_limit_mb || 51200,
      monthly_ai_token_quota: quotas?.monthly_ai_tokens || 2000000,
      monthly_whatsapp_quota: quotas?.monthly_whatsapp_credits || 10000,
    };

    return {
      tenant: mergedTenant,
      smtp: smtp
        ? {
            host: smtp.host || 'smtp.gmail.com',
            port: smtp.port || 587,
            username: smtp.username || '',
            hasPassword: Boolean(smtp.hasPassword || smtp.password),
            senderName: smtp.senderName || 'RND Technosoft Growth Team',
            senderEmail: smtp.senderEmail || 'outreach@rndtechnosoft.com',
            replyToEmail: smtp.replyToEmail || 'ravi@rndtechnosoft.com',
            encryption: smtp.encryption || 'TLS',
            isActive: smtp.isActive !== undefined ? smtp.isActive : true,
          }
        : null,
      whatsapp: whatsapp
        ? {
            provider: whatsapp.provider || 'META_CLOUD_API',
            wabaId: whatsapp.wabaId || '108922345678901',
            phoneNumberId: whatsapp.phoneNumberId || '103456789012345',
            senderPhoneNumber: whatsapp.senderPhoneNumber || '+919876543210',
            hasAccessToken: Boolean(whatsapp.hasAccessToken || whatsapp.accessToken),
            webhookVerifyToken: whatsapp.webhookVerifyToken || 'rnd_voogyo_verify_token_2026',
            isActive: whatsapp.isActive !== undefined ? whatsapp.isActive : true,
          }
        : null,
      quotas: quotas || {
        user_seats_limit: 50,
        branch_limit: 5,
        storage_limit_mb: 51200,
        monthly_ai_tokens: 2000000,
        monthly_whatsapp_credits: 10000,
      },
    };
  }

  async handleSettingsAction(tenantId: string, body: any) {
    const { action } = body;

    let tenantSetting = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
    });

    const currentSettings: any = (tenantSetting?.settings as any) || {};

    // ACTION 1: UPDATE PROFILE
    if (action === 'update_profile' || action === 'save_profile') {
      const company_name = body.company_name || body.companyName || currentSettings.profile?.company_name;
      const primary_contact_name = body.primary_contact_name || body.primaryContactName || '';
      const primary_contact_email = body.primary_contact_email || body.primaryContactEmail || '';
      const primary_contact_phone = body.primary_contact_phone || body.primaryContactPhone || '';
      const industry_type = body.industry_type || body.industryType || 'DIGITAL_AGENCY';
      const currency = body.currency || 'INR';
      const timezone = body.timezone || 'Asia/Kolkata';
      const tax_gstin = body.tax_gstin || body.taxGstin || '';
      const company_address = body.company_address || body.companyAddress || '';
      const website_url = body.website_url || body.websiteUrl || '';

      const updatedProfile = {
        ...(currentSettings.profile || {}),
        company_name,
        primary_contact_name,
        primary_contact_email,
        primary_contact_phone,
        industry_type,
        currency,
        timezone,
        tax_gstin,
        company_address,
        website_url,
      };

      currentSettings.profile = updatedProfile;

      await this.prisma.rndtechnosoft_tenant_settings.upsert({
        where: { tenant_id: tenantId },
        update: { settings: currentSettings },
        create: { id: randomUUID(), tenant_id: tenantId, settings: currentSettings },
      });

      await this.prisma.rndtechnosoft_tenants.update({
        where: { id: tenantId },
        data: {
          display_name: company_name,
          default_currency_code: currency,
        },
      });

      return {
        success: true,
        message: 'Organization profile updated successfully!',
        data: updatedProfile,
      };
    }

    // ACTION 2: SAVE SMTP
    if (action === 'save_smtp') {
      const {
        host,
        port = 587,
        username,
        password,
        senderName = 'Growth Team',
        senderEmail,
        replyToEmail = '',
        encryption = 'TLS',
        isActive = true,
      } = body;

      const existingSmtp = currentSettings.smtp || {};
      const finalPassword = password || existingSmtp.password || '';

      currentSettings.smtp = {
        host: (host || '').trim(),
        port: Number(port) || 587,
        username: (username || '').trim(),
        password: finalPassword,
        hasPassword: Boolean(finalPassword),
        senderName: (senderName || '').trim(),
        senderEmail: (senderEmail || '').trim(),
        replyToEmail: (replyToEmail || '').trim(),
        encryption,
        isActive: Boolean(isActive),
      };

      await this.prisma.rndtechnosoft_tenant_settings.upsert({
        where: { tenant_id: tenantId },
        update: { settings: currentSettings },
        create: { id: randomUUID(), tenant_id: tenantId, settings: currentSettings },
      });

      return {
        success: true,
        message: 'Tenant SMTP server settings saved successfully!',
      };
    }

    // ACTION 3: TEST SMTP
    if (action === 'test_smtp') {
      const { host, port, username, password, encryption } = body;
      const testHost = host || currentSettings.smtp?.host;
      if (!testHost) {
        throw new BadRequestException('SMTP host is required for testing');
      }

      let testPass = password || currentSettings.smtp?.password || '';
      const numPort = Number(port) || currentSettings.smtp?.port || 587;
      const isSecure = numPort === 465 || encryption === 'SSL';
      const testUser = username || currentSettings.smtp?.username || '';

      const startTime = Date.now();
      try {
        const transporter = nodemailer.createTransport({
          host: testHost.trim(),
          port: numPort,
          secure: isSecure,
          auth: testUser && testPass ? { user: testUser.trim(), pass: testPass.trim() } : undefined,
          connectionTimeout: 6000,
          greetingTimeout: 5000,
          tls: { rejectUnauthorized: false },
        });

        await transporter.verify();
        const latencyMs = Date.now() - startTime;
        return {
          success: true,
          data: {
            connected: true,
            server: testHost,
            port: numPort,
            latencyMs,
            message: `SMTP Connection Verified! Handshake with ${testHost}:${numPort} succeeded in ${latencyMs}ms.`,
          },
        };
      } catch (err: any) {
        const latencyMs = Date.now() - startTime;
        return {
          success: false,
          error: `SMTP Test Failed: ${err.message}`,
          latencyMs,
        };
      }
    }

    // ACTION 4: SAVE WHATSAPP
    if (action === 'save_whatsapp') {
      const {
        provider = 'META_CLOUD_API',
        wabaId,
        phoneNumberId,
        senderPhoneNumber,
        accessToken,
        webhookVerifyToken,
        isActive = true,
      } = body;

      const existingWa = currentSettings.whatsapp || {};
      const finalToken = accessToken || existingWa.accessToken || '';

      currentSettings.whatsapp = {
        provider,
        wabaId: (wabaId || '').trim(),
        phoneNumberId: (phoneNumberId || '').trim(),
        senderPhoneNumber: (senderPhoneNumber || '').trim(),
        accessToken: finalToken,
        hasAccessToken: Boolean(finalToken),
        webhookVerifyToken: webhookVerifyToken || 'rnd_voogyo_verify_token_2026',
        isActive: Boolean(isActive),
      };

      await this.prisma.rndtechnosoft_tenant_settings.upsert({
        where: { tenant_id: tenantId },
        update: { settings: currentSettings },
        create: { id: randomUUID(), tenant_id: tenantId, settings: currentSettings },
      });

      return {
        success: true,
        message: 'WhatsApp Business API credentials saved successfully!',
      };
    }

    // ACTION 5: TEST WHATSAPP
    if (action === 'test_whatsapp') {
      const { phoneNumberId, accessToken } = body;
      const targetPhoneId = phoneNumberId || currentSettings.whatsapp?.phoneNumberId;
      const targetToken = accessToken || currentSettings.whatsapp?.accessToken;

      if (!targetPhoneId || !targetToken) {
        throw new BadRequestException('Phone Number ID and Access Token are required for testing');
      }

      try {
        const metaRes = await fetch(`https://graph.facebook.com/v19.0/${targetPhoneId}`, {
          headers: { Authorization: `Bearer ${targetToken}` },
        });
        const metaData = await metaRes.json();

        if (metaData.error) {
          return {
            success: false,
            error: metaData.error.message || 'WhatsApp Cloud API authentication failed',
          };
        }

        return {
          success: true,
          message: `WhatsApp Cloud API Handshake Verified! Account: ${metaData.verified_name || metaData.display_phone_number || 'Business Account Active'}`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Failed to reach Meta WhatsApp API: ${err.message}`,
        };
      }
    }

    throw new BadRequestException(`Unknown action: ${action}`);
  }

  // ════════════════════════════════════════════════════════════════
  // 2. TENANT MODULE LICENSING
  // ════════════════════════════════════════════════════════════════

  async getModules(tenantId: string) {
    const [tenant, tenantSetting, quotas] = await Promise.all([
      this.prisma.rndtechnosoft_tenants.findUnique({ where: { id: tenantId } }),
      this.prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_tenant_quotas.findUnique({ where: { tenant_id: tenantId } }),
    ]);

    const settingsJson: any = (tenantSetting?.settings as any) || {};
    const modules = settingsJson.modules || [
      { id: 'CRM', name: 'CRM & Sales Automation Suite', category: 'Sales', is_core: true, is_enabled: true, sort_order: 1 },
      { id: 'HRMS', name: 'HRMS & Biometric Attendance', category: 'HR', is_core: true, is_enabled: true, sort_order: 2 },
      { id: 'PAYROLL', name: 'Statutory Payroll & Payslips', category: 'Payroll', is_core: true, is_enabled: true, sort_order: 3 },
      { id: 'PROJECTS', name: 'Agile Projects & Sprints', category: 'Operations', is_core: true, is_enabled: true, sort_order: 4 },
      { id: 'OPERATIONS', name: 'Client Vault & Credentials', category: 'Operations', is_core: true, is_enabled: true, sort_order: 5 },
      { id: 'FINANCE', name: 'GST Invoicing & General Ledger', category: 'Finance', is_core: true, is_enabled: true, sort_order: 6 },
      { id: 'AI', name: 'AI Business Copilot', category: 'Intelligence', is_core: true, is_enabled: true, sort_order: 7 },
    ];

    const usersCount = await this.prisma.rndtechnosoft_tenant_members.count({
      where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
    });
    const leadsCount = await this.prisma.rndtechnosoft_crm_leads.count({
      where: { tenant_id: tenantId },
    });

    return {
      tenant: {
        id: tenantId,
        company_name: tenant?.display_name || 'RND Technosoft',
        subdomain: 'rnd',
        industry_type: 'DIGITAL_AGENCY',
        status: 'ACTIVE',
        max_seats: quotas?.user_seats_limit || 50,
        storage_limit_mb: quotas?.storage_limit_mb || 51200,
        monthly_ai_token_quota: quotas?.monthly_ai_tokens || 2000000,
        monthly_whatsapp_quota: quotas?.monthly_whatsapp_credits || 10000,
        plan_name: 'Scale Unlimited Enterprise',
        plan_code: 'SCALE',
        seats_used: usersCount,
        leads_count: leadsCount,
      },
      modules,
    };
  }

  async toggleModule(tenantId: string, moduleId: string, isEnabled: boolean) {
    let tenantSetting = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson: any = (tenantSetting?.settings as any) || {};
    let modules: any[] = settingsJson.modules || [];

    const modIndex = modules.findIndex((m: any) => m.id === moduleId);
    if (modIndex >= 0) {
      modules[modIndex].is_enabled = isEnabled;
    } else {
      modules.push({ id: moduleId, is_enabled: isEnabled });
    }

    settingsJson.modules = modules;

    await this.prisma.rndtechnosoft_tenant_settings.upsert({
      where: { tenant_id: tenantId },
      update: { settings: settingsJson },
      create: { id: randomUUID(), tenant_id: tenantId, settings: settingsJson },
    });

    return {
      success: true,
      message: `Module '${moduleId}' ${isEnabled ? 'enabled' : 'disabled'} for your workspace.`,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // 3. ROLES & RBAC MATRIX
  // ════════════════════════════════════════════════════════════════

  async getRoles(tenantId: string) {
    const roles = await this.prisma.rndtechnosoft_roles.findMany({
      where: { tenant_id: tenantId, role_status: 'ACTIVE' },
      include: {
        rndtechnosoft_tenant_member_roles: {
          include: { rndtechnosoft_tenant_members: true },
        },
        rndtechnosoft_role_permissions: {
          include: { rndtechnosoft_permissions: true },
        },
      },
      orderBy: [{ is_system_role: 'desc' }, { created_at: 'asc' }],
    });

    const rolesWithPerms = roles.map((r) => {
      const permMap: Record<string, Record<string, boolean>> = {};

      r.rndtechnosoft_role_permissions.forEach((rp) => {
        const perm = rp.rndtechnosoft_permissions;
        if (!perm) return;
        const mod = perm.module_code;
        const act = perm.permission_code.replace(`${mod}_`, '');

        if (!permMap[mod]) permMap[mod] = {};
        permMap[mod][act] = true;
      });

      return {
        id: r.id,
        role_code: r.role_code,
        code: r.role_code,
        role_name: r.role_name,
        name: r.role_name,
        description: r.description,
        is_system: r.is_system_role,
        is_system_role: r.is_system_role,
        users_count: r.rndtechnosoft_tenant_member_roles.length,
        permissions: permMap,
      };
    });

    return { roles: rolesWithPerms };
  }

  async createRole(tenantId: string, body: { name: string; code?: string; description?: string }) {
    const { name, code, description = '' } = body;
    if (!name) {
      throw new BadRequestException('Role name is required');
    }

    const cleanCode = (code || name).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const existing = await this.prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: cleanCode },
    });
    if (existing) {
      throw new ConflictException(`Role with code '${cleanCode}' already exists`);
    }

    const role = await this.prisma.rndtechnosoft_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        role_code: cleanCode,
        role_name: name.trim(),
        description: description.trim(),
        is_system_role: false,
        role_status: 'ACTIVE',
      },
    });

    // Seed default view/create permissions for this new role
    const actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];
    for (const mod of ['CRM', 'HRMS', 'PROJECTS', 'FINANCE', 'PAYROLL', 'AI']) {
      for (const act of actions) {
        if (['VIEW', 'CREATE'].includes(act)) {
          const perm = await this.prisma.rndtechnosoft_permissions.findUnique({
            where: { permission_code: `${mod}_${act}` },
          });
          if (perm) {
            await this.prisma.rndtechnosoft_role_permissions.create({
              data: {
                id: randomUUID(),
                tenant_id: tenantId,
                role_id: role.id,
                permission_id: perm.id,
              },
            });
          }
        }
      }
    }

    return {
      success: true,
      message: `Role '${name}' created successfully`,
      data: role,
    };
  }

  async updateRolePermission(tenantId: string, body: { roleId: string; moduleId: string; action: string; isAllowed: boolean }) {
    const { roleId, moduleId, action, isAllowed } = body;
    const permCode = `${moduleId}_${action}`;

    let perm = await this.prisma.rndtechnosoft_permissions.findUnique({
      where: { permission_code: permCode },
    });
    if (!perm) {
      perm = await this.prisma.rndtechnosoft_permissions.create({
        data: {
          id: randomUUID(),
          permission_code: permCode,
          module_code: moduleId,
          permission_name: `${action} ${moduleId}`,
        },
      });
    }

    if (isAllowed) {
      const existing = await this.prisma.rndtechnosoft_role_permissions.findFirst({
        where: { tenant_id: tenantId, role_id: roleId, permission_id: perm.id },
      });
      if (!existing) {
        await this.prisma.rndtechnosoft_role_permissions.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            role_id: roleId,
            permission_id: perm.id,
          },
        });
      }
    } else {
      await this.prisma.rndtechnosoft_role_permissions.deleteMany({
        where: { tenant_id: tenantId, role_id: roleId, permission_id: perm.id },
      });
    }

    return { success: true, message: 'Permission updated successfully' };
  }

  // ════════════════════════════════════════════════════════════════
  // 4. USERS & WORKSPACE DIRECTORY
  // ════════════════════════════════════════════════════════════════

  async getUsers(tenantId: string) {
    const members = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
      include: {
        rndtechnosoft_users: true,
        rndtechnosoft_tenant_member_roles: {
          include: { rndtechnosoft_roles: true },
        },
      },
      orderBy: { joined_at: 'asc' },
    });

    return members.map((m) => {
      const u = m.rndtechnosoft_users;
      const roleAssoc = m.rndtechnosoft_tenant_member_roles[0];
      const roleObj = roleAssoc?.rndtechnosoft_roles;
      const nameParts = (u.display_name || '').split(' ');

      return {
        id: u.id,
        member_id: m.id,
        first_name: nameParts[0] || 'User',
        last_name: nameParts.slice(1).join(' ') || '',
        name: u.display_name,
        display_name: u.display_name,
        email: u.email,
        phone: u.mobile_number || '',
        role_id: roleObj?.id || '',
        role_code: roleObj?.role_code || 'EMPLOYEE',
        role_name: roleObj?.role_name || 'Team Member',
        designation: roleObj?.role_name || 'Team Member',
        is_active: u.user_status === 'ACTIVE',
        user_status: u.user_status,
        created_at: m.joined_at,
      };
    });
  }

  async createUser(tenantId: string, body: any) {
    const email = body.email;
    const firstName = body.first_name || body.firstName;
    const lastName = body.last_name || body.lastName;
    const roleId = body.role_id || body.roleId;
    const roleCode = body.role_code || body.roleCode;
    const phone = body.phone || body.mobile_number || body.mobileNumber;
    const designation = body.designation;

    if (!email) {
      throw new BadRequestException('User email is required');
    }

    let user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: email.trim().toLowerCase() },
    });

    const displayName = `${firstName || ''} ${lastName || ''}`.trim() || email.split('@')[0];

    if (!user) {
      user = await this.prisma.rndtechnosoft_users.create({
        data: {
          id: randomUUID(),
          email: email.trim().toLowerCase(),
          password_hash: hashPassword('Voogyo@2026!'),
          display_name: displayName,
          mobile_number: phone || null,
          user_status: 'ACTIVE',
        },
      });
    }

    let member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: user.id },
    });

    if (!member) {
      member = await this.prisma.rndtechnosoft_tenant_members.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          user_id: user.id,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });
    }

    // Role assignment
    let targetRoleId = roleId;
    if (!targetRoleId && roleCode) {
      const role = await this.prisma.rndtechnosoft_roles.findFirst({
        where: { tenant_id: tenantId, role_code: roleCode },
      });
      targetRoleId = role?.id;
    }

    if (targetRoleId) {
      await this.prisma.rndtechnosoft_tenant_member_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          tenant_member_id: member.id,
          role_id: targetRoleId,
        },
      });
    }

    return {
      success: true,
      message: `User '${displayName}' added to workspace successfully.`,
      data: { id: user.id, member_id: member.id, email: user.email, display_name: displayName },
    };
  }

  async updateUser(tenantId: string, id: string, body: any) {
    const firstName = body.first_name || body.firstName;
    const lastName = body.last_name || body.lastName;
    const roleId = body.role_id || body.roleId;
    const roleCode = body.role_code || body.roleCode;
    const phone = body.phone || body.mobile_number || body.mobileNumber;
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : (body.isActive !== undefined ? Boolean(body.isActive) : undefined);

    const displayName = (firstName || lastName) ? `${firstName || ''} ${lastName || ''}`.trim() : undefined;

    await this.prisma.rndtechnosoft_users.update({
      where: { id },
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(phone !== undefined ? { mobile_number: phone } : {}),
        ...(isActive !== undefined ? { user_status: isActive ? 'ACTIVE' : 'INACTIVE' } : {}),
      },
    });

    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: id },
    });

    if (member && (roleId || roleCode)) {
      let targetRoleId = roleId;
      if (!targetRoleId && roleCode) {
        const role = await this.prisma.rndtechnosoft_roles.findFirst({
          where: { tenant_id: tenantId, role_code: roleCode },
        });
        targetRoleId = role?.id;
      }

      if (targetRoleId) {
        await this.prisma.rndtechnosoft_tenant_member_roles.deleteMany({
          where: { tenant_id: tenantId, tenant_member_id: member.id },
        });
        await this.prisma.rndtechnosoft_tenant_member_roles.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            tenant_member_id: member.id,
            role_id: targetRoleId,
          },
        });
      }
    }

    return { success: true, message: 'User updated successfully' };
  }

  async deleteUser(tenantId: string, id: string) {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: id },
    });

    if (member) {
      await this.prisma.rndtechnosoft_tenant_member_roles.deleteMany({
        where: { tenant_id: tenantId, tenant_member_id: member.id },
      });
      await this.prisma.rndtechnosoft_tenant_members.update({
        where: { id: member.id },
        data: { membership_status: 'ARCHIVED' },
      });
    }

    return { success: true, message: 'User archived from workspace' };
  }
}
