# CRM Pipeline — Where Leads Go, and a Plan to Make It Easy to Use

This answers three questions: **"I added a lead: where is it?"**, **"Where do I see all my leads?"** and **"Where do I see the sales we converted?"**. It then lays out a plan to turn the pipeline (Kanban, SLA, the 30-day multi-touch cadence and SOPs) into one clear flow.

It complements `CRM_CURRENT_WORKFLOW.md` (how the module works) and `CRM_IMPROVEMENT_PLAN.md` (the wider roadmap). Findings were checked against the code and reproduced in an isolated component test.

---

## 1. Where does a lead show after "Add Lead"?

| The lead you add | Where it goes | Where you can see it |
| --- | --- | --- |
| **Hot or Warm** | The *default* pipeline's first stage (or the stage you chose) | *Sales Pipelines* → Kanban (in that pipeline) and *Sales Pipelines* → List |
| **Cold** | Automatically enrolled in the 30-day outreach cadence | **Only** in *Client Outreach*. It is hidden from the Kanban, and hidden from the list unless you switch on "Cold in cadence" |

### Why you often see it nowhere (five causes found in the code)

1. **The board goes blank when you open it directly** (reproduced).
   - **Cause:** the Kanban picks its pipeline once, when it first appears. If you arrive straight on *Sales Pipelines* (sidebar link, `?tab=pipeline`, or refreshing that page), it appears before the data has loaded, picks "no pipeline", and never updates.
   - **Effect:** every lead is filtered out and the board stays empty.
   - **Code:** `useState(pipelines[0]?.id || '')` in `PipelineKanban.tsx`, never re-synced.
   - **Workaround until fixed:** change the *Sales Pipeline* drop-down on the board, or open *Client Outreach* first and then *Sales Pipelines*.
2. **Cold leads are hidden from the pipeline on purpose**, but nothing tells you where they went. The form lets you pick *Cold*, which enrols the lead in the cadence, and the board filters every lead with cadence data out "permanently".
3. **The board may show a different pipeline from the one the lead went into.** New leads go into the pipeline flagged **default**; the board opens on the **first pipeline by sort order**. If those differ, the lead is in a pipeline you aren't looking at.
4. **Only the first 100 leads are loaded, sorted by "AI score" first.** New leads get a score of 50. Once a workspace has 100 or more leads scoring higher (for example the sample outreach leads), a new lead never makes it into the 100 and appears nowhere.
5. **The CRM opens on *Client Outreach*,** which lists only cadence leads. A Warm or Hot lead added there with the + button doesn't appear on that screen, even though the success message says it was created.

## 2. Where do I see all my leads?

Today: *Sales Pipelines* → switch to **List**. Even there:
- Cold leads in outreach are hidden until you turn on the "Cold in cadence" toggle.
- Only the first 100 leads (by AI score) are included.

**There is no single, complete "All leads" view.**

## 3. Where do I see converted sales?

**Nowhere dedicated.**
- **Won leads** stay in the Won stage column on the Kanban (if that pipeline is selected), or in the list with the *Won* temperature filter.
- **Clients** created by *Deal Won* have **no screen at all**: nothing in the app lists `/crm/clients`.
- **Reports** show a "won value" computed from the first 100 leads only.

---

## 4. What the pipeline should feel like

A lead is **one record that moves through a clear lifecycle**, and every screen is a view of that lifecycle. Nothing should be hidden by a filter the user doesn't know about.

```
NEW ──► OUTREACH (30-day multi-touch) ──► IN PIPELINE (Kanban stages) ──► WON  → Customer
  │           │ reply / interest ─► "Qualify"          │ SLA per stage          LOST → reason
  └───────────┴─────────────────────────────────────────┴──► NURTURE (not now; re-enrol later)
```

- **Outreach** is where cold leads are *worked* until they respond. **Qualify** is an explicit, visible action that moves the lead into the pipeline.
- **The pipeline** holds only real opportunities. Each stage has an **SLA** (how long a deal may sit there) and an **SOP** (what must happen in this stage).
- **Won** creates a **customer** you can find. **Lost** requires a reason.

### Proposed CRM navigation

Organised by task instead of by table:

| Tab | What it's for | Replaces or joins |
| --- | --- | --- |
| **My Day** (opens first) | Everything the signed-in rep must do today | New |
| **Leads** | Every lead, one searchable list, with a lifecycle column | Today's hidden List view |
| **Pipeline** | Kanban of open opportunities | *Sales Pipelines* → Kanban |
| **Outreach** | The 30-day multi-touch queue for cold leads | *Client Outreach* |
| **Customers** | Won deals and the clients they created | New (the data exists; no screen does) |
| **Follow-ups, Quotes, Reports** | As today | Unchanged |
| **Settings** | Pipelines, stages (SLA and SOP), sources, lost reasons, sequences, audit | *Masters*, *Audit Trail* |

---

## 5. The screens

