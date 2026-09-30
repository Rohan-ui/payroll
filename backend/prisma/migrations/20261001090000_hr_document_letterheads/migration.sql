-- HRMS documents: company letterheads, and each template version's page
-- layout (letterhead, page size, margins, page numbers).
--
-- A letterhead holds the company's details and, stored privately, its logo
-- and optional header and footer artwork. Layout sits on the template
-- version, so it is reviewed and approved together with the wording.
-- Existing versions keep their current plain layout (no letterhead, A4,
-- 20 mm margins, no page numbers). Letters already sent keep their PDF.
--
-- No new permissions: letterheads are managed with onboarding.templates.approve,
-- since a letterhead change shows on documents from approved templates.

-- AlterTable
ALTER TABLE "rndtechnosoft_document_template_versions" ADD COLUMN     "letterhead_id" UUID,
ADD COLUMN     "margin_mm" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "page_size" VARCHAR(8) NOT NULL DEFAULT 'A4',
ADD COLUMN     "show_page_numbers" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "rndtechnosoft_letterheads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "letterhead_name" VARCHAR(120) NOT NULL,
    "company_name" VARCHAR(200) NOT NULL,
    "address_text" VARCHAR(500),
    "phone" VARCHAR(64),
    "email" VARCHAR(320),
    "website" VARCHAR(200),
    "registration_text" VARCHAR(300),
    "footer_text" VARCHAR(500),
    "logo_position" VARCHAR(8) NOT NULL DEFAULT 'LEFT',
    "logo_storage_key" VARCHAR(500),
    "header_image_storage_key" VARCHAR(500),
    "footer_image_storage_key" VARCHAR(500),
    "header_height_mm" INTEGER NOT NULL DEFAULT 30,
    "footer_height_mm" INTEGER NOT NULL DEFAULT 16,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_by_tenant_member_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_letterheads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_letterheads_tenant_id" ON "rndtechnosoft_letterheads"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_document_template_versions" ADD CONSTRAINT "fk_template_versions_letterhead" FOREIGN KEY ("tenant_id", "letterhead_id") REFERENCES "rndtechnosoft_letterheads"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_letterheads" ADD CONSTRAINT "fk_letterheads_tenant" FOREIGN KEY ("tenant_id") REFERENCES "rndtechnosoft_tenants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_letterheads" ADD CONSTRAINT "fk_letterheads_created_by" FOREIGN KEY ("tenant_id", "created_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;



-- Rules the database enforces.
ALTER TABLE "rndtechnosoft_document_template_versions"
  ADD CONSTRAINT "ck_template_versions_page_size" CHECK ("page_size" IN ('A4', 'LETTER')),
  ADD CONSTRAINT "ck_template_versions_margin" CHECK ("margin_mm" BETWEEN 10 AND 40);

ALTER TABLE "rndtechnosoft_letterheads"
  ADD CONSTRAINT "ck_letterheads_name" CHECK (char_length(btrim("letterhead_name")) > 0),
  ADD CONSTRAINT "ck_letterheads_company" CHECK (char_length(btrim("company_name")) > 0),
  ADD CONSTRAINT "ck_letterheads_logo_position" CHECK ("logo_position" IN ('LEFT', 'CENTER', 'RIGHT')),
  ADD CONSTRAINT "ck_letterheads_header_height" CHECK ("header_height_mm" BETWEEN 15 AND 70),
  ADD CONSTRAINT "ck_letterheads_footer_height" CHECK ("footer_height_mm" BETWEEN 8 AND 50);

-- Names are unique in a workspace; at most one default letterhead in use.
CREATE UNIQUE INDEX "uq_letterheads_name" ON "rndtechnosoft_letterheads" ("tenant_id", lower("letterhead_name"));
CREATE UNIQUE INDEX "uq_letterheads_one_default" ON "rndtechnosoft_letterheads" ("tenant_id") WHERE "is_default" AND NOT "is_archived";
