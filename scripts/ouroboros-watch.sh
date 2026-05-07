#!/usr/bin/env bash
# Ouroboros session watcher — reads ~/.ouroboros/ouroboros.db directly
# Usage: ./scripts/ouroboros-watch.sh [session_id] [exec_id]
# No external packages — sqlite3 only (macOS built-in)

SESSION_ID="${1:-orch_2ffcb26b16f5}"
EXEC_ID="${2:-exec_a1164b5d7f8f}"
DB="$HOME/.ouroboros/ouroboros.db"

render() {
  python3 - "$SESSION_ID" "$EXEC_ID" "$DB" <<'PYEOF'
import sys, sqlite3, json, datetime

session_id, exec_id, db = sys.argv[1], sys.argv[2], sys.argv[3]

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)

# Latest progress snapshot
row = con.execute("""
  SELECT payload FROM events
  WHERE aggregate_id = ? AND event_type = 'workflow.progress.updated'
  ORDER BY timestamp DESC LIMIT 1
""", (exec_id,)).fetchone()

# Heartbeat count (activity proxy)
msgs = con.execute("""
  SELECT COUNT(*) FROM events
  WHERE aggregate_id = ?
""", (exec_id,)).fetchone()[0]

# Latest thinking snippet
think = con.execute("""
  SELECT json_extract(payload,'$.thinking_text'), json_extract(payload,'$.ac_index')
  FROM events
  WHERE aggregate_id = ? AND event_type = 'execution.agent.thinking'
  ORDER BY timestamp DESC LIMIT 1
""", (exec_id,)).fetchone()

con.close()

now = datetime.datetime.now().strftime("%H:%M:%S")

if not row:
  print(f"[{now}] No progress events found for session {session_id}")
  sys.exit(0)

data = json.loads(row[0])
acs = data.get("acceptance_criteria", [])
done = data.get("completed_count", 0)
total = data.get("total_count", 0)
phase = data.get("current_phase", "?")
activity = data.get("activity_detail", data.get("activity", "?"))

icons = {"completed": "●", "executing": "◐", "pending": "○", "failed": "✗"}
colors = {"completed": "\033[32m", "executing": "\033[33m", "pending": "\033[90m", "failed": "\033[31m"}
reset = "\033[0m"

bar_filled = int((done / total) * 20) if total else 0
bar = "█" * bar_filled + "░" * (20 - bar_filled)

print(f"\033[1m Ouroboros — {session_id}\033[0m")
print(f" [{bar}] {done}/{total}  Phase: {phase}  {now}")
print(f" Activity: {activity}  |  Events: {msgs}")
print()

for ac in acs:
  status = ac.get("status", "pending")
  icon = icons.get(status, "?")
  color = colors.get(status, "")
  num = ac.get("root_ac_number", "?")
  content = ac.get("content", "")[:72]
  print(f"  {color}{icon} AC {num}: {content}{reset}")

if think and think[0]:
  snippet = think[0].replace("\n", " ")[:100]
  print(f"\n  \033[90m💭 AC{think[1]+1}: {snippet}...\033[0m")

PYEOF
}

if [[ "${WATCH:-1}" == "1" ]]; then
  while true; do
    clear
    render
    sleep 4
  done
else
  render
fi
