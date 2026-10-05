-- CRM history is append-only: an audit record or a lead activity, once
-- written, is never changed. A lead's activities still go when the lead is
-- deleted (the lead's DELETE stays in the audit log), and a workspace's
-- records when the workspace is removed.
CREATE OR REPLACE FUNCTION rndtechnosoft_reject_history_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'CRM history records cannot be changed (%).', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_rndtechnosoft_crm_audit_logs_append_only
  BEFORE UPDATE ON "rndtechnosoft_crm_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_reject_history_update();

CREATE TRIGGER trg_rndtechnosoft_crm_lead_activities_append_only
  BEFORE UPDATE ON "rndtechnosoft_crm_lead_activities"
  FOR EACH ROW EXECUTE FUNCTION rndtechnosoft_reject_history_update();

-- The workspace-wide audit trail (newest first, by action) and a lead's history.
CREATE INDEX "ix_crm_audit_logs_tenant_time" ON "rndtechnosoft_crm_audit_logs"("tenant_id", "created_at" DESC);
CREATE INDEX "ix_crm_audit_logs_tenant_action" ON "rndtechnosoft_crm_audit_logs"("tenant_id", "action_type", "created_at" DESC);
CREATE INDEX "ix_crm_audit_logs_entity_time" ON "rndtechnosoft_crm_audit_logs"("tenant_id", "entity_id", "created_at" DESC);
CREATE INDEX "ix_crm_activities_lead_time" ON "rndtechnosoft_crm_lead_activities"("tenant_id", "lead_id", "created_at" DESC);
