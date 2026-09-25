import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { MODULES, ModuleCode } from '@/common/access/access-catalog';

/** Tenant statuses the platform understands: tenant sign-in accepts ACTIVE and TRIALING, and refuses the rest. */
export const TENANT_STATUSES = ['ACTIVE', 'TRIALING', 'SUSPENDED'] as const;
/** The values rndtechnosoft_users.user_status allows (database CHECK). */
export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED', 'INVITED'] as const;
/** The values rndtechnosoft_tenant_members.membership_status allows (database CHECK). */
export const MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'ARCHIVED'] as const;

export const TENANT_SORTS = ['created', 'name', 'code', 'status', 'lastActivity', 'members'] as const;
export const USER_SORTS = ['created', 'name', 'email', 'lastLogin', 'lastActivity'] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type TenantSort = (typeof TENANT_SORTS)[number];
export type UserSort = (typeof USER_SORTS)[number];

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toInt = ({ value }: { value: unknown }) =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class PageQueryDto {
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class TenantListQueryDto extends PageQueryDto {
  /** Matches workspace name, legal name and code, and the owner's name and email. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(TENANT_STATUSES)
  status?: TenantStatus;

  /** A plan code from rndtechnosoft_plans. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  plan?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Z_]{1,32}$/, { message: 'Choose a valid subscription status.' })
  subscriptionStatus?: string;

  @IsOptional()
  @IsIn(MODULES.map((m) => m.code))
  module?: ModuleCode;

  /** With `module`: whether it must be on (default) or off. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  moduleEnabled?: boolean;

  @IsOptional()
  @IsISO8601({ strict: true })
  createdFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  createdTo?: string;

  @IsOptional()
  @IsIn(TENANT_SORTS)
  sort?: TenantSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class UserListQueryDto extends PageQueryDto {
  /** Matches name, email and phone, and the name or code of any workspace the user belongs to. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Only users with a membership in this workspace. */
  @IsOptional()
  @IsUUID('all')
  tenantId?: string;

  /** Only users holding a role with this code (in `tenantId` when given). */
  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9_]{1,64}$/, { message: 'Choose a valid role.' })
  roleCode?: string;

  /** The global account status, which applies across every workspace. */
  @IsOptional()
  @IsIn(ACCOUNT_STATUSES)
  accountStatus?: AccountStatus;

  /** The status of a membership (in `tenantId` when given). */
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES)
  membershipStatus?: MembershipStatus;

  @IsOptional()
  @IsIn(USER_SORTS)
  sort?: UserSort;

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class RoleOptionsQueryDto {
  @IsOptional()
  @IsUUID('all')
  tenantId?: string;
}

export const DOMAIN_STATUSES = ['PENDING', 'PROVISIONING', 'ACTIVE', 'FAILED'] as const;

export class DomainListQueryDto extends PageQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(DOMAIN_STATUSES)
  status?: (typeof DOMAIN_STATUSES)[number];
}
