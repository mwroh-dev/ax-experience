# Phase 0 PRD — Foundation & Connector Setup

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 0 of 8  
**Type**: Documentation + Contract Definition  
**Code changes**: None (docs-only)

---

## 1. 목적

전체 시스템의 공통 계약과 연결 설정 체계를 확립한다.
이 phase가 없으면 Phase 1–8의 Slack, Notion, Commerce API, Dashboard, OpenClaw가 서로 다른 기준으로 동작한다.

---

## 2. 제품 비전

> **D2C Commerce CS/VOC AX Ops Hub**
>
> AI가 VOC를 분류하고, 상거래 근거를 조회하고, 초안을 생성하며, 담당자가 Slack에서 검토 → 승인/보류/이관하는 내부 운영 시스템.

단순 Slack 챗봇이 아닌 **운영 플랫폼**:
- VOC 생성 → 분류 → 주문/배송/환불/쿠폰/정책 근거 조회
- Slack 휴먼 리뷰 → 답변/보류/이관
- AutomationRun 로그 → 대시보드/리포트

---

## 3. Phase 의존성 맵

```
Phase 0  Foundation & Connector Setup   ← 이 문서
  ↓
Phase 1  Commerce Entity & Mock API     ← 도메인 데이터
  ↓
Phase 2  VOC Generator & Classifier     ← 테스트 데이터 + 분류
  ↓
Phase 3  Decision Router                ← 경로 결정
  ↓
Phase 5  AutomationRun Tracking         ← AI 실행 로그 (Phase 4 이전 권장)
  ↓
Phase 4  Human Review Action Tree v2    ← Slack 운영 액션 정리
  ↓
Phase 6  React Admin Dashboard          ← 운영 화면
  ↓
Phase 7  Knowledge Control Plane        ← Notion sync/reindex
  ↓
Phase 8  VOC Report & Improvement Loop  ← 반복 VOC → 개선
```

---

## 4. 엔티티 경계 결정

Phase 0의 핵심 설계 결정: **어떤 데이터가 어디에 사는가.**

| 엔티티 | 위치 | 이유 |
|---|---|---|
| `CsTicket` | api SQLite | 내부 케이스 레코드 |
| `VocItem` | api SQLite | 아카이브된 VOC 소스 |
| `EvidencePacket` | In-memory | 케이스당 1회 조립, 영구 저장 불필요 |
| `DecisionResult` | In-memory (Phase 3에서 영속화) | 라우팅 결과 |
| `AutomationRun` | api SQLite (Phase 5 구현) | AI 실행 감사 로그 |
| `PromptVersion` | api SQLite (Phase 5 구현) | 프롬프트 버전 관리 |
| `Customer`, `Order`, `Shipment`, `Payment`, `RefundEligibility`, `Coupon`, `Product` | **외부 전용 (Commerce API)** | api DB에 저장하지 않음 |

---

## 5. 사용자

| 역할 | 주요 관심사 |
|---|---|
| 포트폴리오 검토자 | 운영 시스템 수준의 설계 완성도 |
| CS 운영 담당자 | 빠른 분류/검토/답변 |
| AX 엔지니어 | AutomationRun 재현성/감사 |
| 개발자 | 명확한 entity/status/contract 용어 |

---

## 6. Phase 0 범위

### 포함

- 공통 domain schema (`domain-entities.md`)
- connector setup guide (`.env.example` 완성)
- connection health API contract (`connection-health.md`)
- evidence packet contract (`evidence-packet.md`)
- automation run contract (`automation-run.md`)
- entity mapping (`entity-mapping.md`)
- secret/token/path masking 원칙

### 제외

- React UI 구현
- DB 마이그레이션
- 실제 Commerce API 구현 (Phase 1)
- VOC 생성 (Phase 2)
- AutomationRun DB 구현 (Phase 5)

---

## 7. 보안 원칙

### Token / Secret 마스킹

모든 API 응답, 로그, 문서에서:

```
xoxb-123456... → xoxb-***
xapp-123456... → xapp-***
secret_abc123... → secr***
```

### 로컬 경로 마스킹

```
[LOCAL_PATH]/... → [LOCAL_PATH]/...
```

### Dashboard 보안 아키텍처

```
Dashboard (browser)
  → GET /api/health/deps  (api)
    → api가 .env에서 token 읽음
    → masked status만 반환
```

Dashboard는 token을 직접 보유하지 않는다.

---

## 8. 산출물

| 파일 | 상태 |
|---|---|
| `docs/product/phase-0-foundation-setup-prd.md` | ✓ 이 문서 |
| `docs/contracts/domain-entities.md` | ✓ |
| `docs/contracts/evidence-packet.md` | ✓ |
| `docs/contracts/automation-run.md` | ✓ |
| `docs/contracts/connection-health.md` | ✓ |
| `docs/contracts/entity-mapping.md` | ✓ |
| `api/.env.example` | ✓ (업데이트됨) |

기존 계약 문서 (변경 없음):
`case-state.md`, `admin-api.md`, `openclaw-cs-bot.md`, `slack-review-card.md`,
`slack-actions.md`, `knowledge-search.md`, `slack-archive.md`, `notion-write.md`,
`failure-modes.md`, `fixture-policy.md`

---

## 9. Acceptance Criteria

```bash
# 5개 신규 계약 문서 존재
ls docs/contracts/{domain-entities,evidence-packet,automation-run,connection-health,entity-mapping}.md

# .env.example에 Commerce API 변수 포함
grep "COMMERCE_API_BASE_URL" api/.env.example

# 계약 문서에 token 값 없음
grep -rE "secret_[a-zA-Z]|xoxb-[^*]|xapp-[^*]" docs/contracts/ || echo "clean"

# 계약 문서에 로컬 경로 없음
grep -r "/Users/" docs/contracts/ || echo "clean"
```
