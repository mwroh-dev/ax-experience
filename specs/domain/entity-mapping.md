# Entity Mapping — Phase 0 Names ↔ Existing Code

Phase 0 PRD 공개 이름과 현재 api 코드 타입/테이블의 매핑 테이블.

---

## Internal Entities

| Phase 0 이름 | 기존 코드 타입 | 파일 | DB 테이블 | 비고 |
|---|---|---|---|---|
| `CsTicket` | `Case` | `src/cases/case-store.ts` | `cases` | 동일 엔티티, 공개 이름 변경 |
| `VocItem` | (slack_archive_curated 행) | `src/archive/archive-store.ts` | `slack_archive_curated` | 일반화된 VOC 소스 추상화 |
| `EvidencePacket` | `EvidencePacket` | `src/evidence/evidence-packet.ts` | (in-memory) | 기존 타입 그대로 사용 |
| `DecisionResult` | `RoutingDecision` | `src/router/decision-router.ts` | (비영속, Phase 3에서 추가) | 공개 이름 변경 |
| `AutomationRun` | `ToolCall` (확장) | Phase 5에서 구현 | `tool_calls` → `automation_runs` | Phase 5에서 마이그레이션 |
| `PromptVersion` | (신규) | Phase 5에서 구현 | `prompt_versions` (신규) | 현재 없음 |

---

## External Entities (Commerce API 응답 형태)

| Phase 0 이름 | 기존 코드 타입 | 파일 | 비고 |
|---|---|---|---|
| `Customer` | `AdminLookupResult` (부분) | `src/tools/admin-api-client.ts` | Phase 1에서 CommerceCustomer로 확장 |
| `Order` | (없음) | Phase 1에서 신규 | - |
| `Shipment` | (없음) | Phase 1에서 신규 | - |
| `Payment` | (없음) | Phase 1에서 신규 | - |
| `RefundEligibility` | `check_refund_eligibility` 응답 | `src/tools/admin-api-client.ts` | Phase 1에서 RefundEligibility 타입으로 정리 |
| `Coupon` | (없음) | Phase 1에서 신규 | - |
| `Product` | (없음) | Phase 1에서 신규 | - |

---

## Status / Enum Mapping

### CsTicket.status ↔ Case.status

동일:
```
intake_review | kept | accepted | pending | draft_ready | resolved | denied | escalated
```

Phase 4에서 아래로 확장 예정:
```
received | triage_required | draft_requested | draft_ready |
info_required | lookup_required | escalated | archived |
sent | denied | backlog_created
```

### DecisionResult.recommended_path ↔ RoutingDecision.recommended_path

현재 코드:
```typescript
type RecommendedPath = 'auto_reply' | 'review_required' | 'pending' | 'escalation' | 'no_source_backlog';
```

Phase 3에서 확장:
```typescript
type RecommendedPath =
  | 'auto_reply_candidate'
  | 'review_required'
  | 'pending_info_required'
  | 'admin_lookup_required'   // → commerce_lookup_required
  | 'no_source_backlog'
  | 'high_risk_escalation';
```

---

## Tool Calls ↔ AutomationRun 마이그레이션 계획 (Phase 5)

| tool_calls 컬럼 | AutomationRun 컬럼 | 비고 |
|---|---|---|
| `id` | `id` | 그대로 |
| `case_id` | `ticket_id` | FK 대상 변경 없음 |
| `tool_name` | `run_type` | 값 매핑 필요 |
| `input_json` | `input_hash` | input_json에서 hash 계산 |
| `output_json` | `output_summary` | output_json에서 요약 추출 |
| `status` | `status` | 동일 |
| `created_at` | `created_at` | 동일 |
| (없음) | `model` | 신규 |
| (없음) | `prompt_version_id` | 신규 |
| (없음) | `evidence_source_ids` | 신규 |
| (없음) | `latency_ms` | 신규 |
| (없음) | `error` | 신규 |

---

## 관련 문서

- [domain-entities.md](domain-entities.md) — 전체 엔티티 타입 정의
- [case-state.md](case-state.md) — CsTicket(Case) DB 스키마
- [automation-run.md](automation-run.md) — AutomationRun 상세 스키마
