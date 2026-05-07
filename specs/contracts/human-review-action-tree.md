# Human Review Action Tree v2 — D2C CS/VOC AX Ops Hub

> Version: 2.0  
> Purpose: Replace ambiguous Keep/Accept/Pending with a formal, operable action tree.

---

## Stage 1: Intake Review

Triggered when: new VOC arrives with recommended_path = `review_required` or `admin_lookup_required`.

Displayed as: Slack intake card in #voc-review channel.

### Actions

| Button | Action | Result |
|--------|--------|--------|
| **Generate Draft** | Triggers full pipeline: retrieve_evidence + commerce_lookup + draft_reply | Status → `accepted`, draft created, draft card posted in thread |
| **Need Info** | Sends "please provide X" message to customer | Status → `pending`, required_fields recorded |
| **Archive** | Dismiss without action | Status → `no_action` |
| **Escalate** | Send to senior CS + escalation channel | Status → `escalated`, escalation AutomationRun recorded |

**Invariant:** "Generate Draft" does NOT send the reply. It only creates a draft for review.

---

## Stage 2: Draft Review

Triggered when: draft is ready after Stage 1 "Generate Draft".

Displayed as: Reply thread under the intake card, with draft text and action buttons.

### Actions

| Button | Action | Result |
|--------|--------|--------|
| **Send** | Post draft reply to customer | Status → `sent`, slack_post AutomationRun recorded, #voc-log entry |
| **Edit & Retry** | LLM re-generates with edit notes | New draft generated, draft card updated |
| **Lookup More** | Fetch additional commerce/admin data | Evidence augmented, draft re-generated |
| **Deny** | Reject without sending | Status → `denied`, #voc-log entry |
| **Escalate** | Elevate to senior CS | Status → `escalated` |

**Invariant:** "Send" is a distinct, explicit action. Draft creation ≠ send.

---

## Stage 3: Close Actions

Available after case reaches terminal state (sent, denied, escalated).

| Action | Trigger | Result |
|--------|---------|--------|
| **Close as Sent** | After Send | Status → `resolved`, Notion ticket log written |
| **Close as No Action** | After Deny/Archive | Status → `resolved` with no_action flag |
| **Create Backlog** | For no_source or unclear cases | improvement_backlog entry created |
| **Create Playbook Task** | For escalated cases | Links to playbook doc in Notion |

---

## Status Transition Table

| From Status | Action | To Status |
|-------------|--------|-----------|
| intake_review | Generate Draft | accepted |
| intake_review | Need Info | pending |
| intake_review | Archive | no_action |
| intake_review | Escalate | escalated |
| accepted | (draft ready) | draft_ready |
| draft_ready | Send | sent |
| draft_ready | Edit & Retry | draft_ready (new draft) |
| draft_ready | Deny | denied |
| draft_ready | Escalate | escalated |
| sent | Close as Sent | resolved |
| denied | Close as No Action | resolved |
| escalated | Create Playbook Task | escalated (with task) |
| any | Create Backlog | backlog |

---

## Slack Card Contracts

### Intake Card
```
[Header: CS Inquiry — {intent} — {risk_level badge}]
[Body: raw_text (first 200 chars)]
[Footer: case_id | created_at]
[Buttons: Generate Draft | Need Info | Archive | Escalate]
```

### Draft Card (in thread)
```
[Header: Draft Reply]
[Body: draft_text]
[Footer: retrieved from {sources}]
[Buttons: Send | Edit & Retry | Lookup More | Deny | Escalate]
```

---

## CDP Verification Requirements

For Phase 5 PASS:
- Intake card visible in #voc-review with correct 4 buttons (Playwright DOM)
- Click "Generate Draft" → DB case.status changes to `accepted`
- Draft card appears in thread with 5 buttons
- Click "Send" → DB case.status changes to `sent`
- AutomationRun `slack_post` recorded
- #voc-log channel shows sent message entry
- browser console errors = 0

FAIL if:
- /api/test/action used as substitute for real Slack CDP click
- DB status not verified after each action click
- curl used as Slack button existence proof
