-- The outreach playbook's step order, as set in CRM Masters, is the sequence
-- Client Outreach follows. Steps had no order of their own (all 0, read by
-- day); each workspace's steps are numbered 1, 2, 3… in their current day
-- order, so nothing changes until an administrator reorders them.
UPDATE "rndtechnosoft_crm_sop_steps_master" AS step
SET sort_order = ordered.position
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY sort_order, day_number) AS position
  FROM "rndtechnosoft_crm_sop_steps_master"
) AS ordered
WHERE step.id = ordered.id;
