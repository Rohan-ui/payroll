-- Attendance statuses are one fixed set, the one attendance and payroll use.
-- The COSEC sync used to store a weekly off as WEEK_OFF (COSEC's own word),
-- which payroll didn't recognise, so those employees were held. The same
-- days are now stored as WEEKEND, and only known statuses can be saved.
UPDATE "rndtechnosoft_attendance_records"
SET "attendance_status" = 'WEEKEND', "updated_at" = CURRENT_TIMESTAMP(6)
WHERE "attendance_status" = 'WEEK_OFF';

-- NOT VALID: enforced for every new or changed row, without refusing the
-- deployment over any other old value (an old row with one can still be
-- corrected to a known status).
ALTER TABLE "rndtechnosoft_attendance_records"
  ADD CONSTRAINT "ck_attendance_records_status"
  CHECK ("attendance_status" IN ('PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKEND')) NOT VALID;
