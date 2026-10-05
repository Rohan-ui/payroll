-- Spreadsheet imports need a company, an email and a phone; many prospect
-- lists have no contact name, so a lead's first name becomes optional. No
-- existing value changes.
ALTER TABLE "rndtechnosoft_crm_leads" ALTER COLUMN "first_name" DROP NOT NULL;
