# CRM & Sales — Improvement Plan

How to make the CRM & Sales module faster and more useful for the people who work in it every day, based on how the module works today (`CRM_CURRENT_WORKFLOW.md`, gaps **G1–G15**) and on current practice in leading CRMs and published sales research (sources at the end).

The plan is ordered so that each phase makes the next one worth doing:
1. **Trust the data.**
2. **Tell each rep what to do next.**
3. **Automate the repetitive outreach.**
4. **Close faster.**
5. **Connect the sources and stay compliant.**

Effort: **S** is a day or two, **M** is about a week, **L** is two weeks or more.

---

## What the research says matters most

1. **Speed to lead decides who wins.** In the MIT/InsideSales study, contacting a lead within 5 minutes made it about 21 times more likely to be qualified than contacting it after 30 minutes. Harvard Business Review found teams contacting leads within an hour were nearly 7 times as likely to qualify them as teams waiting a further hour, and over 60 times as likely as teams waiting a day. A new lead should reach an owner immediately, and that owner should be told.
2. **Every open deal needs a next step with a date.** Pipeline-hygiene guidance treats "next step, close date, stage, recent activity" as the minimum for every deal, checked weekly. A deal with no confirmed next step isn't really in progress.
3. **Idle deals must be visible.** Pipedrive's "rotting" marks a deal red when it hasn't been touched for a per-stage number of days, and resets on any activity or stage move.
4. **Sequences should stop themselves.** HubSpot unenrols a contact when they reply or book a meeting, optionally for everyone at the same company. Nobody should receive step 5 after saying "yes, let's talk".
5. **Duplicates are stopped at entry.** Match on email first and phone second, with the email domain plus company name for companies. Exact matches can be merged automatically; fuzzy matches go to a review queue.
6. **Lost reasons are required, and kept short.** Ask for a reason only when a deal is marked lost, from a short list (price, no decision, timing, competitor, poor fit, other), and watch that "Other" doesn't become the biggest bucket.
7. **Scoring separates fit from engagement.** "Who they are" (role, industry, size) and "what they did" (replies, meetings, quote views) are scored separately, and engagement decays over time.
8. **India specifics:**
   - **WhatsApp:** you can only start a conversation with approved templates to people who opted in; free-form messages are allowed only within 24 hours of the customer's last message.
   - **DPDP Act and Rules (notified November 2025):** these cover B2B contact data too. Personal data needs a purpose and consent, and only the data that purpose needs.
   - **GST:** the tax *rate* comes from the item's HSN/SAC code, and the *split* (CGST+SGST vs IGST) comes from the place of supply compared with the supplier's state.

---

## Phase 1: Trust the data (fix what is wrong today)

These are correctness fixes. Until they're done, every report and forecast is suspect.

### 1.1 Server-side lists, counts and reports (fixes G1) — M
- **Today:** the workspace loads the first 100 leads, and the Kanban, list and reports are computed from them.
- **Change:**
  - The **list view** pages, filters, sorts and searches on the server (`getLeads()` already supports `page`/`limit` and filters).
  - The **Kanban** loads each column separately (`?stageId=…&limit=25`), with a server count and total value per column (`getPipelines()` already computes value per stage) and "Load more" at the bottom of a column.
  - **Reports** come from a new `GET /crm/reports/summary` that aggregates in SQL: counts and value by stage, source and owner; win rate; weighted forecast.
- **Files:** `CrmWorkspaceView.tsx`, `PipelineKanban.tsx`, `LeadsDirectory.tsx`, `CRMAnalytics.tsx`, `crm.service.ts`.

### 1.2 Remove invented project and invoice numbers (fixes G2, G13) — S
- **Change:**
  - `convertDealWon()` stops generating `PRJ-…` and `INV-…` strings, and the activity says only what really happened ("Client created / linked").
  - Conversion runs in **one transaction**, uses the won stage **of the lead's own pipeline**, and refuses a pipeline that has no won stage.
  - Later, the hand-off creates a real record in the module that owns it (for example a draft invoice in Finance) and links to it.

### 1.3 Duplicate protection at entry (fixes G3) — M
- **Where it applies:** the form, import and webhook.
- **Matching rule:** same email in this workspace = duplicate; same phone number (normalised to E.164) = likely duplicate; same email domain + similar company name = possible duplicate.
- **Form:** shows *"This looks like an existing lead: Acme (LD-2026-…), owned by Priya"*, with **Open it** or **Create anyway**.
- **Import:** reports duplicates as skipped rows, or offers "update existing".
- **Webhook:** logs a new activity on the existing lead instead of creating another. An inquiry from a known lead is a strong buying signal.
- **Merge:** a screen (Lead 360 → *Merge with…*) keeps one lead and moves activities, follow-ups, meetings and quotations onto it.
- **Database:** a unique index on `(tenant_id, lower(email))` for open leads, once existing duplicates are cleaned. The database enforces the invariant; the app explains it.

