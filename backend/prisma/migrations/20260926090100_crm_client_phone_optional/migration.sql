-- A client converted from a lead without a phone number has none either.
ALTER TABLE rndtechnosoft_crm_clients ALTER COLUMN phone DROP NOT NULL;
