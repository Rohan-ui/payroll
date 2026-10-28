-- HRMS offboarding: an employee's exit, from resignation or termination to
-- their last working day.
--
--   * One open exit per employee. An employee's own resignation waits for HR
--     to accept it; an exit HR starts is under way at once.
--   * The exit checklist is per team (manager, IT, admin, finance, HR). An
--     item is cleared or waived by a named member, and a waiver needs a note.
--   * Nothing is deleted: a withdrawn or cancelled exit keeps who closed it
--     and why, and a completed exit keeps who completed it.

CREATE TABLE "rndtechnosoft_employee_separations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "separation_type" VARCHAR(20) NOT NULL,
    "separation_status" VARCHAR(20) NOT NULL,
    "separation_reason" VARCHAR(1000) NOT NULL,
    -- The day notice was given.
    "notice_date" DATE NOT NULL,
    -- From the employee's employment record when the exit started; NULL when none was recorded there.
    "notice_period_days" INTEGER,
    -- The last day the employee (or HR, when HR started it) asked for, kept as asked.
    "requested_last_working_date" DATE NOT NULL,
    -- The agreed last day; it becomes the employee's exit date on completion.
    "last_working_date" DATE NOT NULL,
    "is_self_service" BOOLEAN NOT NULL,
    "requested_by_tenant_member_id" UUID NOT NULL,
    "approved_by_tenant_member_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "exit_interview_date" DATE,
    "exit_interview_notes" VARCHAR(4000),
    "rehire_eligible" BOOLEAN,
    "exit_interview_recorded_by_tenant_member_id" UUID,
    "completed_by_tenant_member_id" UUID,
    "completed_at" TIMESTAMPTZ(6),
    -- Who withdrew (the employee) or cancelled (HR) the exit, and why.
    "closed_by_tenant_member_id" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_employee_separations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_employee_separations_type" CHECK ("separation_type" IN ('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'CONTRACT_END')),
    CONSTRAINT "ck_employee_separations_status" CHECK ("separation_status" IN ('PENDING_APPROVAL', 'IN_PROGRESS', 'COMPLETED', 'WITHDRAWN', 'CANCELLED')),
    CONSTRAINT "ck_employee_separations_self_service" CHECK (NOT "is_self_service" OR "separation_type" = 'RESIGNATION'),
    CONSTRAINT "ck_employee_separations_notice_days" CHECK ("notice_period_days" IS NULL OR "notice_period_days" BETWEEN 0 AND 365),
    CONSTRAINT "ck_employee_separations_dates" CHECK ("last_working_date" >= "notice_date" AND "requested_last_working_date" >= "notice_date"),
    CONSTRAINT "ck_employee_separations_approved" CHECK ("separation_status" NOT IN ('IN_PROGRESS', 'COMPLETED') OR "approved_at" IS NOT NULL),
    CONSTRAINT "ck_employee_separations_completed" CHECK (("separation_status" = 'COMPLETED') = ("completed_at" IS NOT NULL)),
    CONSTRAINT "ck_employee_separations_closed" CHECK (("separation_status" IN ('WITHDRAWN', 'CANCELLED')) = ("closed_at" IS NOT NULL))
);

CREATE UNIQUE INDEX "uq_employee_separations_tenant_id" ON "rndtechnosoft_employee_separations"("tenant_id", "id");
-- At most one open exit per employee.
CREATE UNIQUE INDEX "uq_employee_separations_open" ON "rndtechnosoft_employee_separations"("tenant_id", "employee_id") WHERE "separation_status" IN ('PENDING_APPROVAL', 'IN_PROGRESS');
CREATE INDEX "ix_employee_separations_status" ON "rndtechnosoft_employee_separations"("tenant_id", "separation_status", "last_working_date");
CREATE INDEX "ix_employee_separations_employee" ON "rndtechnosoft_employee_separations"("tenant_id", "employee_id");

ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_requested_by" FOREIGN KEY ("tenant_id", "requested_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_approved_by" FOREIGN KEY ("tenant_id", "approved_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_interview_by" FOREIGN KEY ("tenant_id", "exit_interview_recorded_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_completed_by" FOREIGN KEY ("tenant_id", "completed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_closed_by" FOREIGN KEY ("tenant_id", "closed_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "rndtechnosoft_separation_clearance_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "separation_id" UUID NOT NULL,
    "clearance_team" VARCHAR(16) NOT NULL,
    "item_title" VARCHAR(200) NOT NULL,
    "display_order" INTEGER NOT NULL,
    "item_status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "cleared_by_tenant_member_id" UUID,
    "cleared_at" TIMESTAMPTZ(6),
    "clearance_note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_separation_clearance_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_separation_clearance_items_team" CHECK ("clearance_team" IN ('MANAGER', 'IT', 'ADMIN', 'FINANCE', 'HR')),
    CONSTRAINT "ck_separation_clearance_items_status" CHECK ("item_status" IN ('PENDING', 'CLEARED', 'WAIVED')),
    CONSTRAINT "ck_separation_clearance_items_cleared" CHECK (("item_status" = 'PENDING') = ("cleared_at" IS NULL) AND ("cleared_at" IS NULL) = ("cleared_by_tenant_member_id" IS NULL)),
    CONSTRAINT "ck_separation_clearance_items_waiver_note" CHECK ("item_status" <> 'WAIVED' OR "clearance_note" IS NOT NULL)
);

CREATE UNIQUE INDEX "uq_separation_clearance_items_tenant_id" ON "rndtechnosoft_separation_clearance_items"("tenant_id", "id");
CREATE INDEX "ix_separation_clearance_items_separation" ON "rndtechnosoft_separation_clearance_items"("tenant_id", "separation_id", "display_order");

ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD CONSTRAINT "fk_separation_clearance_items_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_separation_clearance_items" ADD CONSTRAINT "fk_separation_clearance_items_cleared_by" FOREIGN KEY ("tenant_id", "cleared_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ── Permissions ─────────────────────────────────────────────────────────────

INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'offboarding.my.view', 'HRMS', 'Resign and follow their own exit (people only ever see their own)'),
  (gen_random_uuid(), 'offboarding.view', 'HRMS', 'View exits, their checklists and exit interviews'),
  (gen_random_uuid(), 'offboarding.manage', 'HRMS', 'Start exits, accept resignations, agree the last working day, record exit interviews and cancel exits'),
  (gen_random_uuid(), 'offboarding.clearance.update', 'HRMS', 'Clear or waive exit-checklist items'),
  (gen_random_uuid(), 'offboarding.complete', 'HRMS', 'Complete exits: set the exit date, mark the employee exited and end their sign-in to this workspace')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

-- Everyone may resign and follow their own exit.
INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.my.view'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code = 'offboarding.my.view'
ON CONFLICT DO NOTHING;

-- HR & Accountant roles made from now on run exits too.
INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete')
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
