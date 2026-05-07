# OpenClaw CS Bot Contract

## Overview

api가 CS bot을 호출하는 인터페이스.
입력은 case-centric (Slack field 없음).

## 현재 구현

OpenClaw gateway `/v1/chat/completions`가 `internal error`를 반환하는 기존 이슈로,
Ollama OpenAI-compatible endpoint를 직접 호출한다 (`http://localhost:11434/v1`).
OpenClaw도 내부적으로 Ollama를 사용하므로 동일한 LLM backend.

## Request

```typescript
{
  case_id: string;
  mode: 'answer_draft' | 'keep_summary' | 'pending_investigation';
  user_message: string;
  known_context?: { source?: string; [key: string]: unknown };
  evidence_snippets?: string[];
}
```

Slack-specific 필드 (channel_id, thread_ts, message_ts, action_id) 포함 금지.

## Response

```typescript
{
  case_id: string;
  mode: CsBotMode;
  draft: string;
  evidence_used: string[];
  confidence: 'high' | 'medium' | 'low';
  needs_more_info: boolean;
  raw_llm_response: string;
}
```

## Modes

| mode | 용도 |
|------|------|
| answer_draft | Accept 버튼 → 답변 초안 생성 |
| keep_summary | Keep 버튼 → 보관용 요약 |
| pending_investigation | Pending 버튼 → 필요 정보 목록 |

## Side Effects

- SQLite `tool_calls` row 생성 (status: success/error)
- case_events: `cs_bot_draft_ready`
- (Socket Mode 경우) Slack thread에 draft 게시

## Known Issues

- llama3.2:1b 모델 응답 품질 이슈 (Gate 5A에서 기록된 기존 이슈)
- OpenClaw gateway `/v1/chat/completions` internal error (게이트웨이 초기화 이슈)
