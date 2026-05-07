#!/usr/bin/env bash
# Record a heartbeat for the active phase/task.
# Usage: ./scheduler/heartbeat.sh [task_id]
# Run this at the start of each meaningful step to prevent stall alerts.
set -euo pipefail

TASK_ID="${1:-unknown}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HEARTBEAT_FILE="$(dirname "$0")/.heartbeat"

echo "${TIMESTAMP} ${TASK_ID}" >> "${HEARTBEAT_FILE}"
echo "${TIMESTAMP} ${TASK_ID}" > "${HEARTBEAT_FILE}.latest"
echo "[heartbeat] ${TIMESTAMP} — ${TASK_ID}"