### 1.4 Require a lost reason (fixes G4) — S
- **Change:**
  - Dropping a card on a Lost stage (or bulk-moving to one) opens a short dialog: a reason from the lost-reasons master, an optional competitor and a note. It saves `lost_reason_id`, which exists but is never filled.
  - The server refuses a move to a lost stage without a reason.
  - Lost reasons become editable in Masters (only listing exists today).
  - Reports show "Lost by reason" and flag it when "Other" exceeds about 20%.

### 1.5 Honest scores (fixes G11) — S
- **Change:** until real scoring exists (3.4), hide `ai_score` or label it "Manual score". The lead's probability follows its stage's `stage_probability` unless the rep overrides it, and an override is shown as one.

### 1.6 Correct GST on quotations (fixes G9) — M
- **Change:**
  - Tax is **calculated per line** from its own `tax_rate`, with a default rate from the service's SAC code.
  - The **split is derived**: supplier state (the organization profile) vs place of supply (the client's or lead's state). CGST+SGST if they're the same, IGST if not.
  - The salesperson only overrides with a stated reason.
  - Totals are rounded once, at the end.

### 1.7 Keep history, and less personal data (fixes G12, G14, G15) — S
- **Soft delete:** deleting a lead archives it (`archived_at`, hidden from lists) instead of erasing its timeline. Permanent erasure becomes an explicit, audited action, which the DPDP erasure right needs anyway.
- **Webhook audit:** store the field names received and the source, not the whole payload.
- **Demo seeding:** allow "load sample leads" only in a demo or sandbox workspace, and remove it from production builds.

---

## Phase 2: Tell each rep what to do next

### 2.1 A "My Day" work queue — M
The screen a rep opens every morning, shown first in CRM. Sections, in order:
1. **New leads not yet contacted.** Oldest first, with a timer since arrival: speed to lead.
2. **Follow-ups overdue, then due today.**
3. **Cadence steps due** (from the Client Outreach matrix).
4. **Rotting deals** (2.3).
5. **Meetings today.**

**Each row has one-tap actions:**
- **Log call** (outcome + note)
- **Send email**
- **WhatsApp**
- **Reschedule**
- **Done**

Completing an item **asks for the next step** (2.2) before it closes.

Backed by one server query per section with counts, so the numbers are right at any volume.

### 2.2 Every open deal has a next step — S
- **Change:**
  - When a lead is created, moved to a new stage or has an activity completed, the rep is asked *"What's the next step and when?"*. This creates the follow-up and sets `next_followup_at`.
  - Open leads without a future `next_followup_at` get a **"No next step"** badge on the Kanban card, and are counted in a hygiene panel on My Day and Reports.
  - Won and lost leads are exempt.

### 2.3 Rotting / SLA indicators (fixes G5) — S
- **Change:**
  - Use the existing `sla_duration_hours` per stage.
  - A card whose `stage_entered_at` or last activity is older than the SLA turns amber at 75% of it and red when it's exceeded. The status is also shown as text, never colour alone.
  - The clock resets on a stage move or a logged activity.
  - The Kanban gets a filter "Only rotting", and each column header shows the count.
  - Masters shows SLA in days for readability.

### 2.4 Reminders that reach the rep (fixes G6) — M
- **Change:**
  - A scheduled job every few minutes finds follow-ups and meetings due soon and notifies the owner: an in-app notification bell, plus email via the existing email service. It's idempotent, so nothing is sent twice.
  - A daily morning digest: "3 overdue, 5 due today, 2 new leads".
- **Infrastructure:** the backend has no job scheduler yet. The smallest safe option is `@nestjs/schedule` running in the API process with a database lock (only one instance runs each job). Move to a queue (for example BullMQ) only if volume needs it.

### 2.5 Instant routing and speed to lead (fixes G8) — M
- **Change:**
  - **Assignment rules** in Masters, applied the moment a lead arrives from any channel:
    1. territory (state or city) → owner;
    2. else source or service → a team;
    3. else **round-robin** within the team, skipping members who are suspended or at capacity.
  - Webhook and import leads get an owner and a real `source_id`.
  - The owner is notified immediately.
  - Track "time to first touch" per lead, and show the team median on Reports (target under 5 minutes during working hours).

---

## Phase 3: Automate the repetitive outreach

