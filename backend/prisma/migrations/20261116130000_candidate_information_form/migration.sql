-- The candidate information form (sent by HR, filled in by the candidate from
-- a one-time link) and the eligibility decision that follows it. Existing
-- candidates keep their status; the new statuses only widen the allowed set.

ALTER TABLE "rndtechnosoft_candidates" DROP CONSTRAINT "ck_candidates_status";
ALTER TABLE "rndtechnosoft_candidates" ADD CONSTRAINT "ck_candidates_status" CHECK ("candidate_status" IN (
  'NEW', 'FORM_SENT', 'FORM_SUBMITTED', 'SCREENING', 'ELIGIBLE', 'NOT_ELIGIBLE', 'INTERVIEW_SCHEDULED', 'INTERVIEW_COMPLETED',
  'SELECTED', 'REJECTED', 'OFFER_SENT', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'DOCUMENT_COLLECTION', 'VERIFICATION',
  'READY_TO_JOIN', 'JOINED', 'WITHDRAWN'));

ALTER TABLE "rndtechnosoft_candidates"
  -- The form link: only the token's SHA-256 is kept; it is cleared once the form is submitted, so a link works once.
  ADD COLUMN "form_token_hash" CHAR(64),
  ADD COLUMN "form_link_number" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "form_link_sent_at" TIMESTAMPTZ(6),
  ADD COLUMN "form_link_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "form_request_message" VARCHAR(1000),
  ADD COLUMN "form_submitted_at" TIMESTAMPTZ(6),
  -- What the candidate tells us about themselves.
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "gender_code" VARCHAR(16),
  ADD COLUMN "alternate_phone" VARCHAR(32),
  ADD COLUMN "notice_period_days" INTEGER,
  ADD COLUMN "last_working_date" DATE,
  ADD COLUMN "skills" VARCHAR(2000),
  ADD COLUMN "additional_information" VARCHAR(2000),
  ADD COLUMN "emergency_contact_name" VARCHAR(160),
  ADD COLUMN "emergency_contact_relationship" VARCHAR(64),
  ADD COLUMN "emergency_contact_phone" VARCHAR(32),
  -- The eligibility decision: who, when, and why (always for "not eligible").
  ADD COLUMN "eligibility_decision" VARCHAR(16),
  ADD COLUMN "eligibility_decided_at" TIMESTAMPTZ(6),
  ADD COLUMN "eligibility_decided_by_tenant_member_id" UUID,
  ADD COLUMN "eligibility_remarks" VARCHAR(2000),
  ADD COLUMN "eligibility_reason" VARCHAR(500);

CREATE UNIQUE INDEX "uq_candidates_form_token" ON "rndtechnosoft_candidates"("form_token_hash");
ALTER TABLE "rndtechnosoft_candidates"
  ADD CONSTRAINT "ck_candidates_gender" CHECK ("gender_code" IS NULL OR "gender_code" IN ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED')),
  ADD CONSTRAINT "ck_candidates_notice" CHECK ("notice_period_days" IS NULL OR "notice_period_days" BETWEEN 0 AND 365),
  ADD CONSTRAINT "ck_candidates_eligibility" CHECK (
    ("eligibility_decision" IS NULL AND "eligibility_decided_at" IS NULL)
    OR ("eligibility_decision" = 'ELIGIBLE' AND "eligibility_decided_at" IS NOT NULL)
    OR ("eligibility_decision" = 'NOT_ELIGIBLE' AND "eligibility_decided_at" IS NOT NULL AND "eligibility_reason" IS NOT NULL)),
  ADD CONSTRAINT "fk_candidates_eligibility_by" FOREIGN KEY ("tenant_id", "eligibility_decided_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_candidate_addresses" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "address_type" VARCHAR(16) NOT NULL,
  "address_line_1" VARCHAR(200) NOT NULL,
  "address_line_2" VARCHAR(200),
  "city" VARCHAR(120) NOT NULL,
  "state_region" VARCHAR(120),
  "postal_code" VARCHAR(24),
  "country_code" CHAR(2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_candidate_addresses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_candidate_addresses_type" CHECK ("address_type" IN ('CURRENT', 'PERMANENT')),
  CONSTRAINT "fk_candidate_addresses_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_candidate_addresses_type" ON "rndtechnosoft_candidate_addresses"("tenant_id", "candidate_id", "address_type");
CREATE UNIQUE INDEX "uq_candidate_addresses_tenant_id" ON "rndtechnosoft_candidate_addresses"("tenant_id", "id");

CREATE TABLE "rndtechnosoft_candidate_education" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "qualification" VARCHAR(160) NOT NULL,
  "institution" VARCHAR(200) NOT NULL,
  "university" VARCHAR(200),
  "passing_year" INTEGER,
  "score" VARCHAR(32),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_candidate_education_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_candidate_education_year" CHECK ("passing_year" IS NULL OR "passing_year" BETWEEN 1950 AND 2100),
  CONSTRAINT "fk_candidate_education_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_candidate_education_candidate" ON "rndtechnosoft_candidate_education"("tenant_id", "candidate_id");
CREATE UNIQUE INDEX "uq_candidate_education_tenant_id" ON "rndtechnosoft_candidate_education"("tenant_id", "id");

CREATE TABLE "rndtechnosoft_candidate_experience" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "company_name" VARCHAR(200) NOT NULL,
  "designation" VARCHAR(160) NOT NULL,
  "start_date" DATE,
  "end_date" DATE,
  "is_current" BOOLEAN NOT NULL DEFAULT false,
  -- Annual salary as the candidate states it, exact decimal.
  "last_salary" DECIMAL(14,2),
  "responsibilities" VARCHAR(2000),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_candidate_experience_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_candidate_experience_dates" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date"),
  CONSTRAINT "ck_candidate_experience_salary" CHECK ("last_salary" IS NULL OR "last_salary" >= 0),
  CONSTRAINT "fk_candidate_experience_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_candidate_experience_candidate" ON "rndtechnosoft_candidate_experience"("tenant_id", "candidate_id");
CREATE UNIQUE INDEX "uq_candidate_experience_tenant_id" ON "rndtechnosoft_candidate_experience"("tenant_id", "id");

CREATE TABLE "rndtechnosoft_candidate_references" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "candidate_id" UUID NOT NULL,
  "reference_name" VARCHAR(160) NOT NULL,
  "relationship" VARCHAR(120),
  "company_name" VARCHAR(200),
  "phone" VARCHAR(32),
  "email" VARCHAR(320),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_candidate_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_candidate_references_contact" CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL),
  CONSTRAINT "fk_candidate_references_candidate" FOREIGN KEY ("tenant_id", "candidate_id") REFERENCES "rndtechnosoft_candidates"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE INDEX "ix_candidate_references_candidate" ON "rndtechnosoft_candidate_references"("tenant_id", "candidate_id");
CREATE UNIQUE INDEX "uq_candidate_references_tenant_id" ON "rndtechnosoft_candidate_references"("tenant_id", "id");
