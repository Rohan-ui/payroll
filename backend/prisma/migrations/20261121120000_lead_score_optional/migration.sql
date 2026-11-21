-- A lead has no score until something works one out. Every new lead used to
-- get 50, which the CRM then showed as if it had been calculated. Existing
-- values are left as they are.
ALTER TABLE "rndtechnosoft_crm_leads" ALTER COLUMN "ai_score" DROP DEFAULT;
ALTER TABLE "rndtechnosoft_crm_leads" ALTER COLUMN "ai_score" DROP NOT NULL;
ALTER TABLE "rndtechnosoft_crm_leads" ADD CONSTRAINT "ck_crm_leads_ai_score" CHECK ("ai_score" IS NULL OR "ai_score" BETWEEN 0 AND 100);
