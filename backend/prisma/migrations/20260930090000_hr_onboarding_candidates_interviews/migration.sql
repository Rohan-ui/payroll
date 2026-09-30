-- HRMS onboarding, part 1: candidates, their workflow timeline, interviews
-- (rounds, panel, feedback, decisions) and onboarding emails.
--
-- Everything is tenant-owned and every reference between these tables and to
-- departments, designations, employment types, members and employees uses the
-- composite (tenant_id, id) keys, so no row can point into another workspace.
-- The database also enforces the allowed statuses, non-negative amounts, one
-- active candidate per email, and one live interview per round.
--
-- Permissions (mirrors src/common/access/access-catalog.ts) go to every
-- workspace owner (ADMIN) role, and, except the workflow override, to every
-- role and role template that can already add employees.

-- CreateTable
CREATE TABLE "rndtechnosoft_candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_code" VARCHAR(64) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32),
    "address" TEXT,
    "applied_position" VARCHAR(160) NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "employment_type_id" UUID,
    "hiring_source" VARCHAR(64),
    "expected_salary" DECIMAL(14,2),
    "experience_years" DECIMAL(4,1),
    "expected_joining_date" DATE,
    "recruiter_tenant_member_id" UUID,
    "candidate_status" VARCHAR(32) NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "employee_id" UUID,
    "archived_at" TIMESTAMPTZ(6),
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_candidate_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "event_type" VARCHAR(48) NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32),
    "is_override" BOOLEAN NOT NULL DEFAULT false,
    "summary" VARCHAR(300) NOT NULL,
    "notes" TEXT,
    "actor_tenant_member_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_candidate_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_interviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "round_name" VARCHAR(120),
    "interview_type" VARCHAR(16) NOT NULL,
    "scheduled_start" TIMESTAMPTZ(6) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "location" VARCHAR(300),
    "meeting_link" VARCHAR(500),
    "instructions" TEXT,
    "interview_status" VARCHAR(16) NOT NULL DEFAULT 'SCHEDULED',
    "cancel_reason" VARCHAR(500),
    "decision" VARCHAR(16),
    "decision_notes" TEXT,
    "decided_by_tenant_member_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_interview_panelists" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "interview_id" UUID NOT NULL,
    "tenant_member_id" UUID NOT NULL,
    "feedback_rating" SMALLINT,
    "feedback_recommendation" VARCHAR(16),
    "feedback_notes" TEXT,
    "feedback_submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_interview_panelists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_onboarding_notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "template_code" VARCHAR(64) NOT NULL,
    "recipient_email" VARCHAR(320) NOT NULL,
    "candidate_id" UUID,
    "interview_id" UUID,
    "delivery_status" VARCHAR(32) NOT NULL,
    "error_message" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_onboarding_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_candidates_status" ON "rndtechnosoft_candidates"("tenant_id", "candidate_status");

-- CreateIndex
CREATE INDEX "ix_candidates_created" ON "rndtechnosoft_candidates"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_candidates_tenant_id" ON "rndtechnosoft_candidates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_candidates_code" ON "rndtechnosoft_candidates"("tenant_id", "candidate_code");

-- CreateIndex
CREATE UNIQUE INDEX "uq_candidates_employee" ON "rndtechnosoft_candidates"("tenant_id", "employee_id");

