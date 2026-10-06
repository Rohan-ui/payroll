-- Where a letterhead's logo, header artwork and footer artwork sit, as set in
-- the visual editor: a box in millimetres from the top-left of the header (or
-- footer) area. No box (all four empty) keeps the automatic layout, which is
-- how every existing letterhead prints. "stretch" fills the box exactly;
-- otherwise the image keeps its proportions inside it.
ALTER TABLE "rndtechnosoft_letterheads"
  ADD COLUMN "logo_x_mm" DECIMAL(6,1),
  ADD COLUMN "logo_y_mm" DECIMAL(6,1),
  ADD COLUMN "logo_width_mm" DECIMAL(6,1),
  ADD COLUMN "logo_height_mm" DECIMAL(6,1),
  ADD COLUMN "logo_stretch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "header_art_x_mm" DECIMAL(6,1),
  ADD COLUMN "header_art_y_mm" DECIMAL(6,1),
  ADD COLUMN "header_art_width_mm" DECIMAL(6,1),
  ADD COLUMN "header_art_height_mm" DECIMAL(6,1),
  ADD COLUMN "header_art_stretch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "footer_art_x_mm" DECIMAL(6,1),
  ADD COLUMN "footer_art_y_mm" DECIMAL(6,1),
  ADD COLUMN "footer_art_width_mm" DECIMAL(6,1),
  ADD COLUMN "footer_art_height_mm" DECIMAL(6,1),
  ADD COLUMN "footer_art_stretch" BOOLEAN NOT NULL DEFAULT false;

-- A box is all or nothing, and lies at or after the area's top-left corner with a real size.
ALTER TABLE "rndtechnosoft_letterheads"
  ADD CONSTRAINT "ck_letterheads_logo_box" CHECK (
    (logo_x_mm IS NULL AND logo_y_mm IS NULL AND logo_width_mm IS NULL AND logo_height_mm IS NULL)
    OR (logo_x_mm >= 0 AND logo_y_mm >= 0 AND logo_width_mm > 0 AND logo_height_mm > 0)),
  ADD CONSTRAINT "ck_letterheads_header_art_box" CHECK (
    (header_art_x_mm IS NULL AND header_art_y_mm IS NULL AND header_art_width_mm IS NULL AND header_art_height_mm IS NULL)
    OR (header_art_x_mm >= 0 AND header_art_y_mm >= 0 AND header_art_width_mm > 0 AND header_art_height_mm > 0)),
  ADD CONSTRAINT "ck_letterheads_footer_art_box" CHECK (
    (footer_art_x_mm IS NULL AND footer_art_y_mm IS NULL AND footer_art_width_mm IS NULL AND footer_art_height_mm IS NULL)
    OR (footer_art_x_mm >= 0 AND footer_art_y_mm >= 0 AND footer_art_width_mm > 0 AND footer_art_height_mm > 0));
