# Next Steps — CS Ops Harness

## 현재 상태 (2026-05-10)

ouroboros run workflow 완료. 모든 9 AC 통과.

```
tsc --noEmit → exit 0
npx jest      → 7 suites, 52/52 tests pass
```

커밋된 마지막 태그: `fc39ca9` (test: add automation-run spec)

---

## Phase3_Eval — 남은 작업

### P0 (블로킹)

#### 1. Notion DB 생성 (manual)
- CS_Tickets DB
- Policy_Rules DB
- Automation_Runs DB
- Eval_Cases DB

환경 변수 설정:
```
NOTION_FAQ_DB_ID=
NOTION_POLICIES_DB_ID=
NOTION_AUTOMATION_RUNS_DB_ID=
MOCK_ADMIN_API_URL=http://localhost:3099
```

#### 2. Eval Cases 30개 시딩 (manual)
Notion `Eval_Cases` DB에 다음 케이스 유형별로 채울 것:
- refund_request × 8 (가능/불가/edge case)
- delivery_inquiry × 5
- privacy_request × 5
- exchange_request × 4
- subscription_cancel × 3
- product_defect × 3
- general_inquiry × 2

각 케이스: `input_message`, `expected_customer_intent`, `expected_risk_level`, `expected_action`

#### 3. Judge Harness 구현 (hermes)
파일 위치: `cs-ops-api/src/eval/judge.ts`

- eval case 읽기 → `process_cs_message` 실행 → 결과 비교
- 8개 rubric 항목 채점 (classification, retrieval, policy_match, risk_gate, PII masking, legal overclaim, tone, action safety)
- 점수 Notion `Eval_Cases` DB에 기록

### P1

- `.env` 파일 구성
- mock admin server start 스크립트 확인 (`npx ts-node cs-ops-api/src/mock-admin/start.ts`)

---

## Phase4_Demo — 이후 작업

6개 데모 시나리오 end-to-end 실행:
1. 배송 조회 → 자동 응답
2. 환불 가능 → 초안 + Slack 리뷰
3. 환불 거절 가능성 → human review
4. 개인정보 요청 → escalation
5. 구독 취소 → 정책 매칭
6. 불명확 문의 → general_inquiry 분류

---

## AC9 상태 노트

`npx jest --testPathPattern='cs-ops-api'` 플래그는 jest v30에서 제거됨.
올바른 명령: `npx jest "cs-ops-api"` 또는 `npx jest --no-coverage`
→ 7 suites, 52/52 pass 확인됨.