-- CreateIndex
CREATE INDEX "ix_candidate_events_candidate" ON "rndtechnosoft_candidate_events"("tenant_id", "candidate_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_interviews_start" ON "rndtechnosoft_interviews"("tenant_id", "scheduled_start");

-- CreateIndex
CREATE INDEX "ix_interviews_candidate" ON "rndtechnosoft_interviews"("tenant_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_interviews_tenant_id" ON "rndtechnosoft_interviews"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ix_interview_panelists_member" ON "rndtechnosoft_interview_panelists"("tenant_id", "tenant_member_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_interview_panelists" ON "rndtechnosoft_interview_panelists"("tenant_id", "interview_id", "tenant_member_id");

-- CreateIndex
CREATE INDEX "ix_onboarding_notifications_candidate" ON "rndtechnosoft_onboarding_notifications"("tenant_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_onboarding_notifications_key" ON "rndtechnosoft_onboarding_notifications"("tenant_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_employment_type" FOREIGN KEY ("tenant_id", "employment_type_id") REFERENCES "rndtechnosoft_employment_types"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_recruiter" FOREIGN KEY ("tenant_id", "recruiter_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "fk_candidates_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_events" ADD CONSTRAINT "fk_candidate_events_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_candidate_events" ADD CONSTRAINT "fk_candidate_events_actor" FOREIGN KEY ("tenant_id", "actor_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_interviews" ADD CONSTRAINT "fk_interviews_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_interviews" ADD CONSTRAINT "fk_interviews_decided_by" FOREIGN KEY ("tenant_id", "decided_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_interviews" ADD CONSTRAINT "fk_interviews_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_interview_panelists" ADD CONSTRAINT "fk_interview_panelists_interview" FOREIGN KEY ("tenant_id", "interview_id") REFERENCES "rndtechnosoft_interviews"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_interview_panelists" ADD CONSTRAINT "fk_interview_panelists_member" FOREIGN KEY ("tenant_id", "tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_onboarding_notifications" ADD CONSTRAINT "fk_onboarding_notifications_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_candidates"
  ADD CONSTRAINT "ck_candidates_status" CHECK ("candidate_status" IN (
    'NEW', 'SCREENING', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED', 'SELECTED', 'REJECTED', 'OFFER_SENT', 'OFFER_ACCEPTED',
    'OFFER_DECLINED', 'DOCUMENT_COLLECTION', 'VERIFICATION', 'READY_TO_JOIN', 'JOINED', 'WITHDRAWN')),
  ADD CONSTRAINT "ck_candidates_name" CHECK (char_length(btrim("full_name")) > 0),
  ADD CONSTRAINT "ck_candidates_salary" CHECK ("expected_salary" IS NULL OR "expected_salary" >= 0),
  ADD CONSTRAINT "ck_candidates_experience" CHECK ("experience_years" IS NULL OR "experience_years" BETWEEN 0 AND 60);

-- One active (not archived) candidate per email address in a workspace.
CREATE UNIQUE INDEX "uq_candidates_active_email" ON "rndtechnosoft_candidates" ("tenant_id", lower("email")) WHERE "archived_at" IS NULL;

ALTER TABLE "rndtechnosoft_interviews"
  ADD CONSTRAINT "ck_interviews_round" CHECK ("round_number" >= 1),
  ADD CONSTRAINT "ck_interviews_type" CHECK ("interview_type" IN ('IN_PERSON', 'PHONE', 'ONLINE')),
  ADD CONSTRAINT "ck_interviews_duration" CHECK ("duration_minutes" BETWEEN 5 AND 600),
  ADD CONSTRAINT "ck_interviews_status" CHECK ("interview_status" IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  ADD CONSTRAINT "ck_interviews_decision" CHECK ("decision" IS NULL OR "decision" IN ('ADVANCE', 'SELECT', 'REJECT'));

-- One live (not cancelled) interview per round of a candidate.
CREATE UNIQUE INDEX "uq_interviews_live_round" ON "rndtechnosoft_interviews" ("tenant_id", "candidate_id", "round_number") WHERE "interview_status" <> 'CANCELLED';

ALTER TABLE "rndtechnosoft_interview_panelists"
  ADD CONSTRAINT "ck_interview_panelists_rating" CHECK ("feedback_rating" IS NULL OR "feedback_rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ck_interview_panelists_recommendation" CHECK ("feedback_recommendation" IS NULL OR "feedback_recommendation" IN ('STRONG_YES', 'YES', 'NO', 'STRONG_NO'));

ALTER TABLE "rndtechnosoft_onboarding_notifications"
  ADD CONSTRAINT "ck_onboarding_notifications_status" CHECK ("delivery_status" IN ('SENT', 'FAILED', 'NOT_SENT'));

-- Permissions.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'onboarding.view', 'HRMS', 'View onboarding candidates, interviews and the dashboard'),
  (gen_random_uuid(), 'onboarding.candidates.manage', 'HRMS', 'Add, edit and archive candidates and move them through the workflow'),
  (gen_random_uuid(), 'onboarding.candidates.decide', 'HRMS', 'Select or reject candidates after interviews'),
  (gen_random_uuid(), 'onboarding.candidates.override', 'HRMS', 'Override the candidate workflow with a recorded reason'),
  (gen_random_uuid(), 'onboarding.interviews.schedule', 'HRMS', 'Schedule, reschedule and cancel interviews'),
  (gen_random_uuid(), 'onboarding.interviews.feedback', 'HRMS', 'Record feedback on interviews you are on')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code LIKE 'onboarding.%'
WHERE r.role_code = 'ADMIN'
   OR (
     p.permission_code <> 'onboarding.candidates.override'
     AND EXISTS (
       SELECT 1
       FROM rndtechnosoft_role_permissions rp
       JOIN rndtechnosoft_permissions hr ON hr.id = rp.permission_id
       WHERE rp.role_id = r.id AND rp.tenant_id = r.tenant_id AND hr.permission_code = 'people.create'
     )
   )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), tp.role_template_id, p.id
FROM rndtechnosoft_role_template_permissions tp
JOIN rndtechnosoft_permissions hr ON hr.id = tp.permission_id AND hr.permission_code = 'people.create'
JOIN rndtechnosoft_permissions p ON p.permission_code LIKE 'onboarding.%' AND p.permission_code <> 'onboarding.candidates.override'
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
