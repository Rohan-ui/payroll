import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { ActivityQueryDto, CreateCouponDto, StatusPageQueryDto, WebsiteSettingsDto } from './dto/platform-settings.dto';
import { TenantQuotasDto } from './dto/provision-tenant.dto';
import { PageQueryDto } from './dto/platform-directory.dto';

export interface PlatformActionContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(adminId: string) {
    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        display_name: true,
        role: true,
        is_active: true,
        last_login_at: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Super Admin not found');
    }

    return admin;
  }

  async updateTenantQuotas(tenantId: string, quotas: TenantQuotasDto, adminId: string, context: PlatformActionContext) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new NotFoundException('Workspace not found.');

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.rndtechnosoft_tenant_quotas.findUnique({ where: { tenant_id: tenantId } });
      const saved = await tx.rndtechnosoft_tenant_quotas.upsert({
        where: { tenant_id: tenantId },
        update: {
          user_seats_limit: quotas.userSeatsLimit,
          branch_limit: quotas.branchLimit,
          storage_limit_mb: quotas.storageLimitMb,
          monthly_ai_tokens: quotas.monthlyAiTokens,
          monthly_whatsapp_credits: quotas.monthlyWhatsappCredits,
          updated_at: new Date(),
        },
        create: {
          id: randomUUID(),
          tenant_id: tenantId,
          user_seats_limit: quotas.userSeatsLimit ?? 25,
          branch_limit: quotas.branchLimit ?? 3,
          storage_limit_mb: quotas.storageLimitMb ?? 25600,
          monthly_ai_tokens: quotas.monthlyAiTokens ?? 250000,
          monthly_whatsapp_credits: quotas.monthlyWhatsappCredits ?? 1000,
        },
      });
      await tx.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: adminId,
          category: 'TENANT',
          action: 'TENANT_QUOTAS_UPDATED',
          target_tenant_id: tenantId,
          description: 'Updated workspace limits',
          metadata: {
            before: before
              ? { userSeatsLimit: before.user_seats_limit, branchLimit: before.branch_limit, storageLimitMb: before.storage_limit_mb }
              : null,
            after: { userSeatsLimit: saved.user_seats_limit, branchLimit: saved.branch_limit, storageLimitMb: saved.storage_limit_mb },
          },
          ip_address: context.ipAddress ? context.ipAddress.slice(0, 64) : null,
          user_agent: context.userAgent ? context.userAgent.slice(0, 255) : null,
        },
      });
      return saved;
    });
  }

  async getWorkspaceAdmins(query: PageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = {
      rndtechnosoft_tenant_member_roles: {
        some: {
          rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE },
        },
      },
    };
    const [members, total] = await Promise.all([
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          rndtechnosoft_users: true,
          rndtechnosoft_tenants: true,
        },
      }),
      this.prisma.rndtechnosoft_tenant_members.count({ where }),
    ]);

    return {
      items: members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        tenant_id: m.tenant_id,
        name: m.rndtechnosoft_users.display_name,
        email: m.rndtechnosoft_users.email,
        company_name: m.rndtechnosoft_tenants.display_name || m.rndtechnosoft_tenants.legal_name,
        status: m.membership_status,
        created_at: m.created_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  /** Package definitions saved by platform operators. Not yet linked to plans or subscriptions. */
  async getPackages() {
    const saved = await this.prisma.rndtechnosoft_platform_settings.findUnique({
      where: { setting_key: 'saas_packages' },
      select: { setting_value: true, updated_at: true },
    });
    const packages = Array.isArray(saved?.setting_value) ? saved.setting_value : [];
    return { packages, updatedAt: saved?.updated_at ?? null };
  }

  async getActivityLogs(query: ActivityQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.rndtechnosoft_platform_activity_logsWhereInput = {
      ...(query.category ? { category: query.category } : {}),
      ...(query.search ? { description: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [items, total, categories] = await Promise.all([
      this.prisma.rndtechnosoft_platform_activity_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          created_at: true,
          category: true,
          action: true,
          description: true,
          target_tenant_id: true,
          ip_address: true,
          rndtechnosoft_super_admins: { select: { display_name: true } },
        },
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.count({ where }),
      this.prisma.rndtechnosoft_platform_activity_logs.findMany({
        distinct: ['category'],
        orderBy: { category: 'asc' },
        select: { category: true },
      }),
    ]);
    return {
      items: items.map((entry) => ({
        id: entry.id,
        occurredAt: entry.created_at,
        category: entry.category,
        action: entry.action,
        description: entry.description,
        targetTenantId: entry.target_tenant_id,
        ipAddress: entry.ip_address,
        actor: entry.rndtechnosoft_super_admins?.display_name ?? null,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      categories: categories.map((row) => row.category),
    };
  }

  /** The public website's copy and SEO fields, as saved. Unsaved fields are null. */
  async getWebsiteSettings() {
    const saved = await this.prisma.rndtechnosoft_platform_settings.findUnique({
      where: { setting_key: 'website_settings' },
      select: { setting_value: true, updated_at: true },
    });
    const value = (saved?.setting_value && typeof saved.setting_value === 'object' ? saved.setting_value : {}) as Record<string, unknown>;
    const field = (key: string) => (typeof value[key] === 'string' && value[key] !== '' ? (value[key] as string) : null);
    return {
      hero_title: field('hero_title'),
      hero_subtitle: field('hero_subtitle'),
      contact_email: field('contact_email'),
      contact_phone: field('contact_phone'),
      brand_color: field('brand_color'),
      seo_meta_title: field('seo_meta_title'),
      seo_meta_description: field('seo_meta_description'),
      updatedAt: saved?.updated_at ?? null,
    };
  }

  async saveWebsiteSettings(data: WebsiteSettingsDto, adminId: string) {
    const value = {
      hero_title: data.hero_title ?? null,
      hero_subtitle: data.hero_subtitle ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      brand_color: data.brand_color ?? null,
      seo_meta_title: data.seo_meta_title ?? null,
      seo_meta_description: data.seo_meta_description ?? null,
    };
    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_platform_settings.upsert({
        where: { setting_key: 'website_settings' },
        update: { setting_value: value, updated_at: new Date() },
        create: {
          id: randomUUID(),
          setting_category: 'WEBSITE',
          setting_key: 'website_settings',
          setting_value: value,
          description: 'Platform landing website copy and SEO fields',
        },
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: adminId,
          category: 'SETTINGS',
          action: 'WEBSITE_SETTINGS_UPDATED',
          description: 'Updated the website copy and SEO fields',
        },
      }),
    ]);
    return this.getWebsiteSettings();
  }

  async getPlatformInvoices(query: StatusPageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = query.status ? { invoice_status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_platform_invoices.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { rndtechnosoft_tenants: { select: { id: true, legal_name: true, display_name: true, tenant_code: true } } },
      }),
      this.prisma.rndtechnosoft_platform_invoices.count({ where }),
    ]);
    return {
      // Amounts stay decimal strings end to end.
      items: rows.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        workspace: {
          tenantId: inv.tenant_id,
          tenantCode: inv.rndtechnosoft_tenants.tenant_code,
          name: inv.rndtechnosoft_tenants.display_name || inv.rndtechnosoft_tenants.legal_name,
        },
        periodStart: inv.billing_period_start,
        periodEnd: inv.billing_period_end,
        subtotal: inv.subtotal.toString(),
        tax: inv.tax_amount.toString(),
        discount: inv.discount_amount.toString(),
        total: inv.total_amount.toString(),
        currency: inv.currency_code,
        status: inv.invoice_status,
        dueDate: inv.due_date,
        paidAt: inv.paid_at,
        paymentGateway: inv.payment_gateway,
        createdAt: inv.created_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getCoupons(query: PageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const [coupons, total] = await Promise.all([
      this.prisma.rndtechnosoft_platform_coupons.findMany({
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.rndtechnosoft_platform_coupons.count(),
    ]);
    return {
      items: coupons.map((c) => ({
        id: c.id,
        code: c.coupon_code,
        discountType: c.discount_type,
        discountValue: c.discount_value.toString(),
        maxUses: c.max_uses,
        usedCount: c.used_count,
        validFrom: c.valid_from,
        validUntil: c.valid_until,
        isActive: c.is_active,
        createdAt: c.created_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async createCoupon(data: CreateCouponDto, adminId: string) {
    if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
      throw new BadRequestException('A percentage discount cannot be more than 100.');
    }
    const existing = await this.prisma.rndtechnosoft_platform_coupons.count({ where: { coupon_code: data.couponCode } });
    if (existing > 0) throw new BadRequestException('A coupon with this code already exists.');

    const id = randomUUID();
    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_platform_coupons.create({
        data: {
          id,
          coupon_code: data.couponCode,
          discount_type: data.discountType,
          discount_value: new Prisma.Decimal(data.discountValue.toFixed(2)),
          max_uses: data.maxUses ?? null,
          valid_from: new Date(),
          valid_until: data.validUntil ? new Date(data.validUntil) : null,
        },
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: adminId,
          category: 'BILLING',
          action: 'COUPON_CREATED',
          description: `Created coupon ${data.couponCode}`,
          metadata: { couponId: id },
        },
      }),
    ]);
    return (await this.getCoupons({ page: 1, pageSize: 25 })).items.find((coupon) => coupon.id === id);
  }

  async getSupportTickets(query: StatusPageQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_platform_support_tickets.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { rndtechnosoft_tenants: { select: { id: true, legal_name: true, display_name: true, tenant_code: true } } },
      }),
      this.prisma.rndtechnosoft_platform_support_tickets.count({ where }),
    ]);
    return {
      items: rows.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        subject: ticket.subject,
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
        workspace: {
          tenantId: ticket.tenant_id,
          tenantCode: ticket.rndtechnosoft_tenants.tenant_code,
          name: ticket.rndtechnosoft_tenants.display_name || ticket.rndtechnosoft_tenants.legal_name,
        },
        createdAt: ticket.created_at,
        resolvedAt: ticket.resolved_at,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