### 5.1 After "Add Lead"
- **The form asks where the lead starts:** *Start outreach (30-day cadence)*, or *Put in pipeline → [pipeline] [stage]*. This replaces a temperature button that silently decides it.
- **After saving:** a message *"Lead LD-2026-… created in Pipeline › Sales › New"* with **Open lead** and **Show on board**. The board or queue then opens with the new card highlighted.
- **Before saving:** a duplicate warning if the email or phone already exists (see `CRM_IMPROVEMENT_PLAN.md` §1.3).

### 5.2 Leads (all leads)
One server-paged list of **every** lead:
- **Search** across company, contact, email, phone and code.
- **Saved views as tabs:** *All · New (not contacted) · In outreach · In pipeline · Won · Lost · Mine*.
- **Columns:** lifecycle, stage or outreach day, owner, **next step** (date), **SLA status**, value, source, last touch.
- **Bulk actions:** assign, enrol in outreach, move to stage, export.
- **Sort:** newest first by default, not "AI score".

### 5.3 Pipeline (Kanban)
```
┌ New ─────────── 12 · ₹8.4L ┐┌ Qualified ───── 7 · ₹11L ┐┌ Proposal ─── 4 · ₹9L ┐
│ ⚠ 3 over SLA               ││ ⚠ 1 over SLA             ││                       │
│ ┌────────────────────────┐ ││ ┌──────────────────────┐ ││                       │
│ │ Acme Industries   ₹2.5L│ ││ │ ...                  │ ││                       │
│ │ Priya Shah · CFO       │ ││ └──────────────────────┘ ││                       │
│ │ Next: Call · Today 4pm │ ││                          ││                       │
│ │ SLA: 6h left       (AS)│ ││                          ││                       │
│ └────────────────────────┘ ││                          ││                       │
│  … Load more               ││                          ││                       │
└────────────────────────────┘└──────────────────────────┘└───────────────────────┘
   Drop here: [ ✓ Won ]  [ ✕ Lost → asks for a reason ]
```
- **Opens on the default pipeline** and remembers the rep's last choice. The pipeline is picked after the data has loaded, fixing cause 1.
- **Column header:** count, total value and weighted value, plus the number of cards over SLA.
- **Card:** company, contact, value, owner, **next step with date**, and an **SLA badge** (*6h left*, *Overdue 1d*; shown as text as well as colour). Missing next step shows as *No next step*.
- **Won and Lost are drop zones** under the board, not crowded columns. Closed deals move to **Customers** and to the Lost view. Lost asks for a reason.
- **Filters:** *My deals* (default for reps) · owner · source · *Only over SLA* · *No next step*.
- **Moving without dragging:** each card has a keyboard-accessible *Move to…* menu, for accessibility and for mobile.
- **Loading:** each column loads its own first 25 cards from the server with *Load more*, so every lead is reachable at any volume.
- **Outreach link:** a small link, *"18 leads in outreach → Outreach"*, so cold leads are never a mystery.

### 5.4 SLA: make it visible and useful
Stages already store `sla_duration_hours`; nothing uses it yet.
- **The clock** starts when a deal enters the stage (`stage_entered_at`), and resets on a stage move or a logged activity.
- **Badges:** green while within the SLA, amber from 75%, red when exceeded, always with text.
- **Where it shows:**
  - the card and the column header counts;
  - *My Day*, under "Over SLA";
  - the Reports tab: average time in stage and % over SLA by stage and by rep.
- **Display:** stage settings show SLA in days and hours, with a sensible default per stage.

### 5.5 SOP: the playbook, where the work happens
- **Stage SOP:** each stage gets a short checklist of what must happen before it moves on (for example Qualified: budget confirmed, decision-maker known; Proposal: quote sent, meeting booked). It shows in the lead drawer for the lead's current stage.
- **Moving forward:** the rep can still move a deal, but unticked **required** items ask *"Move anyway?"* and are logged.
- **Outreach scripts:** the existing SOP steps and reply branches (`CADENCE_REPLY_BRANCHES`) stay the scripts for outreach. Choosing a branch such as *Interested* **offers "Qualify → Pipeline"** in one click, instead of changing a hidden status.

### 5.6 Outreach: the 30-day multi-touch cadence
- **A queue, not a matrix:** *Due today* grouped by channel (Call, WhatsApp, Email, LinkedIn), each row with **one-tap actions**:
  - open WhatsApp or email with the script pre-filled;
  - log the result;
  - done / skip.
- **Timeline:** each lead shows a **Day 1 → Day 30 strip** of touches done, today's touch and the ones still to come.
- **Stops by itself** on a reply or a booked meeting (see `CRM_IMPROVEMENT_PLAN.md` §3.3), and asks the rep to pick the reply branch.
- **Ends clearly:** *Qualify → Pipeline*, *Nurture (re-enrol in 90 days)*, or *Close (not a fit)*. A lead never silently stays in outreach.

