import type { FormAddress, FormEducation, FormExperience, FormReference } from './onboarding.api';

/**
 * The candidate's information form. There is no session here: the one-time
 * token from the email is the only authorization, sent only to these routes.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface CandidateFormDetails {
  fullName: string;
  email: string;
  phone: string | null;
  alternatePhone: string | null;
  dateOfBirth: string | null;
  genderCode: string | null;
  totalExperienceYears: string | null;
  expectedSalary: string | null;
  noticePeriodDays: number | null;
  lastWorkingDate: string | null;
  skills: string | null;
  emergencyContactName: string | null;
  emergencyContactRelationship: string | null;
  emergencyContactPhone: string | null;
  additionalInformation: string | null;
  currentAddress: FormAddress | null;
  permanentAddress: FormAddress | null;
  education: FormEducation[];
  experience: FormExperience[];
  references: FormReference[];
}

/** A document the form asks for, as the candidate sees it. */
export interface FormDocument {
  id: string;
  label: string;
  isRequired: boolean;
  state: 'MISSING' | 'INCOMPLETE' | 'PENDING_REVIEW' | 'PARTIALLY_VERIFIED' | 'VERIFIED' | 'REJECTED';
  minFiles: number;
  maxFiles: number;
  slots: string[] | null;
  files: { filename: string; reviewStatus: string; rejectionReason: string | null; slotName: string | null }[];
}

export interface PublicCandidateForm {
  companyName: string;
  position: string;
  linkExpiresAt: string;
  message: string | null;
  details: CandidateFormDetails;
  documents: FormDocument[];
}

export interface CandidateFormSubmission {
  fullName: string;
  dateOfBirth: string;
  genderCode?: string;
  phone: string;
  alternatePhone?: string;
  currentAddress: FormAddress;
  permanentAddress?: FormAddress;
  education: FormEducation[];
  experience: FormExperience[];
  totalExperienceYears?: string;
  expectedSalary?: string;
  noticePeriodDays?: number;
  lastWorkingDate?: string;
  skills?: string;
  emergencyContactName: string;
  emergencyContactRelationship?: string;
  emergencyContactPhone: string;
  references: FormReference[];
  additionalInformation?: string;
  confirmed: true;
}

/** A refusal from the server with its reason, and whether the link is gone for good. */
export class FormLinkError extends Error {
  constructor(message: string, readonly isClosed: boolean) {
    super(message);
  }
}

async function call<T>(token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/public/candidate-form/${encodeURIComponent(token)}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'omit',
    });
  } catch {
    throw new FormLinkError('We couldn’t reach the server. Check your connection and try again.', false);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new FormLinkError(message || 'Something went wrong. Try again.', response.status === 404 || response.status === 410);
  }
  return body.data as T;
}

/** Uploads files for one document; the server checks each file's real type and size. */
async function upload(token: string, requestId: string, files: File[]): Promise<FormDocument[]> {
  const form = new FormData();
  for (const file of files) form.append('files', file);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/public/candidate-form/${encodeURIComponent(token)}/documents/${encodeURIComponent(requestId)}/files`, { method: 'POST', body: form, credentials: 'omit' });
  } catch {
    throw new FormLinkError('We couldn’t reach the server. Check your connection and try again.', false);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413 ? 'The file is larger than 10 MB. Upload a smaller copy.' : Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new FormLinkError(message || 'The file could not be uploaded. Try again.', response.status === 410);
  }
  return body.data as FormDocument[];
}

export const publicCandidateFormApi = {
  upload,
  get: (token: string) => call<PublicCandidateForm>(token),
  submit: (token: string, form: CandidateFormSubmission) => call<{ submitted: boolean }>(token, { method: 'POST', body: JSON.stringify(form) }),
};
