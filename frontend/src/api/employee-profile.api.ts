import { apiClient, apiFetch } from './client';
import { fetchFile } from './onboarding.api';

interface Envelope<T> { success: boolean; data: T; message?: string }
const data = <T>(p: Promise<Envelope<T>>) => p.then((r) => r.data);

export interface Named { id: string; name: string }

export interface EmploymentRecord {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  joiningDate: string;
  confirmationDate: string | null;
  probationEndDate: string | null;
  noticePeriodDays: number | null;
  employmentStatus: string;
  department: Named | null;
  designation: Named | null;
  branch: Named | null;
  employmentType: Named | null;
}

export interface Address {
  type: 'CURRENT' | 'PERMANENT';
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  countryCode: string | null;
  validFrom: string | null;
}

export interface EmergencyContact {
  id: string;
  contactName: string;
  relationship: string | null;
  mobileNumber: string;
  alternateMobileNumber: string | null;
  email: string | null;
  isPrimary: boolean;
}

export interface PersonalDetails {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  preferredName: string | null;
  fullName: string;
  dateOfBirth: string | null;
  genderCode: string | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  nationalityCountryCode: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  workMobile: string | null;
  personalMobile: string | null;
  alternateMobile: string | null;
}

export interface EmployeeProfile {
  id: string;
  employeeCode: string;
  employeeStatus: string;
  hireDate: string | null;
  exitDate: string | null;
  hasSignIn: boolean;
  personal: PersonalDetails;
  addresses: Address[];
  emergencyContacts: EmergencyContact[];
  employment: EmploymentRecord | null;
  upcomingEmployment: EmploymentRecord | null;
  employmentHistory: EmploymentRecord[];
  manager: { id: string; employeeCode: string; name: string } | null;
  directReports: { id: string; employeeCode: string; name: string; employeeStatus: string }[];
  bankAccount: {
    accountHolderName: string;
    bankName: string;
    branchName: string | null;
    accountNumberLast4: string | null;
    ifsc: string | null;
    accountType: string | null;
    effectiveFrom: string;
  } | null;
  canSeeBankAccount: boolean;
}

/** Only the fields being changed; null clears an optional one. */
export type PersonalInput = Partial<{ [K in Exclude<keyof PersonalDetails, 'fullName'>]: PersonalDetails[K] }>;

export interface AddressInput { addressLine1: string; addressLine2?: string; city: string; stateRegion?: string; postalCode?: string; countryCode: string }
export interface ContactInput { contactName: string; relationship?: string; mobileNumber: string; alternateMobileNumber?: string; email?: string; isPrimary?: boolean }

export interface EmploymentChangeInput {
  effectiveFrom: string;
  reason: string;
  departmentId?: string | null;
  designationId?: string | null;
  branchId?: string | null;
  employmentTypeId?: string | null;
  confirmationDate?: string | null;
  probationEndDate?: string | null;
  noticePeriodDays?: number | null;
}

export interface BankAccountInput { accountHolderName: string; bankName: string; branchName?: string; accountNumber: string; bankCode: string; accountType?: string; effectiveFrom: string }

export interface ActivityEntry { id: string; at: string; action: string; label: string; detail: string | null; actor: string | null }

export interface LeaveRequest {
  id: string;
  requestNumber: string;
  leaveType: string;
  isPaid: boolean;
  startDate: string;
  endDate: string;
  days: string;
  status: string;
  reason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
}

export interface LeaveBalance {
  id: string;
  balance_days: string;
  as_of_date: string;
  rndtechnosoft_leave_types: { leave_type_name: string; is_paid: boolean };
}

