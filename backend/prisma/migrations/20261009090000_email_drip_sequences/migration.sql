-- Drip sequences: automatic email sequences for CRM leads.
--
-- A sequence's steps are sent to enrolled leads on a schedule, from the
-- organization's account or the lead owner's own, until the lead replies,
-- bounces, unsubscribes, closes, enters a stop stage or is stopped. Every
-- email has one row in rndtechnosoft_email_sequence_sends from scheduled to
-- sent, so a step is never sent twice to one enrollment. Unsubscribed and
-- bounced addresses go on the workspace's suppression list, checked before
-- every send. Nothing here sends by itself: the sequence worker does, and only
-- for ACTIVE sequences. No sample data.

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequence_name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "sequence_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "sender_mode" VARCHAR(16) NOT NULL DEFAULT 'ORGANIZATION',
    "send_weekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "window_start_minute" INTEGER NOT NULL DEFAULT 600,
    "window_end_minute" INTEGER NOT NULL DEFAULT 1020,
    "skip_holidays" BOOLEAN NOT NULL DEFAULT true,
    "daily_limit" INTEGER NOT NULL DEFAULT 50,
    "definition_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_tenant_member_id" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "paused_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_steps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "step_name" VARCHAR(120) NOT NULL,
    "delay_amount" INTEGER NOT NULL DEFAULT 0,
    "delay_unit" VARCHAR(16) NOT NULL DEFAULT 'WORKING_DAYS',
    "template_id" UUID,
    "template_name" VARCHAR(160),
    "subject" VARCHAR(300) NOT NULL,
    "body_text" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "removed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_stop_stages" (
    "tenant_id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "stage_id" UUID NOT NULL,

    CONSTRAINT "rndtechnosoft_email_sequence_stop_stages_pkey" PRIMARY KEY ("sequence_id","stage_id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_enrollments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "enrollment_status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "recipient_email" VARCHAR(320) NOT NULL,
    "enrolled_via" VARCHAR(16) NOT NULL,
    "rule_id" UUID,
    "enrolled_by_tenant_member_id" UUID,
    "stop_reason" VARCHAR(32),
    "stop_detail" VARCHAR(500),
    "stopped_by_tenant_member_id" UUID,
    "stopped_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_sends" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "step_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "send_status" VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "claimed_at" TIMESTAMPTZ(6),
    "definition_version" INTEGER NOT NULL,
    "recipient_email" VARCHAR(320) NOT NULL,
    "sender_kind" VARCHAR(16),
    "sender_email" VARCHAR(320),
    "sender_member_id" UUID,
    "subject" VARCHAR(300),
    "body_text" TEXT,
    "message_id" VARCHAR(255),
    "provider_message_id" VARCHAR(255),
    "unsubscribe_token_hash" CHAR(64),
    "failure_code" VARCHAR(48),
    "failure_reason" VARCHAR(500),
    "cancel_reason" VARCHAR(32),
    "bounce_kind" VARCHAR(8),
    "sent_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "replied_at" TIMESTAMPTZ(6),
    "bounced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_sends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "send_id" UUID NOT NULL,
    "event_kind" VARCHAR(16) NOT NULL,
    "match_method" VARCHAR(16) NOT NULL,
    "bounce_kind" VARCHAR(8),
    "mailbox_email" VARCHAR(320) NOT NULL,
    "inbound_message_id" VARCHAR(255) NOT NULL,
    "from_email" VARCHAR(320),
    "subject" VARCHAR(300),
    "detail" VARCHAR(500),
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_mailbox_scans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "mailbox_email" VARCHAR(320) NOT NULL,
    "uid_validity" BIGINT,
    "last_uid" INTEGER,
    "last_scanned_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(500),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_mailbox_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_suppressions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "suppression_reason" VARCHAR(16) NOT NULL,
    "suppression_source" VARCHAR(16) NOT NULL,
    "note" VARCHAR(500),
    "send_id" UUID,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sequence_id" UUID NOT NULL,
    "rule_name" VARCHAR(120) NOT NULL,
    "trigger_kind" VARCHAR(16) NOT NULL,
    "pipeline_id" UUID,
    "stage_id" UUID,
    "source_id" UUID,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(500),
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_email_sequence_rule_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "event_at" TIMESTAMPTZ(6) NOT NULL,
    "outcome" VARCHAR(16) NOT NULL,
    "skip_reason" VARCHAR(200),
    "enrollment_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_email_sequence_rule_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_email_sequences_status" ON "rndtechnosoft_email_sequences"("tenant_id", "sequence_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequences_tenant_id" ON "rndtechnosoft_email_sequences"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_email_sequence_steps_order" ON "rndtechnosoft_email_sequence_steps"("tenant_id", "sequence_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_steps_tenant_id" ON "rndtechnosoft_email_sequence_steps"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_email_sequence_enrollments_status" ON "rndtechnosoft_email_sequence_enrollments"("tenant_id", "sequence_id", "enrollment_status");

-- CreateIndex
CREATE INDEX "ix_email_sequence_enrollments_lead" ON "rndtechnosoft_email_sequence_enrollments"("tenant_id", "lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_enrollments_tenant_id" ON "rndtechnosoft_email_sequence_enrollments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_sends_unsubscribe" ON "rndtechnosoft_email_sequence_sends"("unsubscribe_token_hash");

-- CreateIndex
CREATE INDEX "ix_email_sequence_sends_due" ON "rndtechnosoft_email_sequence_sends"("send_status", "scheduled_at");

-- CreateIndex
CREATE INDEX "ix_email_sequence_sends_sequence" ON "rndtechnosoft_email_sequence_sends"("tenant_id", "sequence_id", "send_status");

-- CreateIndex
CREATE INDEX "ix_email_sequence_sends_sender_day" ON "rndtechnosoft_email_sequence_sends"("tenant_id", "sender_email", "sent_at");

-- CreateIndex
CREATE INDEX "ix_email_sequence_sends_message" ON "rndtechnosoft_email_sequence_sends"("tenant_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_sends_tenant_id" ON "rndtechnosoft_email_sequence_sends"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_sends_step" ON "rndtechnosoft_email_sequence_sends"("tenant_id", "enrollment_id", "step_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_events_message" ON "rndtechnosoft_email_sequence_events"("tenant_id", "mailbox_email", "inbound_message_id", "event_kind");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_mailbox_scans_member" ON "rndtechnosoft_email_mailbox_scans"("tenant_id", "member_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_suppressions_email" ON "rndtechnosoft_email_suppressions"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_rules_tenant_id" ON "rndtechnosoft_email_sequence_rules"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_email_sequence_rule_events_outcome" ON "rndtechnosoft_email_sequence_rule_events"("tenant_id", "rule_id", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "uq_email_sequence_rule_events_event" ON "rndtechnosoft_email_sequence_rule_events"("rule_id", "lead_id", "event_at");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequences" ADD CONSTRAINT "fk_email_sequences_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequences" ADD CONSTRAINT "fk_email_sequences_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_steps" ADD CONSTRAINT "fk_email_sequence_steps_sequence" FOREIGN KEY ("tenant_id", "sequence_id") REFERENCES "rndtechnosoft_email_sequences"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_stop_stages" ADD CONSTRAINT "fk_email_sequence_stop_stages_sequence" FOREIGN KEY ("tenant_id", "sequence_id") REFERENCES "rndtechnosoft_email_sequences"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_stop_stages" ADD CONSTRAINT "fk_email_sequence_stop_stages_stage" FOREIGN KEY ("tenant_id", "stage_id") REFERENCES "rndtechnosoft_crm_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_enrollments" ADD CONSTRAINT "fk_email_sequence_enrollments_sequence" FOREIGN KEY ("tenant_id", "sequence_id") REFERENCES "rndtechnosoft_email_sequences"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_enrollments" ADD CONSTRAINT "fk_email_sequence_enrollments_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_enrollments" ADD CONSTRAINT "fk_email_sequence_enrollments_enrolled_by" FOREIGN KEY ("tenant_id", "enrolled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_enrollments" ADD CONSTRAINT "fk_email_sequence_enrollments_stopped_by" FOREIGN KEY ("tenant_id", "stopped_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_sends" ADD CONSTRAINT "fk_email_sequence_sends_sequence" FOREIGN KEY ("tenant_id", "sequence_id") REFERENCES "rndtechnosoft_email_sequences"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_sends" ADD CONSTRAINT "fk_email_sequence_sends_step" FOREIGN KEY ("tenant_id", "step_id") REFERENCES "rndtechnosoft_email_sequence_steps"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_sends" ADD CONSTRAINT "fk_email_sequence_sends_enrollment" FOREIGN KEY ("tenant_id", "enrollment_id") REFERENCES "rndtechnosoft_email_sequence_enrollments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_sends" ADD CONSTRAINT "fk_email_sequence_sends_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_events" ADD CONSTRAINT "fk_email_sequence_events_send" FOREIGN KEY ("tenant_id", "send_id") REFERENCES "rndtechnosoft_email_sequence_sends"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_suppressions" ADD CONSTRAINT "fk_email_suppressions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_suppressions" ADD CONSTRAINT "fk_email_suppressions_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rules" ADD CONSTRAINT "fk_email_sequence_rules_sequence" FOREIGN KEY ("tenant_id", "sequence_id") REFERENCES "rndtechnosoft_email_sequences"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rules" ADD CONSTRAINT "fk_email_sequence_rules_pipeline" FOREIGN KEY ("tenant_id", "pipeline_id") REFERENCES "rndtechnosoft_crm_pipelines"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rules" ADD CONSTRAINT "fk_email_sequence_rules_stage" FOREIGN KEY ("tenant_id", "stage_id") REFERENCES "rndtechnosoft_crm_stages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rules" ADD CONSTRAINT "fk_email_sequence_rules_source" FOREIGN KEY ("tenant_id", "source_id") REFERENCES "rndtechnosoft_crm_lead_sources"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rules" ADD CONSTRAINT "fk_email_sequence_rules_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rule_events" ADD CONSTRAINT "fk_email_sequence_rule_events_rule" FOREIGN KEY ("tenant_id", "rule_id") REFERENCES "rndtechnosoft_email_sequence_rules"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_email_sequence_rule_events" ADD CONSTRAINT "fk_email_sequence_rule_events_lead" FOREIGN KEY ("tenant_id", "lead_id") REFERENCES "rndtechnosoft_crm_leads"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;


-- A lead is in at most one sequence at a time.
CREATE UNIQUE INDEX "uq_email_sequence_enrollments_one_active" ON "rndtechnosoft_email_sequence_enrollments" ("tenant_id", "lead_id") WHERE "enrollment_status" = 'ACTIVE';
-- Sequence names are unique in a workspace, ignoring case.
CREATE UNIQUE INDEX "uq_email_sequences_name" ON "rndtechnosoft_email_sequences" ("tenant_id", lower("sequence_name"));
-- The worker reads mailboxes for replies to recent sends.
CREATE INDEX "ix_email_sequence_sends_sent_sender" ON "rndtechnosoft_email_sequence_sends" ("sender_member_id", "sent_at") WHERE "send_status" IN ('SENT', 'BOUNCED');

-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_email_sequences"
  ADD CONSTRAINT "ck_email_sequences_name" CHECK (char_length(btrim("sequence_name")) > 0),
  ADD CONSTRAINT "ck_email_sequences_status" CHECK ("sequence_status" IN ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED')),
  ADD CONSTRAINT "ck_email_sequences_sender" CHECK ("sender_mode" IN ('ORGANIZATION', 'LEAD_OWNER')),
  ADD CONSTRAINT "ck_email_sequences_window" CHECK ("window_start_minute" BETWEEN 0 AND 1439 AND "window_end_minute" BETWEEN 1 AND 1440 AND "window_end_minute" > "window_start_minute"),
  ADD CONSTRAINT "ck_email_sequences_weekdays" CHECK (cardinality("send_weekdays") BETWEEN 1 AND 7 AND "send_weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]),
  ADD CONSTRAINT "ck_email_sequences_limit" CHECK ("daily_limit" BETWEEN 1 AND 2000);

ALTER TABLE "rndtechnosoft_email_sequence_steps"
  ADD CONSTRAINT "ck_email_sequence_steps_delay" CHECK ("delay_amount" BETWEEN 0 AND 365 AND "delay_unit" IN ('WORKING_DAYS', 'CALENDAR_DAYS')),
  ADD CONSTRAINT "ck_email_sequence_steps_content" CHECK (char_length(btrim("subject")) > 0 AND char_length(btrim("body_text")) > 0 AND "step_order" >= 1);

ALTER TABLE "rndtechnosoft_email_sequence_enrollments"
  ADD CONSTRAINT "ck_email_sequence_enrollments_status" CHECK ("enrollment_status" IN ('ACTIVE', 'COMPLETED', 'STOPPED')),
  ADD CONSTRAINT "ck_email_sequence_enrollments_via" CHECK ("enrolled_via" IN ('MANUAL', 'BULK', 'RULE')),
  ADD CONSTRAINT "ck_email_sequence_enrollments_stopped" CHECK (("enrollment_status" = 'STOPPED') = ("stop_reason" IS NOT NULL AND "stopped_at" IS NOT NULL));

ALTER TABLE "rndtechnosoft_email_sequence_sends"
  ADD CONSTRAINT "ck_email_sequence_sends_status" CHECK ("send_status" IN ('SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'UNCERTAIN', 'CANCELLED', 'BOUNCED')),
  ADD CONSTRAINT "ck_email_sequence_sends_sent" CHECK ("send_status" NOT IN ('SENT', 'BOUNCED') OR ("sent_at" IS NOT NULL AND "message_id" IS NOT NULL AND "subject" IS NOT NULL)),
  ADD CONSTRAINT "ck_email_sequence_sends_attempts" CHECK ("attempt_count" >= 0);

ALTER TABLE "rndtechnosoft_email_sequence_events"
  ADD CONSTRAINT "ck_email_sequence_events_kind" CHECK ("event_kind" IN ('REPLY', 'AUTO_REPLY', 'BOUNCE') AND "match_method" IN ('THREAD', 'SENDER'));

ALTER TABLE "rndtechnosoft_email_suppressions"
  ADD CONSTRAINT "ck_email_suppressions_email" CHECK ("email" = lower(btrim("email")) AND "email" LIKE '%_@_%'),
  ADD CONSTRAINT "ck_email_suppressions_reason" CHECK ("suppression_reason" IN ('UNSUBSCRIBED', 'BOUNCED', 'MANUAL') AND "suppression_source" IN ('LINK', 'ONE_CLICK', 'BOUNCE', 'MANUAL'));

ALTER TABLE "rndtechnosoft_email_sequence_rules"
  ADD CONSTRAINT "ck_email_sequence_rules_trigger" CHECK (
    ("trigger_kind" = 'STAGE_ENTERED' AND "stage_id" IS NOT NULL AND "pipeline_id" IS NOT NULL)
    OR ("trigger_kind" = 'LEAD_CREATED')),
  ADD CONSTRAINT "ck_email_sequence_rules_enabled" CHECK (NOT "is_enabled" OR "enabled_at" IS NOT NULL);

ALTER TABLE "rndtechnosoft_email_sequence_rule_events"
  ADD CONSTRAINT "ck_email_sequence_rule_events_outcome" CHECK ("outcome" IN ('ENROLLED', 'SKIPPED'));

-- Permissions. Mirrors src/common/access/access-catalog.ts; every workspace
-- owner (ADMIN) role gets them, other roles when an administrator grants them.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'sequences.view', 'CRM', 'View drip sequences, enrollments and reports'),
  (gen_random_uuid(), 'sequences.manage', 'CRM', 'Create, edit, activate, pause and archive drip sequences, their sender and enrollment rules'),
  (gen_random_uuid(), 'sequences.enroll', 'CRM', 'Add leads to drip sequences and stop them'),
  (gen_random_uuid(), 'sequences.enroll_bulk', 'CRM', 'Add many leads to a drip sequence at once'),
  (gen_random_uuid(), 'sequences.logs.view', 'CRM', 'Read the emails drip sequences sent'),
  (gen_random_uuid(), 'sequences.suppression.manage', 'CRM', 'Manage the do-not-email list')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('sequences.view', 'sequences.manage', 'sequences.enroll', 'sequences.enroll_bulk', 'sequences.logs.view', 'sequences.suppression.manage')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
