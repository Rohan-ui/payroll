-- An exit interview booked in advance: when, with whom, where (a room or a
-- meeting link), and who booked it. Recording the interview afterwards
-- leaves the booking as it was.
ALTER TABLE "rndtechnosoft_employee_separations"
  ADD COLUMN "exit_interview_scheduled_at" TIMESTAMPTZ(6),
  ADD COLUMN "exit_interview_location" VARCHAR(300),
  ADD COLUMN "exit_interview_interviewer_tenant_member_id" UUID,
  ADD COLUMN "exit_interview_scheduled_by_tenant_member_id" UUID;

ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_interviewer"
  FOREIGN KEY ("tenant_id", "exit_interview_interviewer_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "fk_employee_separations_interview_scheduled_by"
  FOREIGN KEY ("tenant_id", "exit_interview_scheduled_by_tenant_member_id") REFERENCES "rndtechnosoft_tenant_members"("tenant_id", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
-- A booking always says when, with whom and who booked it.
ALTER TABLE "rndtechnosoft_employee_separations" ADD CONSTRAINT "ck_employee_separations_interview_booking"
  CHECK (("exit_interview_scheduled_at" IS NULL) = ("exit_interview_scheduled_by_tenant_member_id" IS NULL)
     AND ("exit_interview_scheduled_at" IS NULL) = ("exit_interview_interviewer_tenant_member_id" IS NULL)
     AND ("exit_interview_scheduled_at" IS NOT NULL OR "exit_interview_location" IS NULL));
