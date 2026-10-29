import type {
  WorkflowStage,
  WorkflowTransition,
  WorkflowStageType,
} from '../../../api/onboarding-workflows.api';

export interface StageTypeOption {
  type: WorkflowStageType;
  label: string;
  category: 'TRIGGER' | 'ACTION' | 'APPROVAL' | 'CONDITION' | 'DELAY' | 'NOTIFICATION' | 'TERMINAL';
  description: string;
  defaultColor: string;
  iconName: string;
  isTerminalDefault: boolean;
}

export const STAGE_TYPE_OPTIONS: StageTypeOption[] = [
  {
    type: 'START',
    label: 'Start / Trigger',
    category: 'TRIGGER',
    description: 'Initial entry point or event trigger that starts the workflow.',
    defaultColor: '#10B981', // emerald
    iconName: 'Play',
    isTerminalDefault: false,
  },
  {
    type: 'TRIGGER',
    label: 'Event Trigger',
    category: 'TRIGGER',
    description: 'Listens for system events (e.g. application submitted, status change, schedule).',
    defaultColor: '#059669', // dark emerald
    iconName: 'Zap',
    isTerminalDefault: false,
  },
  {
    type: 'STANDARD',
    label: 'Standard Step',
    category: 'ACTION',
    description: 'Standard processing step, task completion, or recruiter review.',
    defaultColor: '#3B82F6', // blue
    iconName: 'ArrowRight',
    isTerminalDefault: false,
  },
  {
    type: 'ACTION',
    label: 'System Action',
    category: 'ACTION',
    description: 'Automated action such as generating letters, updating records, or webhook calls.',
    defaultColor: '#2563EB', // dark blue
    iconName: 'Cpu',
    isTerminalDefault: false,
  },
  {
    type: 'APPROVAL',
    label: 'Approval Gate',
    category: 'APPROVAL',
    description: 'Requires authorization from manager, HR, or finance before proceeding.',
    defaultColor: '#8B5CF6', // purple
    iconName: 'ShieldCheck',
    isTerminalDefault: false,
  },
  {
    type: 'CONDITION',
    label: 'Decision / Branch',
    category: 'CONDITION',
    description: 'Evaluates rules to branch the workflow into alternate paths (Approved vs Rejected).',
    defaultColor: '#6366F1', // indigo
    iconName: 'GitBranch',
    isTerminalDefault: false,
  },
  {
    type: 'WAITING',
    label: 'Wait / Hold',
    category: 'DELAY',
    description: 'Pauses workflow awaiting external feedback, candidate response, or background check.',
    defaultColor: '#F59E0B', // amber
    iconName: 'Clock',
    isTerminalDefault: false,
  },
  {
    type: 'DELAY',
    label: 'Timed Delay',
    category: 'DELAY',
    description: 'Waits for a configured duration (hours or days) before resuming execution.',
    defaultColor: '#D97706', // dark amber
    iconName: 'Hourglass',
    isTerminalDefault: false,
  },
  {
    type: 'NOTIFICATION',
    label: 'Notification',
    category: 'NOTIFICATION',
    description: 'Sends email, WhatsApp template, or in-app notification to stakeholders.',
    defaultColor: '#06B6D4', // cyan
    iconName: 'Mail',
    isTerminalDefault: false,
  },
  {
    type: 'COMPLETED',
    label: 'Completed / Joined',
    category: 'TERMINAL',
    description: 'Successful conclusion of the workflow (e.g. Employee Hired, Leave Approved).',
    defaultColor: '#16A34A', // green
    iconName: 'CheckCircle2',
    isTerminalDefault: true,
  },
  {
    type: 'TERMINAL',
    label: 'Terminal End',
    category: 'TERMINAL',
    description: 'Generic terminal conclusion step with no outgoing transitions.',
    defaultColor: '#475569', // slate
    iconName: 'Square',
    isTerminalDefault: true,
  },
  {
    type: 'REJECTED',
    label: 'Rejected / Disqualified',
    category: 'TERMINAL',
    description: 'Workflow ended because criteria were not met; terminal exit.',
    defaultColor: '#EF4444', // red
    iconName: 'XCircle',
    isTerminalDefault: true,
  },
  {
    type: 'WITHDRAWN',
    label: 'Withdrawn / Cancelled',
    category: 'TERMINAL',
    description: 'Candidate or employee withdrew or cancelled; terminal exit.',
    defaultColor: '#6B7280', // gray
    iconName: 'Slash',
    isTerminalDefault: true,
  },
];

export interface AppModuleOption {
  code: string;
  name: string;
  description: string;
  iconName: string;
  color: string;
  triggers: Array<{ code: string; label: string; description: string }>;
  actions: Array<{ code: string; label: string; description: string }>;
}

