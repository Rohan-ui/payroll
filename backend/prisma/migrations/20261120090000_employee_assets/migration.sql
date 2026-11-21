-- Company property given to an employee (laptop, phone, ID card, keys...) and
-- what happened to it: returned (good or damaged), lost, waived, or cancelled
-- when given by mistake. Not an inventory: one row per hand-over, kept for
-- good. IT looks after IT equipment, Admin after cards, keys and the rest.
CREATE TABLE "rndtechnosoft_employee_assets" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "asset_category" VARCHAR(24) NOT NULL,
  "owner_team" VARCHAR(16) NOT NULL,
  "asset_name" VARCHAR(160) NOT NULL,
  -- Serial number or asset tag.
  "asset_tag" VARCHAR(80),
  "assigned_date" DATE NOT NULL,
  "return_due_date" DATE,
  "return_status" VARCHAR(16) NOT NULL DEFAULT 'ISSUED',
  "return_date" DATE,
  "return_condition" VARCHAR(16),
  -- What the employee pays for a lost or damaged asset; recovered in the final settlement.
  "recovery_amount" DECIMAL(14,2),
  "remarks" VARCHAR(500),
  -- The exit during which the return was recorded.
  "separation_id" UUID,
  "assigned_by_tenant_member_id" UUID NOT NULL,
  "return_recorded_by_tenant_member_id" UUID,
  "return_recorded_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT "rndtechnosoft_employee_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_employee_assets_category" CHECK ("asset_category" IN ('LAPTOP', 'DESKTOP', 'MONITOR', 'MOBILE_PHONE', 'SIM_CARD', 'ID_CARD', 'ACCESS_CARD', 'KEYS', 'OTHER')),
  CONSTRAINT "ck_employee_assets_team" CHECK ("owner_team" IN ('IT', 'ADMIN')),
  CONSTRAINT "ck_employee_assets_status" CHECK ("return_status" IN ('ISSUED', 'RETURNED', 'LOST', 'WAIVED', 'CANCELLED')),
  CONSTRAINT "ck_employee_assets_condition" CHECK ("return_condition" IS NULL OR "return_condition" IN ('GOOD', 'DAMAGED')),
  CONSTRAINT "ck_employee_assets_name" CHECK (length(btrim("asset_name")) > 0),
  CONSTRAINT "ck_employee_assets_due" CHECK ("return_due_date" IS NULL OR "return_due_date" >= "assigned_date"),
  -- Still with the employee: nothing about a return. Otherwise: who recorded it and when.
  CONSTRAINT "ck_employee_assets_open" CHECK (("return_status" = 'ISSUED') = ("return_recorded_at" IS NULL) AND ("return_recorded_at" IS NULL) = ("return_recorded_by_tenant_member_id" IS NULL)),
  CONSTRAINT "ck_employee_assets_returned" CHECK ("return_status" <> 'RETURNED' OR ("return_date" IS NOT NULL AND "return_condition" IS NOT NULL)),
  CONSTRAINT "ck_employee_assets_return_date" CHECK ("return_date" IS NULL OR "return_date" >= "assigned_date"),
  CONSTRAINT "ck_employee_assets_reason" CHECK ("return_status" NOT IN ('WAIVED', 'CANCELLED') OR length(btrim(coalesce("remarks", ''))) > 0),
  CONSTRAINT "ck_employee_assets_recovery" CHECK ("recovery_amount" IS NULL OR ("recovery_amount" > 0 AND ("return_status" = 'LOST' OR ("return_status" = 'RETURNED' AND "return_condition" = 'DAMAGED')))),
  CONSTRAINT "fk_employee_assets_employee" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "rndtechnosoft_employees"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_employee_assets_separation" FOREIGN KEY ("tenant_id", "separation_id") REFERENCES "rndtechnosoft_employee_separations"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_employee_assets_assigned_by" FOREIGN KEY ("tenant_id", "assigned_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_employee_assets_return_recorded_by" FOREIGN KEY ("tenant_id", "return_recorded_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_employee_assets_tenant_id" ON "rndtechnosoft_employee_assets"("tenant_id", "id");
CREATE INDEX "ix_employee_assets_employee" ON "rndtechnosoft_employee_assets"("tenant_id", "employee_id", "return_status");
CREATE INDEX "ix_employee_assets_separation" ON "rndtechnosoft_employee_assets"("tenant_id", "separation_id");
-- One asset tag can be with only one person at a time.
CREATE UNIQUE INDEX "uq_employee_assets_issued_tag" ON "rndtechnosoft_employee_assets"("tenant_id", lower("asset_tag")) WHERE "return_status" = 'ISSUED' AND "asset_tag" IS NOT NULL;

-- ── Permissions (mirrors src/common/access/access-catalog.ts) ───────────────
INSERT INTO rndtechnosoft_permissions (id, permission_code, module_code, permission_name)
VALUES
  (gen_random_uuid(), 'assets.view', 'HRMS', 'See the company assets given to employees'),
  (gen_random_uuid(), 'assets.it.manage', 'HRMS', 'Give out and take back IT assets (laptops, desktops, monitors, phones, SIM cards)'),
  (gen_random_uuid(), 'assets.admin.manage', 'HRMS', 'Give out and take back ID cards, access cards, keys and other company property')
ON CONFLICT (permission_code) DO UPDATE
SET module_code = EXCLUDED.module_code,
    permission_name = EXCLUDED.permission_name;

INSERT INTO rndtechnosoft_role_permissions (id, tenant_id, role_id, permission_id)
SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
FROM rndtechnosoft_roles r
JOIN rndtechnosoft_permissions p ON p.permission_code IN ('assets.view', 'assets.it.manage', 'assets.admin.manage')
WHERE r.role_code = 'ADMIN'
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

INSERT INTO rndtechnosoft_role_template_permissions (id, role_template_id, permission_id)
SELECT gen_random_uuid(), t.id, p.id
FROM rndtechnosoft_role_templates t
JOIN rndtechnosoft_permissions p ON p.permission_code = 'assets.view'
WHERE t.template_code = 'HR_ACCOUNTANT'
ON CONFLICT DO NOTHING;
