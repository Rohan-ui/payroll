export interface SuperAdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export interface TenantQuota {
  id: string;
  tenantId: string;
  userSeatsLimit: number;
  branchLimit: number;
  storageLimitMb: number;
  monthlyAiTokens: number;
  monthlyWhatsappCredits: number;
}

export interface SuperAdminTenant {
  id: string;
  legalName: string;
  displayName: string;
  tenantCode: string;
  tenantStatus: 'ACTIVE' | 'TRIALING' | 'SUSPENDED' | 'PAST_DUE';
  createdAt: string;
  subscriptionPlan?: {
    id: string;
    planName: string;
    planCode: string;
  };
  quotas?: TenantQuota;
  _count?: {
    rndtechnosoft_employees?: number;
    rndtechnosoft_tenant_members?: number;
  };
}

export interface AnalyticsOverview {
  kpi?: {
    totalTenants: number;
    activeTenants: number;
    trialingTenants: number;
    suspendedTenants: number;
    totalUsers: number;
    estimatedMrr: number;
    estimatedArr: number;
    netChurnRate: number;
    systemHealth: string;
  };
  totalTenants?: number;
  activeTenants?: number;
  trialingTenants?: number;
  suspendedTenants?: number;
  totalUsers?: number;
  estimatedMrr?: number;
  estimatedArr?: number;
  moduleRevenue?: Array<{ name?: string; module?: string; monthlyInr?: number; mrr?: number; percentage: number }>;
  industryBreakdown?: Array<{ industry: string; count: number; percentage: number }>;
  tenantGrowth?: Array<{ month: string; tenants: number }>;
  recentLogs: Array<{
    id: string;
    action: string;
    category: string;
    description: string;
    created_at: string;
    rndtechnosoft_super_admins?: {
      display_name: string;
      email: string;
    };
  }>;
}

export interface PlatformInvoice {
  id: string;
  invoice_number: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency_code: string;
  invoice_status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED';
  due_date: string;
  paid_at?: string;
  rndtechnosoft_tenants?: {
    legal_name: string;
    display_name: string;
    tenant_code: string;
  };
}

export interface PlatformCoupon {
  id: string;
  coupon_code: string;
  discount_type: 'PERCENTAGE' | 'FIXED';
  discount_value: number;
  max_uses?: number;
  used_count: number;
  valid_from: string;
  valid_until?: string;
  is_active: boolean;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  category: string;
  description: string;
  created_at: string;
  rndtechnosoft_tenants?: {
    legal_name: string;
    tenant_code: string;
  };
}
