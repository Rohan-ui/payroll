-- Payroll, phase 3: payslip lines carry the categories the salary engine
-- uses, including EMPLOYER_CONTRIBUTION (longer than the old 16 characters).
ALTER TABLE "rndtechnosoft_payslip_lines" ALTER COLUMN "component_category" SET DATA TYPE VARCHAR(32);