### 3.1 Cadence as data, not JSON (prerequisite for 3.2–3.4) — M
- **Today:** cadence state lives in `lead.custom_attributes.cadence` and the steps are hard-coded (`CADENCE_STEPS_MASTER`, "RND Gold Funnel").
- **Change:** proper tables, per the project rule of keeping relational business data out of JSON:
  - `crm_sequences`
  - `crm_sequence_steps`: day offset, channel, template
  - `crm_sequence_enrollments`: lead, sequence, status, current step, next due, reason for stopping
- Workspaces can then edit steps and run more than one sequence (per industry or service). Existing JSON state is migrated once.

### 3.2 Send from the CRM, not outside it (reduces G7) — M
- **Email:** email steps send through the workspace's connected Gmail account. The Gmail module already added in `backend/src/modules/gmail` does sending and replies over OAuth.
- **Templates** personalise with `{first_name}`, `{company}` and `{industry script}`.
- **Two modes per step:**
  - **Manual:** the rep reviews and sends. This is the default for the first rollout.
  - **Automatic:** sends at the due time within working hours.
- **WhatsApp and calls:** WhatsApp steps use approved templates only, and only for leads with a recorded WhatsApp opt-in (3.5). Call steps create a call task in My Day.

### 3.3 Stop sequences automatically — S (after 3.2)
- **Change:**
  - Stop an enrolment when the lead **replies** (detected in the Gmail inbox the module already reads), **books a meeting**, is moved to a later stage, or is marked won or lost.
  - An option also stops **everyone at the same company**.
  - The rep sees "Stopped: replied on 12 Oct" and is prompted to pick the reply branch. The branches stay as the SOP guidance they are today.

### 3.4 Real lead scoring (replaces the fixed `ai_score`) — M
- **Fit score (0–100)** from explicit data:
  - industry in the target list;
  - designation seniority;
  - company size or budget band;
  - how complete the profile is.
- **Engagement score (0–100)** from behaviour, weighted by how close each signal is to buying: a quote viewed or meeting booked counts far more than an email opened. It decays week by week.
- **Show both**, with a short *"why"* (for example "Opened quote twice this week, +30"), and sort My Day's new leads by them.
- Recalculate when an event happens, not on page load.

### 3.5 Consent and channel preferences — S
- **Change:** store per lead:
  - consent source and date;
  - allowed channels (email, WhatsApp, calls);
  - opt-out, with the date.
- Sequences and bulk sends skip channels without consent.
- An **unsubscribe** reply or link records the opt-out automatically.
- This is required for WhatsApp templates and for DPDP.

---

## Phase 4: Close faster

### 4.1 A quotation lifecycle (fixes G10) — M
- **Statuses** as a fixed list with allowed transitions:
  `DRAFT → PENDING_APPROVAL → APPROVED → SENT → VIEWED → ACCEPTED / DECLINED / EXPIRED`.
  These are explicit actions, not a free-text field.
- **Approval rules:** a discount above X% or a total above Y needs approval from a manager with `quotations.approve`.
- **Versions:** editing a sent quote creates v2; v1 stays readable.
- **Share link:** a signed, expiring link to a read-only quote page. Opening it records **Viewed** and notifies the owner, which is a strong buying signal and feeds the engagement score.
- **Accept:** the client accepts on that page with name, email and a checkbox, timestamped. A full e-signature integration can follow later if needed.
- **Accepted** moves the deal to the won stage (or suggests it), and **Expired** creates a follow-up.

### 4.2 A real won hand-off — M (after 1.2)
- **Change:** accepting the quote (or clicking Deal Won) runs one transaction that:
  - creates or links the client, matched by GSTIN, then email domain, then name, with a confirmation step if unsure;
  - copies the accepted quotation's lines to the handover;
  - creates the next record in the owning module (for example a draft invoice or project), when that module exists and is enabled.
- The activity links to real records only.

### 4.3 Forecast and pipeline review — S (after 1.1)
- **Change:** Reports get a **weighted forecast by expected close month**, which needs an expected close date on each deal and should be asked for at the stage where it's known. They also get **stage conversion rates** and **average days in stage**, plus the weekly hygiene checks:
  - no next step;
  - untouched for more than 14 days;
  - close date moved more than twice.

---

## Phase 5: Connect the sources and stay compliant

### 5.1 IndiaMART and other marketplaces — M
- **IndiaMART push:** IndiaMART's Lead Manager offers a **push API** (real time) and a **pull API** (scheduled). Add an IndiaMART source that:
  - receives pushes at a per-workspace endpoint authenticated with a secret, never the tenant id alone;
  - maps fields and applies deduplication (1.3) and routing (2.5);
  - backfills with the pull API on setup.
