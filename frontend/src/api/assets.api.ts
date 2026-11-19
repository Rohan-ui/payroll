import { apiClient } from './client';

/** Company assets given to employees: handed over, then returned, lost, waived or cancelled. */

interface Envelope<T> { success: boolean; data: T; message?: string }
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export const ASSET_CATEGORIES = {
  LAPTOP: 'Laptop', DESKTOP: 'Desktop', MONITOR: 'Monitor', MOBILE_PHONE: 'Mobile phone', SIM_CARD: 'SIM card',
  ID_CARD: 'ID card', ACCESS_CARD: 'Access card', KEYS: 'Keys', OTHER: 'Other',
} as const;
export type AssetCategory = keyof typeof ASSET_CATEGORIES;
export type AssetTeam = 'IT' | 'ADMIN';
/** Mirrors the server: IT looks after equipment, Admin after cards, keys and the rest. */
export const ASSET_TEAM: Record<AssetCategory, AssetTeam> = {
  LAPTOP: 'IT', DESKTOP: 'IT', MONITOR: 'IT', MOBILE_PHONE: 'IT', SIM_CARD: 'IT', ID_CARD: 'ADMIN', ACCESS_CARD: 'ADMIN', KEYS: 'ADMIN', OTHER: 'ADMIN',
};
export type AssetStatus = 'ISSUED' | 'RETURNED' | 'LOST' | 'WAIVED' | 'CANCELLED';

export interface EmployeeAsset {
  id: string;
  category: AssetCategory;
  team: AssetTeam;
  name: string;
  tag: string | null;
  assignedDate: string;
  returnDueDate: string | null;
  status: AssetStatus;
  returnDate: string | null;
  condition: 'GOOD' | 'DAMAGED' | null;
  /** Rupees as a decimal string. */
  recoveryAmount: string | null;
  remarks: string | null;
  assignedBy: string | null;
  returnRecordedBy: string | null;
  returnRecordedAt: string | null;
  /** Whether the signed-in member's team looks after it. */
  canManage: boolean;
}

export interface AssetList { items: EmployeeAsset[]; canAssign: Record<AssetTeam, boolean>; employeeActive: boolean }

export interface LeaverAsset extends EmployeeAsset {
  employeeId: string;
  separationId: string | null;
  lastWorkingDate: string | null;
  employee: { name: string; code: string };
}

export interface AssignAssetInput { category: AssetCategory; name: string; tag?: string; assignedDate: string; returnDueDate?: string; remarks?: string }
export interface AssetReturnInput { status: 'RETURNED' | 'LOST' | 'WAIVED'; returnDate: string; condition?: 'GOOD' | 'DAMAGED'; recoveryAmount?: string; remarks?: string }

const base = (employeeId: string) => `/employees/${employeeId}/assets`;

export const assetsApi = {
  list: (employeeId: string) => data(apiClient.get<Envelope<AssetList>>(base(employeeId))),
  forExit: (separationId: string) => data(apiClient.get<Envelope<AssetList & { employeeId: string }>>(`/offboarding/separations/${separationId}/assets`)),
  assign: (employeeId: string, input: AssignAssetInput) => data(apiClient.post<Envelope<AssetList>>(base(employeeId), input)),
  recordReturn: (employeeId: string, assetId: string, input: AssetReturnInput) => data(apiClient.put<Envelope<AssetList>>(`${base(employeeId)}/${assetId}/return`, input)),
  reopen: (employeeId: string, assetId: string, reason: string) => data(apiClient.post<Envelope<AssetList>>(`${base(employeeId)}/${assetId}/reopen`, { reason })),
  cancel: (employeeId: string, assetId: string, reason: string) => data(apiClient.post<Envelope<AssetList>>(`${base(employeeId)}/${assetId}/cancel`, { reason })),
  /** Assets still with people who are leaving, for the teams the member looks after. */
  leavers: () => data(apiClient.get<Envelope<LeaverAsset[]>>('/offboarding/checklist/assets')),
  leaverReturn: (assetId: string, input: AssetReturnInput) => data(apiClient.put<Envelope<LeaverAsset[]>>(`/offboarding/checklist/assets/${assetId}/return`, input)),
};
