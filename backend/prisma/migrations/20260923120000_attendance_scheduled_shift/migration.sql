-- Scheduled shift for the attendance date as reported by the attendance device (COSEC
-- attendance-daily SCHEDULESHIFT / WORKINGSHIFT / SHIFTSTART / SHIFTEND). Stored per record so a
-- historical day keeps the shift that applied on that date. Nullable: manual/system records have none.

ALTER TABLE "rndtechnosoft_attendance_records"
  ADD COLUMN "scheduled_shift_code" VARCHAR(64),
  ADD COLUMN "working_shift_code" VARCHAR(64),
  ADD COLUMN "scheduled_shift_start_time" TIME(0),
  ADD COLUMN "scheduled_shift_end_time" TIME(0);