- **Other sources:** the same pattern for website forms, JustDial and Facebook Lead Ads. Integrations Center (`LeadIntegrationsCenter.tsx`) is the natural home.
- **Webhook security:** today's generic webhook should also move to per-source secrets and rate limits.

### 5.2 DPDP housekeeping — S
- **Change:**
  - Record purpose and consent at intake (3.5).
  - Collect only the fields a purpose needs.
  - Honour erasure requests with the audited erase from 1.7.
  - Set a retention period for lost or cold leads, after which they are anonymised.
  - Avoid personal data in logs and audit payloads.

---

## Suggested order and outcome

| Order | Items | What the user notices |
| --- | --- | --- |
| 1 | 1.1, 1.2, 1.4, 1.5 | Correct numbers at any size; no fake invoices; loss reasons start being collected |
| 2 | 1.3, 1.6, 1.7 | No duplicate calls; correct GST; nothing lost by a delete |
| 3 | 2.1, 2.2, 2.3 | Reps open **My Day** and know exactly what to do; stuck deals are visible |
| 4 | 2.4, 2.5 | New leads reach the right person in seconds, with reminders |
| 5 | 3.1–3.5 | Outreach sends itself, stops on reply, and respects consent |
| 6 | 4.1–4.3 | Approved, trackable quotes; a clean won hand-off; a trustworthy forecast |
| 7 | 5.1, 5.2 | IndiaMART and other leads flow in automatically and compliantly |

**Measure before and after:**
- median time to first touch;
- % of open deals with a future next step;
- rotting deals count;
- follow-ups completed on time;
- stage conversion rates;
- win rate by source;
- % of lost deals with a reason (target 100%);
- quote view-to-accept rate.

---

## Sources

- Pipedrive, *The Rotting feature*: https://support.pipedrive.com/en/article/the-rotting-feature
- HubSpot, *Unenroll contacts from a sequence*: https://knowledge.hubspot.com/sequences/unenroll-from-sequence
- MIT / InsideSales, *Lead Response Management Study*: https://25649.fs1.hubspotusercontent-na2.net/hub/25649/file-13535879-pdf/docs/mit_study.pdf
- Lead response research summary (MIT, HBR): https://ainora.lt/blog/lead-response-time-statistics-every-study-2026
- Duplicate lead management: https://www.convergehub.com/blog/why-crm-creates-duplicate-leads-and-how-to-fix-it/ · Microsoft, *Manage duplicate leads*: https://learn.microsoft.com/en-us/dynamics365/sales/manage-duplicate-leads · Zoho, *Detect leads with the same email*: https://www.zoho.com/crm/resources/solutions/detect-leads-with-the-same-email-address.html
- Lead scoring, fit and engagement: https://pipeline.zoominfo.com/marketing/lead-scoring · https://salespanel.io/blog/marketing/lead-scoring-best-practices/
- Lost reasons and win/loss: https://salesforcemakessense.com/enforce-closed-lost-reason-for-opportunities/ · https://www.clozd.com/blog/symptom-1-the-data-we-are-collecting-is-not-insightful
- Pipeline hygiene and next steps: https://www.crono.one/academy/pipeline-hygiene/ · https://www.askelephant.ai/blog/what-is-pipeline-hygiene
- Lead routing: https://www.leandata.com/blog/round-robin-lead-distribution-best-practices/ · https://www.nimble.com/blog/best-practices-for-lead-assignment-in-crm/
- HubSpot quotes, approvals and e-signatures: https://knowledge.hubspot.com/quotes/manage-quote-approvals · https://knowledge.hubspot.com/quotes/use-e-signatures-with-quotes
- WhatsApp Business Messaging Policy: https://business.whatsapp.com/policy · 24-hour window and templates: https://www.twilio.com/docs/whatsapp/key-concepts
- DPDP Act and B2B contact data: https://www.complydp.com/articles/does-dpdp-apply-to-b2b-customer-data · DPDP Rules 2025: https://en.wikipedia.org/wiki/Digital_Personal_Data_Protection_Rules,_2025
- GST place of supply (CGST/SGST vs IGST): https://cleartax.in/s/interstate-and-intrastate-gst · CBIC GST FAQ: https://cbic-gst.gov.in/aces/Documents/faq-on-gst.pdf
- IndiaMART Lead Manager push API: https://help.indiamart.com/knowledge-base/integration-of-indiamarts-lead-manager-crm-push-api-with-third-party-crms-real-time-push-of-leads · pull API: https://help.indiamart.com/knowledge-base/lms-crm-integration-v2
