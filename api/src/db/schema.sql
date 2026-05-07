CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_channel_id TEXT,
  source_thread_ts TEXT,
  source_message_ts TEXT,
  external_request_id TEXT,
  requester_slack_user_id TEXT,
  raw_text TEXT NOT NULL,
  intent TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'intake_review',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS case_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_messages (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  review_channel_id TEXT NOT NULL,
  review_message_ts TEXT NOT NULL,
  blocks_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id),
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
