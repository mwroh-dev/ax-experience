# Knowledge Search Contract

## Overview

api가 제공하는 knowledge search API.
LLM이 직접 검색하는 게 아니라, retrieval layer가 검색하고 LLM은 결과를 받는다.

## GET /api/knowledge/search?q=&limit=

```
GET /api/knowledge/search?q=환불&limit=5
```

Response:
```json
{
  "query": "환불",
  "results": [
    {
      "source_id": "api_doc:admin-api.md",
      "source_type": "api_doc",
      "title": "admin api",
      "matched_text": "...환불 가능 여부 확인 (read-only)...",
      "confidence": 0.75
    },
    {
      "source_id": "slack:C0B0F4H2YF7:1777524342.484459",
      "source_type": "slack_archive",
      "title": "Slack message (C0B0F4H2YF7)",
      "matched_text": "...case_id: case_2970e9...",
      "confidence": 0.5
    }
  ],
  "total": 3
}
```

## Source Types

| source_type | 데이터 출처 |
|------------|-----------|
| api_doc | docs/contracts/*.md |
| slack_archive | Slack archive curated messages |
| notion_policy | Notion export (Gate 9에서 추가 가능) |
| template | 답변 템플릿 |

## Search Implementation

- LIKE-based keyword search (Korean 호환)
- source_id 필수 반환
- 결과는 confidence 순으로 정렬
- limit 기본값 5, 최대 20

## Data Population

### api_doc

서버 시작 시 `docs/contracts/` 디렉토리의 모든 .md/.txt 파일을 자동 인덱싱.

### slack_archive

`POST /api/archive/run` → `GET /api/knowledge/search`로 즉시 검색 가능.
