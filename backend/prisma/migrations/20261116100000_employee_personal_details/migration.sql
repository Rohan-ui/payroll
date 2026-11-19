-- Personal details the employee profile records beyond name, birth date and gender.
-- All optional: existing employees keep every value they have and gain empty fields.
ALTER TABLE "rndtechnosoft_employees" ADD COLUMN "marital_status" VARCHAR(16);
ALTER TABLE "rndtechnosoft_employees" ADD COLUMN "blood_group" VARCHAR(3);
ALTER TABLE "rndtechnosoft_employees" ADD COLUMN "nationality_country_code" CHAR(2);
ALTER TABLE "rndtechnosoft_employees" ADD COLUMN "personal_mobile" VARCHAR(32);
ALTER TABLE "rndtechnosoft_employees" ADD COLUMN "alternate_mobile" VARCHAR(32);

ALTER TABLE "rndtechnosoft_employees" ADD CONSTRAINT "ck_employees_marital_status"
  CHECK ("marital_status" IS NULL OR "marital_status" IN ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'SEPARATED'));
ALTER TABLE "rndtechnosoft_employees" ADD CONSTRAINT "ck_employees_blood_group"
  CHECK ("blood_group" IS NULL OR "blood_group" IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'));
ALTER TABLE "rndtechnosoft_employees" ADD CONSTRAINT "ck_employees_nationality"
  CHECK ("nationality_country_code" IS NULL OR "nationality_country_code" ~ '^[A-Z]{2}$');
