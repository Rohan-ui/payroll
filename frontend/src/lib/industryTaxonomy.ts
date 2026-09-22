'use client';

import { useState, useEffect, useCallback } from 'react';

export interface SubIndustryItem {
  key: string;
  name: string;
  id?: string;
  description?: string;
  tags?: string[];
}

export interface IndustryTaxonomyItem {
  key: string;
  name: string;
  id?: string;
  category?: string;
  subIndustries: SubIndustryItem[];
}

export interface DynamicSubIndustry {
  id: string;
  industry_id: string;
  name: string;
  tenant_id?: string;
}

export interface DynamicIndustry {
  id: string;
  name: string;
  tenant_id?: string;
  sub_industries: DynamicSubIndustry[];
}

// Baseline static taxonomy as initial fallback
export const INDUSTRY_TAXONOMY: Record<string, IndustryTaxonomyItem> = {
  manufacturing: {
    key: 'manufacturing',
    name: 'Manufacturing',
    category: 'Industrial & Engineering',
    subIndustries: [
      { key: 'chemical', name: 'Chemical' },
      { key: 'plastic', name: 'Plastic' },
      { key: 'engineering_wire', name: 'Engineering Wire' },
      { key: 'cnc_machining', name: 'CNC, VMC & Precision Engineering' },
      { key: 'heavy_machinery', name: 'Heavy Industrial Machinery & Equipment' },
      { key: 'packaging_machinery', name: 'Packaging Machinery & Automation' },
      { key: 'metal_foundry', name: 'Metal Casting, Forging & Foundry' }
    ]
  },
  healthcare: {
    key: 'healthcare',
    name: 'Healthcare & Medical',
    category: 'Healthcare & Life Sciences',
    subIndustries: [
      { key: 'hospitals_clinics', name: 'Hospitals & Clinics' },
      { key: 'pharma_biotech', name: 'Pharmaceutical Formulations & Biotech' },
      { key: 'medical_devices', name: 'Medical Equipment & Surgical Supplies' },
      { key: 'diagnostic_labs', name: 'Diagnostic & Pathology Labs' },
      { key: 'dental_chains', name: 'Dental Clinics & Dental Chains' },
      { key: 'ayurveda_wellness', name: 'Ayurveda, Naturopathy & Wellness Retreats' }
    ]
  },
  chemical: {
    key: 'chemical',
    name: 'Chemical & Petrochemical',
    category: 'Process Industries',
    subIndustries: [
      { key: 'specialty_chemicals', name: 'Specialty Chemicals & Polymers' },
      { key: 'industrial_solvents', name: 'Industrial Solvents & Petrochemicals' },
      { key: 'agrochemicals', name: 'Agro-Chemicals, Pesticides & Fertilizers' },
      { key: 'dyes_pigments', name: 'Dyes, Pigments & Textile Auxiliaries' },
      { key: 'api_bulk_drugs', name: 'API & Bulk Drug Ingredients' }
    ]
  },
  information_technology: {
    key: 'information_technology',
    name: 'Information Technology & Software',
    category: 'Technology & SaaS',
    subIndustries: [
      { key: 'saas_cloud', name: 'SaaS & Cloud Software Products' },
      { key: 'mobile_web_dev', name: 'Mobile App & Fullstack Web Engineering' },
      { key: 'ai_ml_automation', name: 'AI/ML & Computer Vision Automation' },
      { key: 'cyber_security', name: 'Cyber Security & VAPT Audit' },
      { key: 'erp_crm_impl', name: 'ERP & CRM Enterprise Implementations' }
    ]
  },
  real_estate: {
    key: 'real_estate',
    name: 'Real Estate & Construction',
    category: 'Infrastructure & Property',
    subIndustries: [
      { key: 'residential_highrises', name: 'Luxury Residential High-Rises' },
      { key: 'commercial_parks', name: 'Commercial IT Parks & Coworking' },
      { key: 'industrial_warehousing', name: 'Industrial Warehousing & Logistics' },
      { key: 'epc_infrastructure', name: 'Construction EPC & Infrastructure' },
      { key: 'interior_design', name: 'Interior Architecture & Fitouts' }
    ]
  },
  retail_ecommerce: {
    key: 'retail_ecommerce',
    name: 'Retail & E-Commerce',
    category: 'Consumer & Retail',
    subIndustries: [
      { key: 'd2c_lifestyle', name: 'D2C Lifestyle & Consumer Brands' },
      { key: 'omnichannel_retail', name: 'Omnichannel Supermarkets & Retail Chains' },
      { key: 'apparel_fashion', name: 'Textile, Footwear & Apparel' },
      { key: 'fmcg_distribution', name: 'FMCG Packaged Goods & Distribution' },
      { key: 'consumer_electronics', name: 'Consumer Electronics & Appliances' }
    ]
  },
  financial_services: {
    key: 'financial_services',
    name: 'Financial & Professional Services',
    category: 'Finance & Consulting',
    subIndustries: [
      { key: 'wealth_management', name: 'Wealth Management & Advisory' },
      { key: 'nbfc_lending', name: 'NBFCs & SME Business Loans' },
      { key: 'chartered_accountancy', name: 'Chartered Accountancy & Tax Advisory' },
      { key: 'corporate_law', name: 'Corporate Legal & Compliance Services' },
      { key: 'management_consulting', name: 'Management Consulting & Strategy' }
    ]
  },
  hospitality: {
    key: 'hospitality',
    name: 'Hospitality & Tourism',
    category: 'Travel & Lifestyle',
    subIndustries: [
      { key: 'luxury_resorts', name: 'Hotels & Luxury Resorts' },
      { key: 'fine_dining', name: 'Fine Dining & QSR Chains' },
      { key: 'travel_agencies', name: 'Travel & Tour Operations' },
      { key: 'event_management', name: 'Corporate Events & Exhibition Stalls' }
    ]
  },
  general: {
    key: 'general',
    name: 'General Corporate',
    category: 'Corporate & SME',
    subIndustries: [
      { key: 'sme_business', name: 'SME Enterprise / General Business' },
      { key: 'startup', name: 'Emerging Startup' },
      { key: 'other', name: 'Other Diversified Services' }
    ]
  }
};

