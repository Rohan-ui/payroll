import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../api/client';

/**
 * Creating a quotation for a lead, or editing a draft one: its lines, GST
 * type, validity and notes. The totals shown are a preview worked out in whole
 * paise with the server's rounding; the server calculates what is saved.
 */

type TaxMode = 'INTRA_STATE' | 'INTER_STATE';

interface Line {
  key: string;
  serviceId: string;
  description: string;
  sacCode: string;
  quantity: string;
  unitRate: string;
}

interface LeadOption {
  id: string;
  label: string;
}

interface QuotationBuilderProps {
  services: any[];
  templates: any[];
  initialLeadId?: string | null;
  /** A draft quotation to edit; omitted to create one. */
  quotation?: any | null;
  onCancel: () => void;
  onSaved: (quotation: any) => void;
}

const QUANTITY = /^\d{1,9}(\.\d{1,3})?$/;
const RATE = /^\d{1,12}(\.\d{1,2})?$/;

/** A non-negative decimal string as a whole number of 10^-decimals units, or null when it is not one. */
function toUnits(value: string, pattern: RegExp, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (!pattern.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  return BigInt(whole + fraction.padEnd(decimals, '0'));
}

/** a / b rounded half up, for non-negative whole numbers. */
const divideRounded = (a: bigint, b: bigint) => (a * 2n + b) / (2n * b);

export interface QuotationTotals {
  lines: (bigint | null)[];
  subtotal: bigint;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
  total: bigint;
}

/** The server's pricing, in paise: each line rounded, then 9% + 9% or 18% of the subtotal, each rounded once. */
export function quotationTotals(lines: Pick<Line, 'quantity' | 'unitRate'>[], taxMode: TaxMode): QuotationTotals {
  const amounts = lines.map((line) => {
    const milliUnits = toUnits(line.quantity, QUANTITY, 3);
    const paise = toUnits(line.unitRate, RATE, 2);
    return milliUnits === null || paise === null ? null : divideRounded(milliUnits * paise, 1000n);
  });
  const subtotal = amounts.reduce<bigint>((sum, amount) => sum + (amount ?? 0n), 0n);
  const cgst = taxMode === 'INTRA_STATE' ? divideRounded(subtotal * 9n, 100n) : 0n;
  const sgst = cgst;
  const igst = taxMode === 'INTER_STATE' ? divideRounded(subtotal * 18n, 100n) : 0n;
  return { lines: amounts, subtotal, cgst, sgst, igst, total: subtotal + cgst + sgst + igst };
}

const rupees = new Intl.NumberFormat('en-IN');
export const formatPaise = (paise: bigint) => `₹${rupees.format(paise / 100n)}.${(paise % 100n).toString().padStart(2, '0')}`;

let lineCounter = 0;
const blankLine = (): Line => ({ key: `line-${(lineCounter += 1)}`, serviceId: '', description: '', sacCode: '', quantity: '1', unitRate: '' });

/** Template lines in either stored shape (quotation fields, or the Masters editor's service_name / qty). */
function templateLines(template: any): Line[] {
  let items: any = template?.items_json ?? template?.default_items_json ?? [];
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  return (Array.isArray(items) ? items : []).map((item: any) => ({
    ...blankLine(),
    description: String(item.description ?? item.service_name ?? ''),
    sacCode: String(item.sac_code ?? item.sacCode ?? ''),
    quantity: String(item.quantity ?? item.qty ?? 1),
    unitRate: String(item.unit_rate ?? item.unitRate ?? 0),
  }));
}

const leadLabel = (lead: any) =>
  [lead.company_name, [lead.first_name, lead.last_name].filter(Boolean).join(' ')].filter(Boolean).join(' — ') + (lead.lead_code ? ` (${lead.lead_code})` : '');

const fieldClass = 'w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';
const invalidClass = 'border-red-400';

export default function QuotationBuilder({ services, templates, initialLeadId, quotation, onCancel, onSaved }: QuotationBuilderProps) {
  const ids = useId();
  const isEdit = Boolean(quotation);
  const [leadId, setLeadId] = useState<string>(quotation?.lead_id ?? initialLeadId ?? '');
  const leadIdRef = useRef(leadId);
  leadIdRef.current = leadId;
  const [leadQuery, setLeadQuery] = useState('');
  const [leadOptions, setLeadOptions] = useState<LeadOption[]>([]);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [lines, setLines] = useState<Line[]>(() =>
    quotation?.items?.length
      ? [...quotation.items]
          .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((item: any) => ({
            ...blankLine(),
            serviceId: item.service_id ?? '',
            description: item.description ?? '',
            sacCode: item.sac_code ?? '',
            quantity: String(item.quantity ?? '1'),
            unitRate: String(item.unit_rate ?? '0'),
          }))
      : [blankLine()],
  );
  const [taxMode, setTaxMode] = useState<TaxMode>(quotation?.tax_mode === 'INTER_STATE' ? 'INTER_STATE' : 'INTRA_STATE');
  const [clientState, setClientState] = useState<string>(quotation?.client_state ?? '');
  const [branchState, setBranchState] = useState<string>(quotation?.branch_state ?? '');
  const [validDays, setValidDays] = useState<string>(isEdit ? '' : '30');
  const [notes, setNotes] = useState<string>(quotation?.notes ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const activeServices = useMemo(() => services.filter((service) => service.is_active !== false), [services]);
  const totals = useMemo(() => quotationTotals(lines, taxMode), [lines, taxMode]);

  // Leads matching what is typed, from the server, so any lead can be found however many there are.
  useEffect(() => {
    if (isEdit) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await apiFetch(`/api/v1/crm/leads?search=${encodeURIComponent(leadQuery.trim())}&page=1&limit=20`, { feedback: { error: false } });
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLeadsError(json?.message || 'The leads could not be loaded.');
          return;
        }
        setLeadsError(null);
        const found: LeadOption[] = (json?.data?.leads ?? []).map((lead: any) => ({ id: lead.id, label: leadLabel(lead) }));
        setLeadOptions((previous) => {
          // Keep the chosen lead listed even when the search no longer matches it.
          const chosen = previous.find((option) => option.id === leadIdRef.current);
          return chosen && !found.some((option) => option.id === chosen.id) ? [chosen, ...found] : found;
        });
      } catch {
        if (!cancelled) setLeadsError('Could not reach the server to load leads.');
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [leadQuery, isEdit]);

  // A lead passed in (from Lead 360 or the pipeline) is shown chosen even if it is not among the first results.
  useEffect(() => {
    if (isEdit || !initialLeadId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/v1/crm/leads/${encodeURIComponent(initialLeadId)}`, { feedback: { error: false } });
        const json = await res.json().catch(() => null);
        const lead = json?.data?.lead ?? json?.data;
        if (!cancelled && res.ok && lead?.id) {
          setLeadOptions((previous) => (previous.some((option) => option.id === lead.id) ? previous : [{ id: lead.id, label: leadLabel(lead) }, ...previous]));
        }
      } catch {
        // The search list still offers the lead.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialLeadId, isEdit]);

  const updateLine = (key: string, change: Partial<Line>) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));

  const chooseService = (key: string, serviceId: string) => {
    const service = activeServices.find((candidate) => candidate.id === serviceId);
    updateLine(key, service
      ? { serviceId, description: service.name ?? '', sacCode: service.sac_code ?? '', unitRate: service.default_rate != null ? String(service.default_rate) : '' }
      : { serviceId: '' });
  };

  const applyTemplate = () => {
    const template = templates.find((candidate) => candidate.id === templateId);
    const fromTemplate = templateLines(template);
    if (fromTemplate.length) setLines(fromTemplate);
  };

  // What still needs fixing before saving, by field.
  const errors = useMemo(() => {
    const found: Record<string, string> = {};
    if (!leadId) found.lead = 'Choose the lead this quotation is for.';
    lines.forEach((line, index) => {
      if (!line.description.trim()) found[`${line.key}.description`] = `Line ${index + 1} needs a description.`;
      const quantity = toUnits(line.quantity, QUANTITY, 3);
      if (quantity === null || quantity === 0n) found[`${line.key}.quantity`] = `Line ${index + 1}: enter a quantity above 0 (up to 3 decimals).`;
      if (toUnits(line.unitRate, RATE, 2) === null) found[`${line.key}.unitRate`] = `Line ${index + 1}: enter a rate of 0 or more (up to 2 decimals).`;
    });
    if (lines.length === 0) found.lines = 'Add at least one line.';
    if (validDays !== '' && !/^\d+$/.test(validDays)) found.validDays = 'Enter the validity as a whole number of days.';
    else if (validDays !== '' && (Number(validDays) < 1 || Number(validDays) > 365)) found.validDays = 'The quotation must be valid for 1 to 365 days.';
    if (notes.trim().length > 2000) found.notes = 'The notes must be 2,000 characters or fewer.';
    return found;
  }, [leadId, lines, validDays, notes]);
  const errorOf = (field: string) => (showErrors ? errors[field] : undefined);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setShowErrors(true);
    setServerError(null);
    if (Object.keys(errors).length > 0) return;

    inFlight.current = true;
    setSaving(true);
    try {
      const body = {
        ...(isEdit ? {} : { leadId }),
        items: lines.map((line) => ({
          ...(line.serviceId ? { serviceId: line.serviceId } : {}),
          description: line.description.trim(),
          sacCode: line.sacCode.trim(),
          quantity: line.quantity.trim(),
          unitRate: line.unitRate.trim(),
        })),
        taxMode,
        clientState: clientState.trim(),
        branchState: branchState.trim(),
        ...(validDays !== '' ? { validDays: Number(validDays) } : {}),
        notes: notes.trim(),
      };
      const res = await apiFetch(isEdit ? `/api/v1/crm/quotations/${quotation.id}` : '/api/v1/crm/quotations', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        // A refusal is shown on this page, next to the form.
        feedback: { error: false },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setServerError(json?.message || 'The quotation could not be saved. Check the lines and try again.');
        return;
      }
      onSaved(json?.data);
    } catch {
      setServerError('Could not reach the server. Check your connection and try again.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const errorList = showErrors ? Object.values(errors) : [];

  return (
    <form onSubmit={save} noValidate className="space-y-4" aria-labelledby={`${ids}-title`}>
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onCancel} className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100" aria-label="Back to quotations">
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h3 id={`${ids}-title`} className="font-bold text-sm text-slate-900 truncate">
              {isEdit ? `Edit quotation ${quotation.quotation_number}` : 'New quotation'}
            </h3>
            <p className="text-xs text-slate-500">
              {isEdit ? 'Only draft quotations can be edited. Totals are recalculated when you save.' : 'Saved as a draft. You can send it once it is ready.'}
            </p>
          </div>
        </div>
      </div>

      {(serverError || errorList.length > 0) && (
        <div role="alert" className="p-3 rounded-xl border border-red-200 bg-red-50 text-xs text-red-800 space-y-1">
          {serverError && <p className="font-semibold">{serverError}</p>}
          {errorList.length > 0 && (
            <>
              <p className="font-semibold">Fix these before saving:</p>
              <ul className="list-disc list-inside">
                {errorList.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3" aria-labelledby={`${ids}-customer`}>
            <h4 id={`${ids}-customer`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer</h4>
            {isEdit ? (
              <p className="text-xs text-slate-800">
                <span className="font-bold">{quotation.lead_company_name || quotation.lead?.company_name || 'Lead'}</span>
                {quotation.contact_person ? ` — ${quotation.contact_person}` : ''}
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`${ids}-lead-search`} className="block text-xs font-bold text-slate-700 mb-1">Find a lead</label>
                  <input
                    id={`${ids}-lead-search`}
                    type="search"
                    value={leadQuery}
                    onChange={(e) => setLeadQuery(e.target.value)}
                    placeholder="Company, contact, email or lead code"
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${ids}-lead`} className="block text-xs font-bold text-slate-700 mb-1">Lead *</label>
                  <select
                    id={`${ids}-lead`}
                    value={leadId}
                    onChange={(e) => setLeadId(e.target.value)}
                    aria-invalid={Boolean(errorOf('lead'))}
                    className={`${fieldClass} ${errorOf('lead') ? invalidClass : ''}`}
                  >
                    <option value="">{leadOptions.length ? 'Choose a lead' : 'No matching leads'}</option>
                    {leadOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                  </select>
                  {leadsError && <p className="mt-1 text-[11px] text-red-700">{leadsError}</p>}
                </div>
              </div>
            )}
          </section>

          <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3" aria-labelledby={`${ids}-lines`}>
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <h4 id={`${ids}-lines`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Line items</h4>
              {templates.length > 0 && (
                <div className="flex items-end gap-2">
                  <div>
                    <label htmlFor={`${ids}-template`} className="block text-[11px] font-bold text-slate-600 mb-1">Start from a template</label>
                    <select id={`${ids}-template`} value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={fieldClass}>
                      <option value="">Choose a template</option>
                      {templates.map((template) => (
                        <option key={template.id} value={template.id}>{template.template_name ?? template.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={applyTemplate}
                    disabled={!templateId}
                    title="Replaces the current lines with the template's lines"
                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                  >
                    Use template lines
                  </button>
                </div>
              )}
            </div>

            <ol className="space-y-3">
              {lines.map((line, index) => (
                <li key={line.key} className="p-3 rounded-lg border border-slate-200 bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-500">Line {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
                      disabled={lines.length === 1}
                      aria-label={`Remove line ${index + 1}`}
                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2">
                    <div className="col-span-2 sm:col-span-4">
                      <label htmlFor={`${line.key}-service`} className="block text-[11px] font-bold text-slate-600 mb-1">Service</label>
                      <select id={`${line.key}-service`} value={line.serviceId} onChange={(e) => chooseService(line.key, e.target.value)} className={fieldClass}>
                        <option value="">Custom line</option>
                        {activeServices.map((service) => (
                          <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2 sm:col-span-8">
                      <label htmlFor={`${line.key}-description`} className="block text-[11px] font-bold text-slate-600 mb-1">Description *</label>
                      <input
                        id={`${line.key}-description`}
                        value={line.description}
                        onChange={(e) => updateLine(line.key, { description: e.target.value })}
                        aria-invalid={Boolean(errorOf(`${line.key}.description`))}
                        className={`${fieldClass} ${errorOf(`${line.key}.description`) ? invalidClass : ''}`}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label htmlFor={`${line.key}-sac`} className="block text-[11px] font-bold text-slate-600 mb-1">SAC code</label>
                      <input id={`${line.key}-sac`} value={line.sacCode} maxLength={32} onChange={(e) => updateLine(line.key, { sacCode: e.target.value })} className={`${fieldClass} font-mono`} />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${line.key}-quantity`} className="block text-[11px] font-bold text-slate-600 mb-1">Qty *</label>
                      <input
                        id={`${line.key}-quantity`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        aria-invalid={Boolean(errorOf(`${line.key}.quantity`))}
                        className={`${fieldClass} text-right ${errorOf(`${line.key}.quantity`) ? invalidClass : ''}`}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <label htmlFor={`${line.key}-rate`} className="block text-[11px] font-bold text-slate-600 mb-1">Rate (₹) *</label>
                      <input
                        id={`${line.key}-rate`}
                        inputMode="decimal"
                        value={line.unitRate}
                        onChange={(e) => updateLine(line.key, { unitRate: e.target.value })}
                        placeholder="0.00"
                        aria-invalid={Boolean(errorOf(`${line.key}.unitRate`))}
                        className={`${fieldClass} text-right ${errorOf(`${line.key}.unitRate`) ? invalidClass : ''}`}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-3 flex flex-col justify-end">
                      <span className="block text-[11px] font-bold text-slate-600 mb-1">Amount</span>
                      <span className="px-3 py-2 text-xs text-right font-semibold text-slate-900 tabular-nums" data-line-amount>
                        {totals.lines[index] === null ? '—' : formatPaise(totals.lines[index] as bigint)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setLines((current) => [...current, blankLine()])}
              disabled={lines.length >= 200}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add line
            </button>
          </section>

          <section className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3" aria-labelledby={`${ids}-terms`}>
            <h4 id={`${ids}-terms`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Tax, validity and notes</h4>
            <fieldset>
              <legend className="block text-xs font-bold text-slate-700 mb-1">GST</legend>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs text-slate-700">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`${ids}-tax`} checked={taxMode === 'INTRA_STATE'} onChange={() => setTaxMode('INTRA_STATE')} />
                  Within the state: CGST 9% + SGST 9%
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={`${ids}-tax`} checked={taxMode === 'INTER_STATE'} onChange={() => setTaxMode('INTER_STATE')} />
                  Another state: IGST 18%
                </label>
              </div>
            </fieldset>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor={`${ids}-client-state`} className="block text-xs font-bold text-slate-700 mb-1">Customer's state</label>
                <input id={`${ids}-client-state`} value={clientState} maxLength={100} onChange={(e) => setClientState(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-branch-state`} className="block text-xs font-bold text-slate-700 mb-1">Your branch's state</label>
                <input id={`${ids}-branch-state`} value={branchState} maxLength={100} onChange={(e) => setBranchState(e.target.value)} className={fieldClass} />
              </div>
              <div>
                <label htmlFor={`${ids}-valid`} className="block text-xs font-bold text-slate-700 mb-1">
                  {isEdit ? 'Valid for (days from today)' : 'Valid for (days) *'}
                </label>
                <input
                  id={`${ids}-valid`}
                  inputMode="numeric"
                  value={validDays}
                  onChange={(e) => setValidDays(e.target.value)}
                  placeholder={isEdit && quotation?.valid_until ? `Keep: until ${new Date(quotation.valid_until).toLocaleDateString('en-IN')}` : undefined}
                  aria-invalid={Boolean(errorOf('validDays'))}
                  className={`${fieldClass} ${errorOf('validDays') ? invalidClass : ''}`}
                />
              </div>
            </div>
            <div>
              <label htmlFor={`${ids}-notes`} className="block text-xs font-bold text-slate-700 mb-1">Notes</label>
              <textarea
                id={`${ids}-notes`}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Scope, payment terms or anything the customer should know"
                aria-invalid={Boolean(errorOf('notes'))}
                className={`${fieldClass} ${errorOf('notes') ? invalidClass : ''}`}
              />
            </div>
          </section>
        </div>

        <aside className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3 lg:sticky lg:top-4" aria-labelledby={`${ids}-summary`}>
          <h4 id={`${ids}-summary`} className="text-xs font-bold uppercase tracking-wider text-slate-500">Summary</h4>
          <dl className="text-xs space-y-1.5 tabular-nums">
            <div className="flex justify-between"><dt className="text-slate-600">Subtotal</dt><dd>{formatPaise(totals.subtotal)}</dd></div>
            {taxMode === 'INTRA_STATE' ? (
              <>
                <div className="flex justify-between"><dt className="text-slate-600">CGST 9%</dt><dd>{formatPaise(totals.cgst)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">SGST 9%</dt><dd>{formatPaise(totals.sgst)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between"><dt className="text-slate-600">IGST 18%</dt><dd>{formatPaise(totals.igst)}</dd></div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold text-slate-900">
              <dt>Total</dt>
              <dd data-quotation-total>{formatPaise(totals.total)}</dd>
            </div>
          </dl>
          <p className="text-[11px] text-slate-500">A preview; the server calculates the saved amounts the same way.</p>
          <div className="flex flex-col gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-4 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save quotation'}
            </button>
            <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">
              Cancel
            </button>
          </div>
        </aside>
      </div>
    </form>
  );
}
