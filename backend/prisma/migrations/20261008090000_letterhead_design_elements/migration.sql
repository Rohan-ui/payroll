-- Letterhead designer: rotation, hiding and locking for the logo and the
-- header and footer artwork, and page elements (text and image watermarks).
--
-- Existing letterheads keep printing as before: nothing is rotated, hidden or
-- locked, and they have no page elements. Positions are millimetres, as the
-- PDF draws them; the editor converts to screen pixels only to show them.

-- AlterTable
ALTER TABLE "rndtechnosoft_letterheads"
  ADD COLUMN "logo_rotation_deg" DECIMAL(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN "header_art_rotation_deg" DECIMAL(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN "footer_art_rotation_deg" DECIMAL(5,1) NOT NULL DEFAULT 0,
  ADD COLUMN "is_logo_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_header_art_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_footer_art_hidden" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_logo_locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_header_art_locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "is_footer_art_locked" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "rndtechnosoft_letterheads"
  ADD CONSTRAINT "ck_letterheads_rotation" CHECK (
    "logo_rotation_deg" BETWEEN -360 AND 360
    AND "header_art_rotation_deg" BETWEEN -360 AND 360
    AND "footer_art_rotation_deg" BETWEEN -360 AND 360);

-- CreateTable
CREATE TABLE "rndtechnosoft_letterhead_assets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "letterhead_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "width_px" INTEGER NOT NULL,
    "height_px" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_letterhead_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_letterhead_assets_size" CHECK ("width_px" > 0 AND "height_px" > 0)
);

-- CreateTable
CREATE TABLE "rndtechnosoft_letterhead_elements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "letterhead_id" UUID NOT NULL,
    "element_kind" VARCHAR(8) NOT NULL,
    "layer_order" INTEGER NOT NULL,
    "is_above_text" BOOLEAN NOT NULL DEFAULT false,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "x_mm" DECIMAL(6,1) NOT NULL,
    "y_mm" DECIMAL(6,1) NOT NULL,
    "width_mm" DECIMAL(6,1) NOT NULL,
    "height_mm" DECIMAL(6,1) NOT NULL,
    "rotation_deg" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "opacity" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "asset_id" UUID,
    "text_content" VARCHAR(200),
    "font_family" VARCHAR(16),
    "font_size_pt" DECIMAL(5,1),
    "is_bold" BOOLEAN NOT NULL DEFAULT false,
    "is_italic" BOOLEAN NOT NULL DEFAULT false,
    "text_color" VARCHAR(7),
    "text_align" VARCHAR(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

    CONSTRAINT "rndtechnosoft_letterhead_elements_pkey" PRIMARY KEY ("id"),
    -- On the largest page (A4 height, Letter width), at least 3 mm each way.
    CONSTRAINT "ck_letterhead_elements_box" CHECK (
      "x_mm" >= 0 AND "y_mm" >= 0 AND "width_mm" >= 3 AND "height_mm" >= 3
      AND "x_mm" + "width_mm" <= 215.9 AND "y_mm" + "height_mm" <= 297),
    CONSTRAINT "ck_letterhead_elements_rotation" CHECK ("rotation_deg" BETWEEN -360 AND 360),
    CONSTRAINT "ck_letterhead_elements_opacity" CHECK ("opacity" BETWEEN 0 AND 1),
    CONSTRAINT "ck_letterhead_elements_layer" CHECK ("layer_order" >= 0),
    -- An image element shows an uploaded image; a text element has its text and style, and nothing else.
    CONSTRAINT "ck_letterhead_elements_kind" CHECK (
      ("element_kind" = 'IMAGE' AND "asset_id" IS NOT NULL AND "text_content" IS NULL)
      OR ("element_kind" = 'TEXT' AND "asset_id" IS NULL
          AND char_length(btrim("text_content")) > 0
          AND "font_family" IN ('helvetica', 'times', 'courier')
          AND "font_size_pt" BETWEEN 6 AND 200
          AND "text_color" ~ '^#[0-9a-f]{6}$'
          AND "text_align" IN ('left', 'center', 'right')))
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_letterhead_assets_tenant_id" ON "rndtechnosoft_letterhead_assets"("tenant_id", "id");
CREATE UNIQUE INDEX "uq_letterhead_assets_letterhead_id" ON "rndtechnosoft_letterhead_assets"("tenant_id", "letterhead_id", "id");
CREATE UNIQUE INDEX "uq_letterhead_elements_layer" ON "rndtechnosoft_letterhead_elements"("tenant_id", "letterhead_id", "layer_order");
CREATE INDEX "ix_letterhead_elements_asset" ON "rndtechnosoft_letterhead_elements"("tenant_id", "letterhead_id", "asset_id");

-- AddForeignKey
ALTER TABLE "rndtechnosoft_letterhead_assets" ADD CONSTRAINT "fk_letterhead_assets_letterhead" FOREIGN KEY ("tenant_id", "letterhead_id") REFERENCES "rndtechnosoft_letterheads"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "rndtechnosoft_letterhead_elements" ADD CONSTRAINT "fk_letterhead_elements_letterhead" FOREIGN KEY ("tenant_id", "letterhead_id") REFERENCES "rndtechnosoft_letterheads"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey: an element's image belongs to the same letterhead (and so the same workspace).
ALTER TABLE "rndtechnosoft_letterhead_elements" ADD CONSTRAINT "fk_letterhead_elements_asset" FOREIGN KEY ("tenant_id", "letterhead_id", "asset_id") REFERENCES "rndtechnosoft_letterhead_assets"("tenant_id", "letterhead_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
