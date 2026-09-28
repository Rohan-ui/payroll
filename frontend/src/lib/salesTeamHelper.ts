import { apiFetch } from '../api/client';
export interface SalesHeadProfile {
  id: string;
  name: string;
  email: string;
  designation: string;
}

export const DEFAULT_SALES_HEAD_ID = 'user_saloni';
export const DEFAULT_SALES_HEAD_NAME = 'Saloni Shah';
export const DEFAULT_SALES_HEAD_DESIGNATION = 'Director of Sales & Business Development';

/**
 * Returns the primary Sales Team Head for a tenant.
 * Defaults to Saloni Shah (Director of Sales & Business Development) if defined,
 * or queries for the highest ranking sales lead in the tenant.
 */
export async function getSalesTeamHead(_tenantId?: string): Promise<SalesHeadProfile> {
  try {
    const res = await apiFetch('/api/v1/users');
    const data = await res.json();
    if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
      const u = data.data[0];
      return {
        id: u.id,
        name: `${u.first_name || u.displayName || ''} ${u.last_name || ''}`.trim(),
        email: u.email,
        designation: u.designation || DEFAULT_SALES_HEAD_DESIGNATION,
      };
    }
  } catch (err: any) {
    console.error('Error fetching sales team head:', err?.message);
  }

  return {
    id: DEFAULT_SALES_HEAD_ID,
    name: DEFAULT_SALES_HEAD_NAME,
    email: 'saloni@rndtechnosoft.com',
    designation: DEFAULT_SALES_HEAD_DESIGNATION,
  };
}