// Global in-memory cache for dynamic tenant industries
let globalCachedIndustries: IndustryTaxonomyItem[] = Object.values(INDUSTRY_TAXONOMY);
let isCachePopulated = false;

// Convert API dynamic industry to IndustryTaxonomyItem format
export function convertDynamicToItem(ind: DynamicIndustry): IndustryTaxonomyItem {
  return {
    id: ind.id,
    key: ind.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
    name: ind.name,
    category: 'Custom Tenant Taxonomy',
    subIndustries: (ind.sub_industries || []).map(sub => ({
      id: sub.id,
      key: sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name: sub.name
    }))
  };
}

// Fetch dynamic industries for current tenant from API
export async function fetchTenantIndustries(): Promise<IndustryTaxonomyItem[]> {
  try {
    const res = await fetch('/api/v1/crm/masters/industries');
    const json = await res.json();
    if (json.success && Array.isArray(json.data) && json.data.length > 0) {
      const items = json.data.map(convertDynamicToItem);
      globalCachedIndustries = items;
      isCachePopulated = true;
      return items;
    }
  } catch (err) {
    console.warn('Could not fetch tenant industries, using fallback baseline', err);
  }
  return globalCachedIndustries;
}

// Synchronous getters (safe to call anywhere in SSR or client)
export function getIndustries(): IndustryTaxonomyItem[] {
  return globalCachedIndustries;
}

export function getSubIndustries(industryKeyOrName?: string | null): SubIndustryItem[] {
  if (!industryKeyOrName) {
    return globalCachedIndustries[0]?.subIndustries || INDUSTRY_TAXONOMY.general.subIndustries;
  }

  const query = industryKeyOrName.toLowerCase().trim();
  const normalizedKey = query.replace(/[^a-z0-9]+/g, '_');

  const found = globalCachedIndustries.find(ind => 
    ind.key === normalizedKey || 
    ind.id === industryKeyOrName || 
    ind.name.toLowerCase() === query
  );

  if (found && found.subIndustries.length > 0) {
    return found.subIndustries;
  }

  // Fallback check in static taxonomy
  if (INDUSTRY_TAXONOMY[normalizedKey]) {
    return INDUSTRY_TAXONOMY[normalizedKey].subIndustries;
  }

  return globalCachedIndustries[0]?.subIndustries || [];
}

export function getIndustryLabel(keyOrName?: string | null): string {
  if (!keyOrName) return 'General Corporate';
  const query = keyOrName.toLowerCase().trim();
  const normalizedKey = query.replace(/[^a-z0-9]+/g, '_');

  const found = globalCachedIndustries.find(ind => 
    ind.key === normalizedKey || 
    ind.id === keyOrName || 
    ind.name.toLowerCase() === query
  );

  return found?.name || keyOrName;
}

export function getSubIndustryLabel(industryKeyOrName?: string | null, subKeyOrName?: string | null): string {
  if (!subKeyOrName) return '';
  const subs = getSubIndustries(industryKeyOrName);
  const query = subKeyOrName.toLowerCase().trim();
  const normalizedKey = query.replace(/[^a-z0-9]+/g, '_');

  const found = subs.find(s => 
    s.key === normalizedKey || 
    s.id === subKeyOrName || 
    s.name.toLowerCase() === query
  );

  return found?.name || subKeyOrName;
}

// React Hook for dynamic tenant industry taxonomy
export function useTenantIndustries() {
  const [industries, setIndustries] = useState<IndustryTaxonomyItem[]>(globalCachedIndustries);
  const [loading, setLoading] = useState(!isCachePopulated);

  const refresh = useCallback(async () => {
    setLoading(true);
    const updated = await fetchTenantIndustries();
    setIndustries(updated);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    industries,
    loading,
    refresh,
    getSubIndustries: (indKey?: string | null) => getSubIndustries(indKey),
    getIndustryLabel: (indKey?: string | null) => getIndustryLabel(indKey),
    getSubIndustryLabel: (indKey?: string | null, subKey?: string | null) => getSubIndustryLabel(indKey, subKey)
  };
}