### 5.7 My Day (the home screen)
In this order:
1. New leads not yet contacted, oldest first, with a timer: speed to lead.
2. Follow-ups overdue, then due today.
3. Outreach touches due today.
4. Deals over SLA, and deals with no next step.
5. Meetings today.

**Completing anything asks for the next step**, so the list stays accurate.

### 5.8 Customers (converted sales)
- **List:** every won deal and its client: company, contact, won date, value (the accepted quotation's total), owner, source, and the linked quotation.
- **Filters and export:** month and owner filters, and export.
- **Client page:** contacts, all deals (won and open), quotations, activity. Repeat business starts from here with *New deal for this customer*.

---

## 6. Build plan

### Phase 0 — Quick fixes: "my lead disappeared" (1–2 days)
| # | Change | Where |
| --- | --- | --- |
| 0.1 | Pick the board's pipeline **after** data loads (the default one), and re-pick if the list changes. Fixes the empty board | `PipelineKanban.tsx` |
| 0.2 | Sort leads **newest first**, not by AI score | `getLeads()` in `crm.service.ts` |
| 0.3 | After creating a lead: a message with **Open lead / Show on board** (or *Show in Outreach* for cold leads), and switch to that view | `CreateLeadModal.tsx`, `CrmWorkspaceView.tsx` |
| 0.4 | The board shows *"N leads in outreach → Outreach"*; the list shows cold leads with an *In outreach* badge instead of hiding them | `PipelineKanban.tsx`, `LeadsDirectory.tsx` |
| 0.5 | Open the CRM on **Sales Pipelines** instead of Client Outreach, until My Day exists | `PayrollContext.tsx` (default `crmTab`) |
| 0.6 | A simple **Won deals** list: won leads with client, value and date (a filter on existing data) | New view in `CrmWorkspaceView.tsx` |

### Phase 1 — Clear lifecycle and complete data (about 1 week)
- A real **lifecycle field** on leads (`NEW / OUTREACH / PIPELINE / WON / LOST / NURTURE`) replaces the JSON check on `custom_attributes.cadence`. Migrate existing leads by their current state.
- The Add Lead form asks *"Start in outreach or pipeline?"* (5.1).
- **Qualify → Pipeline** action from outreach and the reply branches (5.5).
- **Server-side** Leads list and Kanban columns (per column, with counts and values) (5.2, 5.3). This removes the 100-lead limit (`CRM_IMPROVEMENT_PLAN.md` §1.1).
- **Lost reason** required; Won and Lost drop zones (§1.4).
- **Customers** tab from the existing clients data (5.8).

### Phase 2 — Make SLA and SOP drive the work (about 1 week)
- SLA badges, column counts, the *Only over SLA* filter, and SLA reports (5.4).
- Required *next step*, with the *No next step* badge and filter.
- Stage SOP checklists in the lead drawer, with the "Move anyway?" guard (5.5).

### Phase 3 — My Day and a faster outreach queue (1–2 weeks)
- **My Day** as the CRM home (5.7), with reminders (§2.4).
- The outreach **queue by channel**, one-tap WhatsApp and email with scripts, the Day 1–30 strip, and Qualify / Nurture / Close endings (5.6).
- Sending through the connected Gmail account, and auto-stop on reply (§3.2–3.3).

### How to check each phase worked
- **Phase 0:** add a Warm lead and a Cold lead from each tab, and after a page refresh on *Sales Pipelines*. Each shows where the confirmation said it would.
- **Phase 1:** the number of leads in *Leads → All* equals the database count for the workspace; every won deal appears in *Customers*.
- **Phase 2:** every open deal shows an SLA state and a next step, or is flagged.
- **Phase 3:** a rep can finish the day's work from *My Day* alone.

---

## 7. Files involved

| Area | Files |
| --- | --- |
| Workspace shell and tabs | `frontend/src/views/crm/CrmWorkspaceView.tsx`, `frontend/src/context/PayrollContext.tsx` |
| Kanban | `frontend/src/components/crm/PipelineKanban.tsx` |
| Leads list | `frontend/src/components/crm/LeadsDirectory.tsx` |
| Add Lead | `frontend/src/components/crm/CreateLeadModal.tsx` |
| Outreach | `frontend/src/components/crm/SLeadCadenceCenter.tsx`, `backend/src/modules/crm/crm-cadence.helper.ts` |
| Lead drawer (SOP checklist) | `frontend/src/components/crm/Lead360Drawer.tsx` |
| Stage SLA and SOP settings | `frontend/src/components/crm/CRMMastersManager.tsx` |
| API | `backend/src/modules/crm/crm.service.ts` (`getLeads`, `getPipelines`, `createLead`, `updateLead`, `convertDealWon`), `crm.controller.ts` |
| Data | `rndtechnosoft_crm_leads` (new lifecycle field), `rndtechnosoft_crm_stages` (SOP checklist) |
