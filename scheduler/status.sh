#!/usr/bin/env bash
# Print current phase status and pending tasks.
# Usage: ./scheduler/status.sh
set -euo pipefail

PHASES_FILE="$(dirname "$0")/phases.yaml"

echo "=== CS Ops Harness Phase Status ==="
echo ""

# Show all phases with their completion status
python3 - "${PHASES_FILE}" << 'PYEOF'
import yaml, sys

with open(sys.argv[1]) as f:
    data = yaml.safe_load(f)

current = data.get('current_phase', 'unknown')
print(f"Current phase: {current}\n")

for phase in data.get('phases', []):
    active = phase.get('active', False)
    completed = phase.get('completed', False)
    marker = ">" if active else ("v" if completed else "o")
    print(f"  {marker} [{phase['id']}] {phase['name']}")

    if active:
        for lane in phase.get('lanes', []):
            priority = lane.get('priority', '?')
            tasks = lane.get('tasks', [])
            pending = [t for t in tasks if t.get('status') != 'done']
            done = [t for t in tasks if t.get('status') == 'done']
            print(f"      {priority}: {len(done)}/{len(tasks)} done")
            for t in pending[:3]:  # show first 3 pending
                status = t.get('status', '?')
                assignee = t.get('assignee', '?')
                print(f"        - [{status}] {t['label']} (-> {assignee})")
            if len(pending) > 3:
                print(f"        ... +{len(pending)-3} more")
PYEOF
