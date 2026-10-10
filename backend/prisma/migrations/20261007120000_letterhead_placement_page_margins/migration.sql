-- Page layout flexibility for HRMS documents.
--
-- Template versions get a margin per side (0 to 60 mm) in place of one margin
-- of 10 to 40 mm. Every existing version keeps its margin on all four sides,
-- so approved versions print exactly as before.
--
-- Letterheads may be placed at set distances from the page edges (0 is the
-- edge of the paper), independent of the template's margins. None (all three
-- empty) keeps them at the template's margins, which is how every existing
-- letterhead prints. The letter text stays inside the margins and clear of the
-- letterhead.

-- AlterTable
ALTER TABLE "rndtechnosoft_document_template_versions"
  ADD COLUMN "margin_top_mm" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "margin_right_mm" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "margin_bottom_mm" INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN "margin_left_mm" INTEGER NOT NULL DEFAULT 20;

UPDATE "rndtechnosoft_document_template_versions"
SET "margin_top_mm" = "margin_mm",
    "margin_right_mm" = "margin_mm",
    "margin_bottom_mm" = "margin_mm",
    "margin_left_mm" = "margin_mm";

ALTER TABLE "rndtechnosoft_document_template_versions"
  DROP CONSTRAINT "ck_template_versions_margin",
  DROP COLUMN "margin_mm",
  ADD CONSTRAINT "ck_template_versions_margins" CHECK (
    "margin_top_mm" BETWEEN 0 AND 60 AND "margin_right_mm" BETWEEN 0 AND 60
    AND "margin_bottom_mm" BETWEEN 0 AND 60 AND "margin_left_mm" BETWEEN 0 AND 60);

-- AlterTable
ALTER TABLE "rndtechnosoft_letterheads"
  ADD COLUMN "header_offset_mm" INTEGER,
  ADD COLUMN "footer_offset_mm" INTEGER,
  ADD COLUMN "side_offset_mm" INTEGER;

-- A placement is all or nothing, each distance 0 to 60 mm.
ALTER TABLE "rndtechnosoft_letterheads"
  ADD CONSTRAINT "ck_letterheads_placement" CHECK (
    ("header_offset_mm" IS NULL AND "footer_offset_mm" IS NULL AND "side_offset_mm" IS NULL)
    OR ("header_offset_mm" BETWEEN 0 AND 60 AND "footer_offset_mm" BETWEEN 0 AND 60 AND "side_offset_mm" BETWEEN 0 AND 60));