export const DOCUMENT_CATEGORIES = {
  IDENTITY: 'Identity document',
  ADDRESS_PROOF: 'Address proof',
  EDUCATION: 'Educational certificate',
  EXPERIENCE: 'Experience letter',
  PREVIOUS_EMPLOYMENT: 'Previous employment',
  OFFER_LETTER: 'Offer letter',
  APPOINTMENT_LETTER: 'Appointment letter',
  EMPLOYMENT_AGREEMENT: 'Employment agreement',
  JOINING: 'Joining document',
  BANK: 'Bank document',
  TAX: 'Tax document',
  OTHER: 'Other HR document',
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

export interface EmployeeDocument {
  id: string;
  category: DocumentCategory;
  title: string;
  description: string | null;
  issuedOn: string | null;
  expiresOn: string | null;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  isExpired: boolean;
  rejectionReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
  filename: string;
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes: number;
}

export interface DocumentDetails { category: DocumentCategory; title: string; description?: string; issuedOn?: string; expiresOn?: string }

/** Sends a file with its details as one form; the server checks the file's real type and size. */
async function sendDocument(path: string, file: File, details: Partial<DocumentDetails>): Promise<EmployeeDocument[]> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(details)) if (value) form.append(key, value);
  const response = await apiFetch(`/api/v1${path}`, { method: 'POST', body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413 ? 'The file is larger than 10 MB. Upload a smaller copy.' : body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'The document could not be uploaded. Try again.');
  }
  return body.data as EmployeeDocument[];
}

const base = (id: string) => `/employees/${id}`;

export const employeeProfileApi = {
  get: (id: string) => data(apiClient.get<Envelope<EmployeeProfile>>(base(id))),
  updatePersonal: (id: string, input: PersonalInput) => data(apiClient.put<Envelope<EmployeeProfile>>(`${base(id)}/personal`, input)),
  saveAddress: (id: string, type: Address['type'], input: AddressInput) => data(apiClient.put<Envelope<EmployeeProfile>>(`${base(id)}/addresses/${type}`, input)),
  addContact: (id: string, input: ContactInput) => data(apiClient.post<Envelope<EmployeeProfile>>(`${base(id)}/emergency-contacts`, input)),
  updateContact: (id: string, contactId: string, input: ContactInput) => data(apiClient.put<Envelope<EmployeeProfile>>(`${base(id)}/emergency-contacts/${contactId}`, input)),
  removeContact: (id: string, contactId: string) => data(apiClient.delete<Envelope<EmployeeProfile>>(`${base(id)}/emergency-contacts/${contactId}`)),
  changeEmployment: (id: string, input: EmploymentChangeInput) => data(apiClient.post<Envelope<EmployeeProfile>>(`${base(id)}/employment-changes`, input)),
  changeStatus: (id: string, status: string, reason: string) => data(apiClient.post<Envelope<EmployeeProfile>>(`${base(id)}/status`, { status, reason })),
  replaceBankAccount: (id: string, input: BankAccountInput) => data(apiClient.post<Envelope<EmployeeProfile>>(`${base(id)}/bank-account`, input)),
  activity: (id: string, before?: string) =>
    data(apiClient.get<Envelope<{ items: ActivityEntry[]; next: string | null }>>(`${base(id)}/activity?limit=30${before ? `&before=${encodeURIComponent(before)}` : ''}`)),
  leaveRequests: (id: string, status?: string, page = 1) =>
    data(apiClient.get<Envelope<{ items: LeaveRequest[]; pendingCount: number; pagination: { page: number; total: number; totalPages: number } }>>(
      `/leave/employees/${id}/requests?page=${page}&limit=10${status ? `&status=${status}` : ''}`,
    )),
  leaveBalances: (id: string) => apiClient.get<LeaveBalance[]>(`/leave/balances/${id}`),
  documents: (id: string) => data(apiClient.get<Envelope<EmployeeDocument[]>>(`${base(id)}/documents`)),
  uploadDocument: (id: string, file: File, details: DocumentDetails) => sendDocument(`${base(id)}/documents`, file, details),
  replaceDocument: (id: string, documentId: string, file: File) => sendDocument(`${base(id)}/documents/${documentId}/replace`, file, {}),
  removeDocument: (id: string, documentId: string, reason: string) =>
    data(apiClient.post<Envelope<EmployeeDocument[]>>(`${base(id)}/documents/${documentId}/remove`, { reason })),
  verifyDocument: (id: string, documentId: string) => data(apiClient.post<Envelope<EmployeeDocument[]>>(`${base(id)}/documents/${documentId}/verify`)),
  rejectDocument: (id: string, documentId: string, reason: string) => data(apiClient.post<Envelope<EmployeeDocument[]>>(`${base(id)}/documents/${documentId}/reject`, { reason })),
  /** The file's bytes, fetched with the session, never through a bare link. */
  documentFile: (id: string, documentId: string) => fetchFile(`/api/v1${base(id)}/documents/${documentId}/file`),
};
