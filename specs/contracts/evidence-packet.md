# Evidence Packet Contract

케이스 처리 시 LLM 초안 생성에 필요한 근거를 조립하는 in-memory 구조.

기존 코드: `api/src/evidence/evidence-packet.ts`

---

## 타입 정의

```typescript
type EvidencePacket = {
  case_id: string;

  // 지식 검색 결과 (Notion FAQ/Policies DB + Slack archive)
  notion_hits: KnowledgeHit[];

  // Commerce API 조회 결과 (고객별 문의 시만 설정)
  commerce_result: CommerceResult | null;

  // 충돌 감지: notion 근거와 commerce_result 간 불일치
  conflict_detected: boolean;
  conflict_reason?: string;

  // 자동 전송 가능 여부
  auto_send_allowed: boolean;

  // LLM에 전달되는 텍스트 스니펫 목록
  evidence_snippets: string[];
};

type KnowledgeHit = {
  source_db: string;   // 'FAQ DB' | 'Policies DB' | 'Slack Archive'
  source_id: string;   // Notion page ID 또는 'slack:{channel}:{ts}'
  title: string;
  content: string;
};

type CommerceResult = {
  found: boolean;
  customer_id?: string;
  email_masked?: string;
  tier?: string;
  refund_eligible?: boolean;
  reason_codes?: string[];
  notes?: string[];
  requires_human_review?: boolean;
};
```

---

## 조립 절차

EvidencePacket은 `review_required` 경로에서 `run_draft_pipeline()` 호출 시 조립된다.

```
Step 1: Notion knowledge search
  → search_notion_knowledge(raw_text, limit=3)
  → notion_hits 설정

Step 2: Commerce API lookup (이메일/주문번호가 원문에 포함된 경우만)
  → build_commerce_evidence(case_id, raw_text)
  → commerce_result 설정

Step 3: Conflict detection
  → detect_conflict(notion_hits, commerce_result)
  → conflict_detected, conflict_reason 설정

Step 4: auto_send_allowed 결정
  → conflict_detected === false
     AND (commerce_result === null OR commerce_result.requires_human_review === false)
     AND risk_level !== 'high'

Step 5: Evidence snippets 조립
  → build_evidence_snippets(packet)
  → notion_hits와 commerce_result를 텍스트 스니펫으로 변환
```

---

## Conflict Detection 규칙

충돌이 감지되면 `auto_send_allowed = false`이며, 담당자 검토 필수.

| 조건 | 충돌 여부 |
|---|---|
| Notion "환불 가능" + Commerce API "불가" | ✓ conflict |
| Notion 내용 없음 + Commerce API "가능" | ✗ no conflict (출처 단일) |
| 두 출처가 같은 결론 | ✗ no conflict |
| `requires_human_review === true` | 충돌은 아니나 auto_send 불가 |

---

## Evidence Snippets 형식

```
[FAQ DB]
구독 해지 방법
Settings > 구독 관리 > 해지 신청 버튼을 누르면 즉시 해지됩니다.

[Commerce API 조회 결과]
고객 ID: cust_abc123
환불 가능: 가능
사유: WITHIN_REFUND_WINDOW
```

---

## 영속화 정책

EvidencePacket 자체는 DB에 저장하지 않는다.

- `tool_calls.output_json` — CS bot 호출 시 input evidence 기록 가능
- `case_events` — `agent_decision_logged` 이벤트에 요약 payload 포함
- AutomationRun (Phase 5) — `evidence_source_ids`에 source_id 목록 저장

---

## 관련 문서

- [domain-entities.md](domain-entities.md) — 전체 엔티티 정의
- [case-state.md](case-state.md) — 케이스 상태 기계
- [admin-api.md](admin-api.md) — Commerce API 계약 (현재는 admin stub)
