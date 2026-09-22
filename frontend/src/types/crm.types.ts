export interface CrmStage {
  id: string;
  pipeline_id: string;
  name: string;
  code: string;
  stage_probability: number;
  sla_duration_hours: number;
  sort_order: number;
  color_hex?: string;
  is_won: boolean;
  is_lost: boolean;
  leadCount?: number;
  grossValue?: number;
  weightedValue?: number;
}

export interface CrmPipeline {
  id: string;
  name: string;
  code: string;
  is_default: boolean;
  stages: CrmStage[];
}

export interface CrmLead {
  id: string;
  tenant_id: string;
  lead_code: string;
  company_name: string;
  first_name: string;
  last_name?: string;
  email: string;
  phone: string;
  industry?: string;
  city?: string;
  state?: string;
  country_code?: string;
  budget_amount?: number;
  currency_code: string;
  temperature: 'HOT' | 'WARM' | 'COLD';
  ai_score: number;
  win_probability: number;
  pipeline_id: string;
  stage_id: string;
  is_won: boolean;
  is_lost: boolean;
  is_sla_breached: boolean;
  sla_breached_at?: string;
  current_sla_duration_hours: number;
  assigned_to_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  rndtechnosoft_crm_pipelines?: {
    name: string;
    code: string;
  };
  rndtechnosoft_crm_stages?: {
    name: string;
    code: string;
    color_hex?: string;
    stage_probability: number;
  };
  rndtechnosoft_crm_lead_activities?: CrmActivity[];
  rndtechnosoft_crm_lead_followups?: CrmFollowup[];
  rndtechnosoft_crm_meetings?: CrmMeeting[];
  rndtechnosoft_crm_quotations?: CrmQuotation[];
}

export interface CrmActivity {
  id: string;
  lead_id: string;
  activity_type: 'CALL' | 'EMAIL' | 'WHATSAPP' | 'NOTE' | 'MEETING';
  title: string;
  description?: string;
  duration_seconds?: number;
  call_disposition?: string;
  actor_name?: string;
  created_at: string;
}

export interface CrmFollowup {
  id: string;
  lead_id: string;
  scheduled_at: string;
  followup_type: 'CALL' | 'WHATSAPP' | 'EMAIL' | 'DEMO' | 'TASK';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  instructions?: string;
  is_completed: boolean;
  completed_at?: string;
  outcome_note?: string;
  created_at: string;
  rndtechnosoft_crm_leads?: {
    id: string;
    company_name: string;
    first_name: string;
    lead_code: string;
    phone: string;
    email: string;
  };
}

export interface CrmMeeting {
  id: string;
  lead_id: string;
  title: string;
  meeting_type: 'DEMO' | 'DISCOVERY' | 'NEGOTIATION' | 'STATUS';
  scheduled_at: string;
  meeting_link?: string;
  minutes_of_meeting?: string;
  meeting_status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  rndtechnosoft_crm_leads?: {
    company_name: string;
    first_name: string;
    email: string;
  };
}

export interface CrmQuotationItem {
  id?: string;
  serviceId?: string;
  description: string;
  sacCode?: string;
  quantity: number;
  unitRate: number;
  discountRate?: number;
  taxRate?: number;
  lineAmount?: number;
}

export interface CrmQuotation {
  id: string;
  quote_number: string;
  lead_id: string;
  tax_mode: 'INTRA_STATE' | 'INTER_STATE' | 'EXPORT_LUT';
  client_state?: string;
  branch_state?: string;
  subtotal: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_tax: number;
  grand_total: number;
  currency_code: string;
  quote_status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';
  valid_until: string;
  notes?: string;
  created_at: string;
  rndtechnosoft_crm_leads?: {
    company_name: string;
    first_name: string;
    email: string;
    phone: string;
  };
  rndtechnosoft_crm_quotation_items?: Array<{
    id: string;
    description: string;
    sac_code?: string;
    quantity: number;
    unit_rate: number;
    tax_rate: number;
    line_amount: number;
  }>;
}

export interface CadenceMatrixLead {
  leadId: string;
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  daysSinceCreated: number;
  currentStepIndex: number;
  totalSteps: number;
  currentStepName: string;
  recommendedChannel: 'WHATSAPP' | 'EMAIL' | 'CALL' | 'LINKEDIN';
  isOverdue: boolean;
}

export interface CrmAuditLog {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  actor_name?: string;
  changes_diff?: Record<string, { before: any; after: any }>;
  ip_address?: string;
  created_at: string;
}

export interface CrmServiceMaster {
  id: string;
  service_name: string;
  service_code: string;
  sac_code: string;
  category: string;
  standard_rate: number;
  description?: string;
}

export interface CrmObjectionBattlecard {
  id: string;
  objection_code: string;
  objection_title: string;
  trigger_phrase: string;
  recommended_response: string;
  proof_asset_url?: string;
}
