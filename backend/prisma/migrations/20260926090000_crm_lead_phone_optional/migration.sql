-- A lead's phone number is optional in the CRM form and in imports. The
-- column required one, so the application invented placeholder numbers.
ALTER TABLE rndtechnosoft_crm_leads ALTER COLUMN phone DROP NOT NULL;
