# Slack Message Archive Contract

## 원칙

- **Allowlist 기반만**: ARCHIVE_ALLOWLIST 환경변수에 명시된 채널만 수집
- **전체 채널 수집 금지**
- **Redaction 적용**: email, phone, token, sensitive URL, local path 마스킹
- **Thread replies 포함**: reply_count > 0인 메시지는 thread replies도 수집

## Tables

### slack_archive_raw

원본 메시지 (UNIQUE: channel_id + message_ts). 내부용.

### slack_archive_curated

Redacted 메시지. Knowledge search 대상.
source_id 형식: `slack:<channel_id>:<message_ts>`

### archive_fts

FTS5 가상 테이블. curated 텍스트 기반 전문 검색.

## API

### POST /api/archive/run

```json
{
  "channel_id": "[CHANNEL_ID]",
  "oldest": "1700000000.000000"
}
```

Response:
```json
{
  "ok": true,
  "channel_id": "[CHANNEL_ID]",
  "collected": 104,
  "skipped_empty": 0
}
```

## Redaction Rules

| Pattern | Replacement |
|---------|-------------|
| Email | [EMAIL] |
| Phone (Korean format) | [PHONE] |
| Slack/OpenAI tokens | [TOKEN] |
| URLs with secret/key/auth | [SENSITIVE_URL] |
| Local paths (/Users/, /home/) | [LOCAL_PATH] |

## Setup

1. `ARCHIVE_ALLOWLIST=[CHANNEL_ID],[CHANNEL_ID_2]` (채널 ID 콤마 구분)
2. Bot이 해당 채널의 member여야 함
3. `channels:history` 스코프 필요 (현재 있음)
