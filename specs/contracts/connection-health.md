# Connection Health Contract

운영 시스템의 모든 외부 연결 상태를 단일 API로 확인한다.

---

## API

```
GET /api/health/deps
```

인증 불필요 (내부 네트워크 전용 또는 dashboard API 프록시를 통해 호출).

### 응답 형태

```typescript
type ConnectionHealthResponse = {
  slack: SlackHealth;
  notion: NotionHealth;
  openclaw: ServiceHealth;
  commerce_api: ServiceHealth;
  sqlite: SqliteHealth;
  checked_at: string;  // ISO 8601
};

type SlackHealth = {
  configured: boolean;
  token_prefix: string;  // 예: 'xoxb-***' (실제 값 노출 금지)
  status: 'valid' | 'missing' | 'invalid';
  error?: string;
};

type NotionHealth = {
  configured: boolean;
  status: 'valid' | 'missing' | 'invalid';
  error?: string;
};

type ServiceHealth = {
  live: boolean;
  latency_ms?: number;
  error?: string;       // live=false일 때 오류 원인 (예: 'ECONNREFUSED')
};

type SqliteHealth = {
  ready: boolean;
  path: string;   // 반드시 '[LOCAL_PATH]'으로 마스킹
  error?: string;
};
```

### 응답 예시

```json
{
  "slack": {
    "configured": true,
    "token_prefix": "xoxb-***",
    "status": "valid"
  },
  "notion": {
    "configured": true,
    "status": "valid"
  },
  "openclaw": {
    "live": true,
    "latency_ms": 42
  },
  "commerce_api": {
    "live": false,
    "error": "ECONNREFUSED"
  },
  "sqlite": {
    "ready": true,
    "path": "[LOCAL_PATH]"
  },
  "checked_at": "2026-04-30T12:00:00.000Z"
}
```

---

## 보안 원칙

1. **Token 값 노출 금지**: `token_prefix`는 앞 5자리 + `***` 형태만 반환.
   ```
   xoxb-123456789012-... → xoxb-***
   secret_abc123... → secr***
   ```

2. **로컬 경로 마스킹**: SQLite path는 항상 `[LOCAL_PATH]`으로 대체.

3. **Dashboard 보안 아키텍처**:
   ```
   Dashboard (browser)
     → GET /api/health/deps  (backend API)
       → backend가 .env에서 token 읽음
       → masked status만 응답
   ```
   Dashboard는 token을 직접 보유하지 않는다.

---

## 각 서비스 헬스체크 방법

| 서비스 | 헬스체크 방법 |
|---|---|
| Slack | `auth.test` API 호출 → `ok: true` 확인 |
| Notion | `GET /v1/users/me` 호출 → 200 확인 |
| OpenClaw | `GET {OPENCLAW_BASE_URL}/healthz` 호출 |
| Commerce API | `GET {COMMERCE_API_BASE_URL}/health` 호출 |
| SQLite | `SELECT 1` 쿼리 실행 |

---

## 기존 헬스 엔드포인트

현재 `GET /` 또는 `GET /api/health`는 서비스 자체만 확인한다:

```json
{ "ok": true, "service": "api", "ts": "2026-04-30T12:00:00.000Z" }
```

`/api/health/deps`는 이 엔드포인트에 downstream 의존성 체크를 추가한 것이다.

---

## Dashboard Settings Page 참조 형태

Phase 6 Dashboard의 Settings/Connections 화면은 이 API를 폴링하여 표시:

```
Connections

Slack Bot Token      ● valid        xoxb-***
Slack App Token      ● valid        xapp-***
Notion Token         ● valid
OpenClaw Gateway     ● live         42ms
Commerce API         ● down         ECONNREFUSED
SQLite               ● ready        [LOCAL_PATH]
```

---

## 관련 문서

- [domain-entities.md](domain-entities.md) — 전체 엔티티 정의
- [failure-modes.md](failure-modes.md) — 연결 실패 처리 시나리오
