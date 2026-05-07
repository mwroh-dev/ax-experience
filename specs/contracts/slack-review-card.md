# Slack Review Card Contract

## Overview

POST /api/cs-events 수신 시 #voc-review에 Keep/Accept/Pending 버튼 카드를 게시한다.

## Request

```json
POST /api/cs-events
{
  "source": "admin_panel",
  "event_type": "customer_question",
  "message": "제 구독 환불되나요?",
  "customer_ref": {"email": "masked@example.com"},
  "metadata": {"request_id": "req_001"}
}
```

## Response

```json
HTTP 201
{
  "case_id": "case_246cf5271b9c418f",
  "slack_ts": "1777523723.799559"
}
```

## Block Kit Structure

1. Header: `[CS Intake Review]`
2. Section fields: case_id, source, status, received_at
3. Divider
4. Section: 문의 원문 (preview)
5. Section: 판단 안내 텍스트
6. Actions: Keep / Accept / Pending buttons

## Button action_ids

| action_id | value | 의미 |
|-----------|-------|------|
| case_keep | case_id | 보관, CS bot 미호출 |
| case_accept | case_id | 수락, CS bot answer_draft 호출 |
| case_pending | case_id | 보류, 추가 정보 대기 |

## Side effects

- SQLite `cases` row 생성 (status: intake_review)
- SQLite `review_messages` row 생성 (message_ts 저장)
- SQLite `case_events` row: case_created, slack_review_posted
- #voc-log에 case_received 메시지 게시

## Setup Prerequisite

봇(`@csopsagent`)이 #voc-review, #voc-log 채널에 반드시 가입되어 있어야 한다.
채널 가입 방법: Slack UI에서 해당 채널에서 `/invite @csopsagent` 실행.
