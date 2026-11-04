import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

export interface ResolutionContext {
  tenantId: string;
  leadId?: string | null;
  clientId?: string | null;
  explicitVariables?: Record<string, any> | null;
}

export interface ResolvedVariableResult {
  resolved: Record<string, string>;
  missing: string[];
  usedLead?: any;
  usedClient?: any;
}

@Injectable()
export class WhatsAppVariableResolverService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extracts unique placeholder names enclosed in {{name}} or {name}.
   */
  extractVariables(text: string): string[] {
    if (!text) return [];
    const set = new Set<string>();
    // Matches {{var_name}} and {var_name}
    const doubleMatches = text.match(/\{\{([a-zA-Z0-9_\-\.]+)\}\}/g);
    if (doubleMatches) {
      for (const m of doubleMatches) {
        set.add(m.replace(/^\{\{|\}\}$/g, '').trim());
      }
    }
    const singleMatches = text.match(/\{([a-zA-Z0-9_\-]+)\}/g);
    if (singleMatches) {
      for (const m of singleMatches) {
        const v = m.replace(/^\{|\}$/g, '').trim();
        if (!/^\d+$/.test(v)) { // Skip purely numeric {1} if any
          set.add(v);
        }
      }
    }
    return Array.from(set);
  }

  /**
   * Replaces placeholders in text using the resolved variables map.
   */
  interpolate(text: string, variables: Record<string, any>): string {
    if (!text) return '';
    return text.replace(/\{\{([a-zA-Z0-9_\-\.]+)\}\}/g, (match, key) => {
      const val = variables[key.trim()];
      return val !== undefined && val !== null ? String(val) : match;
    });
  }

  /**
   * Resolves a collection of variable keys against context (explicit variables, lead, client, system dates).
   */
  async resolveVariables(
    variableKeys: string[],
    ctx: ResolutionContext,
  ): Promise<ResolvedVariableResult> {
    const resolved: Record<string, string> = {};
    const missing: string[] = [];

    let lead: any = null;
    let client: any = null;

    if (ctx.leadId) {
      lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
        where: { id: ctx.leadId, tenant_id: ctx.tenantId },
      });
    }

    if (ctx.clientId) {
      client = await this.prisma.rndtechnosoft_crm_clients.findFirst({
        where: { id: ctx.clientId, tenant_id: ctx.tenantId },
      });
    }

    const explicit = ctx.explicitVariables || {};

    const now = new Date();
    const systemVars: Record<string, string> = {
      today: now.toLocaleDateString('en-GB'),
      current_date: now.toISOString().slice(0, 10),
      current_year: String(now.getFullYear()),
      timestamp: now.toISOString(),
    };

    for (const rawKey of variableKeys) {
      const key = rawKey.trim();

      // 1. Explicit variable passed in request (highest priority)
      if (explicit[key] !== undefined && explicit[key] !== null) {
        resolved[key] = String(explicit[key]);
        continue;
      }

      // Check case-insensitive / snake_case variations in explicit
      const explicitNormalizedKey = Object.keys(explicit).find(
        (k) => k.toLowerCase() === key.toLowerCase() || k.replace(/[\-_]/g, '') === key.replace(/[\-_]/g, ''),
      );
      if (explicitNormalizedKey && explicit[explicitNormalizedKey] !== undefined && explicit[explicitNormalizedKey] !== null) {
        resolved[key] = String(explicit[explicitNormalizedKey]);
        continue;
      }

      // 2. Lead data resolution
      if (lead) {
        const leadVal = this.getLeadValue(lead, key);
        if (leadVal !== undefined && leadVal !== null && leadVal !== '') {
          resolved[key] = String(leadVal);
          continue;
        }
      }

      // 3. Client data resolution
      if (client) {
        const clientVal = this.getClientValue(client, key);
        if (clientVal !== undefined && clientVal !== null && clientVal !== '') {
          resolved[key] = String(clientVal);
          continue;
        }
      }

      // 4. System standard variables
      if (systemVars[key.toLowerCase()]) {
        resolved[key] = systemVars[key.toLowerCase()];
        continue;
      }

      // If unresolved, record as missing
      missing.push(key);
    }

    return {
      resolved,
      missing,
      usedLead: lead ? { id: lead.id, code: lead.lead_code, name: lead.company_name } : undefined,
      usedClient: client ? { id: client.id, code: client.client_code, name: client.company_name } : undefined,
    };
  }

  private getLeadValue(lead: any, key: string): string | undefined {
    const norm = key.toLowerCase().replace(/[\-_]/g, '');
    const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.company_name;

    switch (norm) {
      case 'firstname': return lead.first_name || '';
      case 'lastname': return lead.last_name || '';
      case 'fullname':
      case 'name':
      case 'customername':
      case 'clientname': return fullName;
      case 'companyname':
      case 'company': return lead.company_name || '';
      case 'email': return lead.email || '';
      case 'phone':
      case 'phonenumber':
      case 'whatsapp':
      case 'whatsappnumber': return lead.whatsapp_number || lead.phone || '';
      case 'designation': return lead.designation || '';
      case 'city': return lead.city || '';
      case 'state': return lead.state || '';
      case 'address': return lead.address || '';
      case 'primaryservice':
      case 'service': return lead.primary_service || '';
      case 'leadcode': return lead.lead_code || '';
      case 'budget':
      case 'budgetamount': return lead.budget_amount ? String(lead.budget_amount) : '';
      default:
        // Try custom_attributes
        if (lead.custom_attributes && typeof lead.custom_attributes === 'object') {
          return (lead.custom_attributes as any)[key];
        }
        return undefined;
    }
  }

  private getClientValue(client: any, key: string): string | undefined {
    const norm = key.toLowerCase().replace(/[\-_]/g, '');
    switch (norm) {
      case 'companyname':
      case 'company':
      case 'customername':
      case 'clientname': return client.company_name || '';
      case 'contactperson':
      case 'fullname':
      case 'name': return client.contact_person || client.company_name || '';
      case 'email': return client.email || '';
      case 'phone':
      case 'phonenumber': return client.phone || '';
      case 'clientcode': return client.client_code || '';
      case 'gstin': return client.gstin || '';
      case 'pan': return client.pan || '';
      case 'billingaddress':
      case 'address': return client.billing_address || '';
      default: return undefined;
    }
  }
}

