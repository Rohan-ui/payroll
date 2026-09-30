-- HRMS onboarding, part 2: letter templates with approved versions, job offers
-- with their pay components and approval chain, and the candidate's response.
--
-- Tenant-owned throughout, with composite (tenant_id, id) references. The
-- database enforces the allowed statuses, one draft and one approved version
-- per template, one open offer per candidate, and non-negative amounts.
--
-- Onboarding emails can now be retried after a failure without ever sending
-- twice: a key is claimed as SENDING while its email is on the way.
--
-- Permissions (mirrors src/common/access/access-catalog.ts): every workspace
-- owner (ADMIN) role gets all of them; roles and role templates that can add
-- employees get offer management, sending and template editing, but not the
-- two approval permissions.

-- CreateTable
CREATE TABLE "rndtechnosoft_document_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_kind" VARCHAR(32) NOT NULL,
    "template_name" VARCHAR(160) NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_document_template_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "version_status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    "created_by_tenant_member_id" UUID,
    "approved_by_tenant_member_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_document_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_offers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "offer_code" VARCHAR(64) NOT NULL,
    "template_version_id" UUID NOT NULL,
    "job_title" VARCHAR(160) NOT NULL,
    "department_id" UUID,
    "designation_id" UUID,
    "employment_type_id" UUID,
    "reporting_manager_employee_id" UUID,
    "work_location" VARCHAR(200),
    "annual_ctc" DECIMAL(14,2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'INR',
    "probation_months" INTEGER,
    "joining_date" DATE NOT NULL,
    "expires_on" DATE NOT NULL,
    "special_terms" TEXT,
    "offer_status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "submission_number" INTEGER NOT NULL DEFAULT 0,
    "rendered_title" VARCHAR(200),
    "rendered_body" TEXT,
    "pdf_storage_key" VARCHAR(500),
    "pdf_sha256" CHAR(64),
    "response_token_hash" CHAR(64),
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "sent_by_tenant_member_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "response_ip" VARCHAR(64),
    "response_user_agent" VARCHAR(300),
    "accepted_name" VARCHAR(200),
    "decline_reason" TEXT,
    "withdrawn_reason" TEXT,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_offer_components" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "component_label" VARCHAR(120) NOT NULL,
    "annual_amount" DECIMAL(14,2) NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "rndtechnosoft_offer_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rndtechnosoft_offer_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "submission_number" INTEGER NOT NULL,
    "step_number" INTEGER NOT NULL,
    "approver_tenant_member_id" UUID NOT NULL,
    "approval_status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "approval_comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_offer_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_templates_tenant_id" ON "rndtechnosoft_document_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_document_templates_name" ON "rndtechnosoft_document_templates"("tenant_id", "template_kind", "template_name");

-- CreateIndex
CREATE UNIQUE INDEX "uq_template_versions_tenant_id" ON "rndtechnosoft_document_template_versions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_template_versions_number" ON "rndtechnosoft_document_template_versions"("tenant_id", "template_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "uq_offers_response_token" ON "rndtechnosoft_offers"("response_token_hash");

-- CreateIndex
CREATE INDEX "ix_offers_status" ON "rndtechnosoft_offers"("tenant_id", "offer_status");

-- CreateIndex
CREATE INDEX "ix_offers_candidate" ON "rndtechnosoft_offers"("tenant_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_offers_tenant_id" ON "rndtechnosoft_offers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_offers_code" ON "rndtechnosoft_offers"("tenant_id", "offer_code");

-- CreateIndex
CREATE INDEX "ix_offer_components_offer" ON "rndtechnosoft_offer_components"("tenant_id", "offer_id");

-- CreateIndex
CREATE INDEX "ix_offer_approvals_approver" ON "rndtechnosoft_offer_approvals"("tenant_id", "approver_tenant_member_id", "approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_offer_approvals_step" ON "rndtechnosoft_offer_approvals"("tenant_id", "offer_id", "submission_number", "step_number");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_templates" ADD CONSTRAINT "fk_document_templates_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_templates" ADD CONSTRAINT "fk_document_templates_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_template_versions" ADD CONSTRAINT "fk_template_versions_template" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "rndtechnosoft_document_templates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_template_versions" ADD CONSTRAINT "fk_template_versions_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_template_versions" ADD CONSTRAINT "fk_template_versions_approved_by" FOREIGN KEY ("tenant_id", "approved_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_template_version" FOREIGN KEY ("tenant_id", "template_version_id") REFERENCES "rndtechnosoft_document_template_versions"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_department" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "rndtechnosoft_departments"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_designation" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "rndtechnosoft_designations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_employment_type" FOREIGN KEY ("tenant_id", "employment_type_id") REFERENCES "rndtechnosoft_employment_types"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_reporting_manager" FOREIGN KEY ("tenant_id", "reporting_manager_employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_sent_by" FOREIGN KEY ("tenant_id", "sent_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offers" ADD CONSTRAINT "fk_offers_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offer_components" ADD CONSTRAINT "fk_offer_components_offer" FOREIGN KEY ("tenant_id", "offer_id") REFERENCES "rndtechnosoft_offers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offer_approvals" ADD CONSTRAINT "fk_offer_approvals_offer" FOREIGN KEY ("tenant_id", "offer_id") REFERENCES "rndtechnosoft_offers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_offer_approvals" ADD CONSTRAINT "fk_offer_approvals_approver" FOREIGN KEY ("tenant_id", "approver_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;


-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_document_templates"
  ADD CONSTRAINT "ck_document_templates_kind" CHECK ("template_kind" IN ('OFFER_LETTER', 'JOINING_LETTER', 'EMPLOYMENT_AGREEMENT', 'CERTIFICATE')),
  ADD CONSTRAINT "ck_document_templates_name" CHECK (char_length(btrim("template_name")) > 0);

ALTER TABLE "rndtechnosoft_document_template_versions"
  ADD CONSTRAINT "ck_template_versions_status" CHECK ("version_status" IN ('DRAFT', 'APPROVED', 'RETIRED')),
  ADD CONSTRAINT "ck_template_versions_number" CHECK ("version_number" >= 1),
  ADD CONSTRAINT "ck_template_versions_approval" CHECK (("version_status" = 'DRAFT') = ("approved_at" IS NULL));

-- At most one draft and one approved version of a template at a time.
CREATE UNIQUE INDEX "uq_template_versions_one_draft" ON "rndtechnosoft_document_template_versions" ("tenant_id", "template_id") WHERE "version_status" = 'DRAFT';
CREATE UNIQUE INDEX "uq_template_versions_one_approved" ON "rndtechnosoft_document_template_versions" ("tenant_id", "template_id") WHERE "version_status" = 'APPROVED';

ALTER TABLE "rndtechnosoft_offers"
  ADD CONSTRAINT "ck_offers_status" CHECK ("offer_status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN')),
  ADD CONSTRAINT "ck_offers_ctc" CHECK ("annual_ctc" >= 0),
  ADD CONSTRAINT "ck_offers_probation" CHECK ("probation_months" IS NULL OR "probation_months" BETWEEN 0 AND 24),
  ADD CONSTRAINT "ck_offers_submission" CHECK ("submission_number" >= 0),
  ADD CONSTRAINT "ck_offers_dates" CHECK ("expires_on" <= "joining_date" + 365),
  -- A sent or answered offer always has its letter and link on record.
  ADD CONSTRAINT "ck_offers_sent_letter" CHECK ("offer_status" NOT IN ('SENT', 'ACCEPTED', 'DECLINED') OR ("rendered_body" IS NOT NULL AND "sent_at" IS NOT NULL));

-- One open offer per candidate.
CREATE UNIQUE INDEX "uq_offers_one_open" ON "rndtechnosoft_offers" ("tenant_id", "candidate_id") WHERE "offer_status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT');

ALTER TABLE "rndtechnosoft_offer_components"
  ADD CONSTRAINT "ck_offer_components_amount" CHECK ("annual_amount" >= 0),
  ADD CONSTRAINT "ck_offer_components_label" CHECK (char_length(btrim("component_label")) > 0);

ALTER TABLE "rndtechnosoft_offer_approvals"
  ADD CONSTRAINT "ck_offer_approvals_status" CHECK ("approval_status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  ADD CONSTRAINT "ck_offer_approvals_step" CHECK ("step_number" >= 1 AND "submission_number" >= 1);

-- Onboarding emails: SENDING while a claimed email is on its way.
ALTER TABLE "rndtechnosoft_onboarding_notifications" DROP CONSTRAINT "ck_onboarding_notifications_status";
ALTER TABLE "rndtechnosoft_onboarding_notifications"
  ADD CONSTRAINT "ck_onboarding_notifications_status" CHECK ("delivery_status" IN ('SENDING', 'SENT', 'FAILED', 'NOT_SENT'));

-- Permissions.
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'onboarding.offers.manage', 'HRMS', 'Create, edit, submit and withdraw offers'),
  (gen_random_uuid(), 'onboarding.offers.approve', 'HRMS', 'Approve or reject offers you are asked to approve'),
  (gen_random_uuid(), 'onboarding.offers.send', 'HRMS', 'Send approved offers to candidates'),
  (gen_random_uuid(), 'onboarding.templates.manage', 'HRMS', 'Create and edit onboarding letter templates'),
  (gen_random_uuid(), 'onboarding.templates.approve', 'HRMS', 'Approve onboarding letter templates for use')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('onboarding.offers.manage', 'onboarding.offers.approve', 'onboarding.offers.send', 'onboarding.templates.manage', 'onboarding.templates.approve')
WHERE r.role_code = 'ADMIN'
   OR (
     p.permission_code IN ('onboarding.offers.manage', 'onboarding.offers.send', 'onboarding.templates.manage')
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
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('onboarding.offers.manage', 'onboarding.offers.send', 'onboarding.templates.manage')
ON CONFLICT (role_template_id, permission_id) DO NOTHING;
