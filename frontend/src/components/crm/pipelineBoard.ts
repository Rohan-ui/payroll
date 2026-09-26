/**
 * Shared rules for the Sales Pipelines board and list: which leads are being
 * worked in Client Outreach, and which pipeline the board shows.
 */

interface PipelineLike {
  id: string;
  is_default?: boolean | null;
  sort_order?: number | null;
}

/** A lead in the 30-day outreach cadence that has not yet been moved into the sales pipeline. */
export function isInOutreach(lead: { custom_attributes?: unknown }): boolean {
  let attributes = lead.custom_attributes;
  if (typeof attributes === 'string') {
    try {
      attributes = JSON.parse(attributes);
    } catch {
      return false;
    }
  }
  const cadence = (attributes as { cadence?: { status?: string; convertedToOpportunity?: boolean } } | null)?.cadence;
  return Boolean(cadence && cadence.status !== 'CONVERTED' && !cadence.convertedToOpportunity);
}

/**
 * The pipeline the board shows: the one the user chose if it still exists,
 * otherwise the pipeline flagged default (where new leads go), otherwise the
 * first by sort order. Empty while pipelines are still loading.
 */
export function resolveBoardPipeline(pipelines: PipelineLike[], chosenId: string | null): string {
  if (chosenId && pipelines.some((p) => p.id === chosenId)) return chosenId;
  const byOrder = [...pipelines].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  return (byOrder.find((p) => p.is_default) ?? byOrder[0])?.id ?? '';
}

const storageKey = (tenantId: string) => `voogyo.crm.pipeline.${tenantId}`;

/** The pipeline this user last chose in this workspace, if the browser kept it. */
export function readRememberedPipeline(tenantId: string | null | undefined): string | null {
  if (!tenantId) return null;
  try {
    return localStorage.getItem(storageKey(tenantId));
  } catch {
    return null;
  }
}

export function rememberPipeline(tenantId: string | null | undefined, pipelineId: string): void {
  if (!tenantId) return;
  try {
    localStorage.setItem(storageKey(tenantId), pipelineId);
  } catch {
    // Storage may be unavailable; the board still works for this visit.
  }
}

/** What "Deal Won" did, from the API's answer; never a project or invoice, since none is created. */
export function dealWonMessage(result: { clientCode?: string; clientCreated?: boolean } | null | undefined): string {
  return result?.clientCode ? `Deal won — client ${result.clientCode} ${result.clientCreated ? 'created' : 'linked'}` : 'Deal won';
}

/** The pipeline code of the Cold Funnel, where leads converted from Client Outreach enter (the server uses the same). */
export const COLD_FUNNEL_PIPELINE_CODE = 'COLD_FUNNEL';

interface FunnelPipeline extends PipelineLike {
  name: string;
  code?: string | null;
  is_active?: boolean | null;
}

interface FunnelStage {
  id: string;
  name: string;
  pipeline_id: string;
  sort_order?: number | null;
  is_won?: boolean | null;
  is_lost?: boolean | null;
}

/**
 * Where a converted outreach lead will go: the active Cold Funnel pipeline and
 * its first open stage by order, as the server decides it. Null when the
 * workspace has no such pipeline or stage, in which case conversion is refused.
 */
export function coldFunnelDestination(
  pipelines: FunnelPipeline[],
  stages: FunnelStage[],
): { pipeline: { id: string; name: string }; stage: { id: string; name: string } } | null {
  const pipeline = pipelines.find((p) => p.code?.toUpperCase() === COLD_FUNNEL_PIPELINE_CODE && p.is_active !== false);
  if (!pipeline) return null;
  const stage = stages
    .filter((s) => s.pipeline_id === pipeline.id && !s.is_won && !s.is_lost)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  return stage ? { pipeline: { id: pipeline.id, name: pipeline.name }, stage: { id: stage.id, name: stage.name } } : null;
}
