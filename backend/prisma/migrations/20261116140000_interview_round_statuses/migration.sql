-- Interview rounds record their own outcome: RESCHEDULED while a moved round
-- is still to happen, and PASSED or FAILED once a decision is made on a held
-- round. Rounds already decided take the outcome their decision implies.

ALTER TABLE "rndtechnosoft_interviews" DROP CONSTRAINT "ck_interviews_status";
ALTER TABLE "rndtechnosoft_interviews" ADD CONSTRAINT "ck_interviews_status"
  CHECK ("interview_status" IN ('SCHEDULED', 'RESCHEDULED', 'COMPLETED', 'PASSED', 'FAILED', 'CANCELLED'));

UPDATE "rndtechnosoft_interviews"
SET "interview_status" = CASE WHEN "decision" = 'REJECT' THEN 'FAILED' ELSE 'PASSED' END
WHERE "interview_status" = 'COMPLETED' AND "decision" IS NOT NULL;

-- A decision and its outcome always go together.
ALTER TABLE "rndtechnosoft_interviews" ADD CONSTRAINT "ck_interviews_outcome" CHECK (
  ("interview_status" IN ('PASSED', 'FAILED')) = ("decision" IS NOT NULL)
  AND ("interview_status" <> 'FAILED' OR "decision" = 'REJECT')
  AND ("interview_status" <> 'PASSED' OR "decision" IN ('ADVANCE', 'SELECT')));