export const APP_MODULES: AppModuleOption[] = [
  {
    code: 'ONBOARDING',
    name: 'Recruitment & Candidate Onboarding',
    description: 'Candidate applications, screening, interviews, offers, and hiring pipelines.',
    iconName: 'UserCheck',
    color: '#0d9488',
    triggers: [
      { code: 'APPLICATION_RECEIVED', label: 'Application Received', description: 'Triggered when a new candidate applies or is added.' },
      { code: 'MANUAL', label: 'Manual Trigger', description: 'Triggered manually by an HR recruiter.' },
      { code: 'STAGE_CHANGED', label: 'Candidate Stage Changed', description: 'Triggered when candidate moves to a specified stage.' },
      { code: 'OFFER_ACCEPTED', label: 'Offer Accepted', description: 'Triggered when a candidate formally signs an offer.' },
    ],
    actions: [
      { code: 'RECRUITER_REVIEW', label: 'Recruiter Screening Review', description: 'Require recruiter review and screening feedback.' },
      { code: 'SCHEDULE_INTERVIEW', label: 'Schedule Interview', description: 'Schedule technical or HR interview round.' },
      { code: 'GENERATE_OFFER', label: 'Generate Offer Letter', description: 'Generate formal offer letter from approved template.' },
      { code: 'OFFER_APPROVAL', label: 'Require Offer Approval', description: 'Route offer to management for compensation sign-off.' },
      { code: 'SEND_OFFER_EMAIL', label: 'Send Offer via Email', description: 'Send digital offer package with signature link.' },
      { code: 'VERIFY_DOCUMENTS', label: 'Verify Mandatory Documents', description: 'Require identity, tax, and educational verification.' },
      { code: 'CONVERT_TO_EMPLOYEE', label: 'Convert to Employee Record', description: 'Create employee record and assign COSEC biometric ID.' },
    ],
  },
  {
    code: 'EMPLOYEES',
    name: 'HRMS & Employee Management',
    description: 'Promotions, department transfers, probation reviews, and employee lifecycle.',
    iconName: 'Users',
    color: '#3b82f6',
    triggers: [
      { code: 'EMPLOYEE_JOINED', label: 'New Employee Joined', description: 'Triggered when new employee record is created.' },
      { code: 'PROBATION_DUE', label: 'Probation Review Due', description: 'Triggered 30 days before probation end date.' },
      { code: 'TRANSFER_REQUESTED', label: 'Transfer Requested', description: 'Triggered when employee requests branch or dept transfer.' },
      { code: 'MANUAL', label: 'Manual HR Trigger', description: 'Triggered manually by an HR administrator.' },
    ],
    actions: [
      { code: 'MANAGER_REVIEW', label: 'Manager Evaluation', description: 'Route evaluation form to reporting manager.' },
      { code: 'HR_CONFIRMATION', label: 'HR Sign-off', description: 'Final confirmation by HR manager.' },
      { code: 'UPDATE_EMPLOYEE_RECORD', label: 'Update Employee Record', description: 'Persist new designation, branch, or department.' },
      { code: 'SEND_NOTIFICATION', label: 'Send Confirmation Letter', description: 'Email probation clearance or transfer letter.' },
    ],
  },
  {
    code: 'ATTENDANCE',
    name: 'Attendance & Shifts',
    description: 'Biometric punches, shift assignments, late-mark exceptions, and overtime approvals.',
    iconName: 'Clock',
    color: '#8b5cf6',
    triggers: [
      { code: 'OVERTIME_REQUESTED', label: 'Overtime Request', description: 'Triggered when employee requests overtime.' },
      { code: 'PUNCH_REGULARIZATION', label: 'Punch Regularization', description: 'Triggered when a missed punch correction is submitted.' },
      { code: 'SHIFT_CHANGE_REQUEST', label: 'Shift Swap Request', description: 'Triggered when an employee requests a shift change.' },
    ],
    actions: [
      { code: 'SUPERVISOR_APPROVAL', label: 'Supervisor Approval', description: 'Direct supervisor reviews attendance exception.' },
      { code: 'AUTO_ADJUST_PUNCH', label: 'Adjust Daily Attendance Record', description: 'Recalculate payable hours and late minutes.' },
      { code: 'NOTIFY_EMPLOYEE', label: 'Notify Employee', description: 'Send attendance adjustment confirmation.' },
    ],
  },
  {
    code: 'LEAVE',
    name: 'Leave Management',
    description: 'Paid time-off, sick leave, maternity leave, and compensatory off approval pipelines.',
    iconName: 'Calendar',
    color: '#f59e0b',
    triggers: [
      { code: 'LEAVE_APPLICATION_SUBMITTED', label: 'Leave Application Submitted', description: 'Triggered when an employee applies for leave.' },
      { code: 'LEAVE_CANCELLATION_REQUESTED', label: 'Cancellation Requested', description: 'Triggered when an approved leave cancellation is requested.' },
    ],
    actions: [
      { code: 'REPORTING_MANAGER_APPROVAL', label: 'Reporting Manager Approval', description: 'First-level approval from primary manager.' },
      { code: 'HR_HEAD_APPROVAL', label: 'Department Head / HR Approval', description: 'Second-level review for long-duration leaves.' },
      { code: 'DEDUCT_LEAVE_BALANCE', label: 'Deduct Leave Balance', description: 'Deduct days from relational leave ledger.' },
      { code: 'SEND_DECISION_EMAIL', label: 'Send Approval/Rejection Notice', description: 'Notify employee of decision.' },
    ],
  },
  {
    code: 'PAYROLL',
    name: 'Payroll Processing',
    description: 'Payroll calculation, salary revisions, variable pay approvals, and payslip generation.',
    iconName: 'DollarSign',
    color: '#10b981',
    triggers: [
      { code: 'PAYROLL_RUN_INITIATED', label: 'Payroll Run Initiated', description: 'Triggered when draft payroll calculation starts.' },
      { code: 'SALARY_INCREMENT_PROPOSED', label: 'Salary Increment Proposed', description: 'Triggered when a salary revision is drafted.' },
      { code: 'REIMBURSEMENT_CLAIMED', label: 'Reimbursement Claimed', description: 'Triggered when employee submits expense reimbursement.' },
    ],
    actions: [
      { code: 'VERIFY_ATTENDANCE_CUTOFF', label: 'Verify Attendance Inputs', description: 'Ensure attendance calculations are finalized.' },
      { code: 'FINANCE_AUDIT', label: 'Finance & Compliance Audit', description: 'Statutory and TDS deduction verification.' },
      { code: 'DIRECTOR_SIGN_OFF', label: 'Director / CFO Sign-off', description: 'Final sign-off before payout lock.' },
      { code: 'GENERATE_PAYSLIPS', label: 'Generate Immutable Payslips', description: 'Freeze payslip line items.' },
    ],
  },
  {
    code: 'DOCUMENTS',
    name: 'Document & Letterhead Approval',
    description: 'Company letterheads, experience letters, contracts, and legal document reviews.',
    iconName: 'FileText',
    color: '#06b6d4',
    triggers: [
      { code: 'DOCUMENT_GENERATED', label: 'Document Generated', description: 'Triggered when custom letterhead document is generated.' },
      { code: 'SIGNATURE_REQUESTED', label: 'Signature Requested', description: 'Triggered when document requires authorized signature.' },
    ],
    actions: [
      { code: 'LEGAL_REVIEW', label: 'Legal Review', description: 'Review wording against statutory standards.' },
      { code: 'DIGITAL_SIGNATURE', label: 'Apply Authorized Signature', description: 'Apply digital signature or stamp.' },
      { code: 'DISPATCH_DOCUMENT', label: 'Dispatch Document', description: 'Email signed PDF to recipient.' },
    ],
  },
  {
    code: 'CRM',
    name: 'CRM & Sales Pipeline',
    description: 'Lead stages, deal pipelines, customer onboarding, and quotation approvals.',
    iconName: 'Radio',
    color: '#ec4899',
    triggers: [
      { code: 'LEAD_CREATED', label: 'Lead Ingested', description: 'Triggered when a lead is captured via API or manual entry.' },
      { code: 'QUOTATION_SUBMITTED', label: 'Quotation Submitted', description: 'Triggered when discount exceeds standard threshold.' },
      { code: 'DEAL_WON', label: 'Deal Won', description: 'Triggered when a deal is marked Won.' },
    ],
    actions: [
      { code: 'SALES_MANAGER_APPROVAL', label: 'Sales Manager Approval', description: 'Review discount and payment terms.' },
      { code: 'SEND_WHATSAPP_UPDATE', label: 'Send WhatsApp Notification', description: 'Notify client via official WhatsApp API.' },
      { code: 'CREATE_CLIENT_ACCOUNT', label: 'Create Client Account', description: 'Promote lead to verified client organization.' },
    ],
  },
];

export const REQUIRED_ACTION_OPTIONS = [
  { value: 'NONE', label: 'None (Standard Progression)' },
  { value: 'RECRUITER_REVIEW', label: 'Recruiter Review & Screening Notes' },
  { value: 'INTERVIEW', label: 'Schedule or Complete Interview' },
  { value: 'OFFER_GENERATION', label: 'Generate Formal Offer Letter' },
  { value: 'OFFER_APPROVAL', label: 'Offer Sign-off & Approval' },
  { value: 'DOCUMENT_VERIFICATION', label: 'Mandatory Documents Verification' },
  { value: 'EMPLOYEE_CONVERSION', label: 'Convert to Employee Record' },
] as const;

export const COLOR_PALETTE = [
  { name: 'Emerald', value: '#10B981' },
  { name: 'Teal', value: '#0D9488' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Fuchsia', value: '#D946EF' },
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Red', value: '#EF4444' },
  { name: 'Slate', value: '#64748B' },
];

export interface CanvasTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export type SelectedElement =
  | { type: 'STAGE'; stageId: string }
  | { type: 'TRANSITION'; fromStageId: string; toStageId: string }
  | { type: 'WORKFLOW' }
  | null;

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 115;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 2.5;
