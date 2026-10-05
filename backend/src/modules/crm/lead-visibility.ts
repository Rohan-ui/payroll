import { Prisma } from '@prisma/client';
import { PermissionKey } from '@/common/access/access-catalog';

/** Lets a member see every lead of the workspace: unassigned leads and other members' leads too. */
export const VIEW_ALL_LEADS: PermissionKey = 'leads.view_all';

/**
 * Which leads a member sees and works on: every lead of the workspace with
 * leads.view_all, otherwise only the leads assigned to them. Decided from the
 * member's role permissions on every request, never from the browser.
 */
export type LeadVisibility = { all: true } | { all: false; memberId: string };

export const leadVisibility = (permissions: readonly string[], memberId: string): LeadVisibility =>
  permissions.includes(VIEW_ALL_LEADS) ? { all: true } : { all: false, memberId };

/** The lead filter for a member's visibility. */
export const visibleLeads = (visibility: LeadVisibility): Prisma.rndtechnosoft_crm_leadsWhereInput =>
  visibility.all ? {} : { assigned_tenant_member_id: visibility.memberId };

/** The filter for records that belong to a lead: activities, follow-ups, meetings, quotations. */
export const onVisibleLead = (visibility: LeadVisibility) =>
  visibility.all ? {} : { rndtechnosoft_crm_leads: { assigned_tenant_member_id: visibility.memberId } };
