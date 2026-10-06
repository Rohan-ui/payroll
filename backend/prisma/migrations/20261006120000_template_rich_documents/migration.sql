-- Formatted letters: the editor's document (JSON) for a template version, and
-- the filled document an offer keeps once submitted. Existing rows keep NULL:
-- they are plain-text letters and print exactly as before.
ALTER TABLE "rndtechnosoft_document_template_versions" ADD COLUMN "body_document" JSONB;
ALTER TABLE "rndtechnosoft_offers" ADD COLUMN "rendered_document" JSONB;

-- A document is a JSON object of type "doc".
ALTER TABLE "rndtechnosoft_document_template_versions"
  ADD CONSTRAINT "ck_template_versions_body_document" CHECK ("body_document" IS NULL OR ("body_document" ->> 'type') = 'doc');
ALTER TABLE "rndtechnosoft_offers"
  ADD CONSTRAINT "ck_offers_rendered_document" CHECK ("rendered_document" IS NULL OR ("rendered_document" ->> 'type') = 'doc');
