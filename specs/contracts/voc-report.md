# VOC Report Contract — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Defines the VOC report API response schema and improvement loop contract.

---

## VocReport Schema

```typescript
interface VocReport {
  generated_at: string;       // ISO 8601
  period_days: number;        // 7 | 14 | 30 | 90

  cases: {
    total: number;
    by_status: Record<CsTicketStatus, number>;
    by_intent: { intent: string; count: number }[];   // top 10, sorted by count desc
    by_risk: Record<string, number>;
    no_source_count: number;   // cases with no knowledge hit
    resolution_rate: number;   // 0.0–1.0 (resolved+denied+escalated / total)
  };

  automation_runs: {
    total: number;
    by_type: {
      run_type: string;
      count: number;
      success_count: number;
      avg_latency_ms: number;
    }[];
    overall_success_rate: number;   // 0.0–1.0
  };

  improvement_backlog: {
    open: number;
    resolved: number;
    top_topics: { topic: string; count: number }[];
  };

  top_recurring_issues: TopRecurringIssue[];
  improvement_suggestions: ImprovementSuggestion[];
}

interface TopRecurringIssue {
  intent: string;
  count: number;
  risk_level: string;           // Most common risk level for this intent
  example_topics: string[];     // Up to 3 raw_text samples, first 80 chars each
}

interface ImprovementSuggestion {
  trigger: string;              // What caused this suggestion (e.g., "no_source_rate=15%")
  suggestion: string;           // Human-readable action item in Korean
  priority: 'high' | 'medium' | 'low';
}
```

---

## API Endpoint

```
GET /api/voc/report?days=30
```

Period options: 7, 14, 30 (default), 90

---

## Improvement Suggestion Rules (rule-based, not LLM)

| Trigger Condition | Suggestion | Priority |
|-------------------|-----------|---------|
| no_source_count / total > 10% | Expand knowledge base | high if >20%, else medium |
| High-risk intent with count > 3 | Review escalation policy | high |
| improvement_backlog.open > 3 | Address backlog items | high if >10, else medium |
| overall_success_rate < 0.95 | Investigate automation failures | high if <0.85, else medium |
| unknown_intent / total > 30% | Improve classifier coverage | medium |

---

## Improvement Loop (Backlog → Resolution)

```
no_source_backlog path
  → improvement_backlog entry created (topic = raw_text, status = 'open')
  → Reviewer sees backlog in Dashboard VOC Report tab
  → Reviewer adds FAQ/Policy doc to Notion for that topic
  → POST /admin/knowledge/:id/sync
  → POST /admin/improvement-backlog/:id/resolve
  → improvement_backlog.status = 'resolved'
```

**Note:** The "Reviewer adds doc to Notion" step is manual. Full automation of this loop requires LLM-generated draft docs (out of current scope).

---

## Known Gaps

- `top_recurring_issues` does not include per-issue source_ticket_ids (aggregate only)
- Improvement suggestions are rule-based, not ML-derived
- Closed-loop resolution requires manual operator action
