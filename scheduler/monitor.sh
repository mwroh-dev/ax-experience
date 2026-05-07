#!/usr/bin/env bash
# Stall detector. Reads .heartbeat.latest and alerts if older than STALL_THRESHOLD_MINUTES.
# Usage: ./scheduler/monitor.sh
# Returns exit code 0 if healthy, 1 if stalled.
set -euo pipefail

SCHEDULER_DIR="$(dirname "$0")"
HEARTBEAT_FILE="${SCHEDULER_DIR}/.heartbeat.latest"
PHASES_FILE="${SCHEDULER_DIR}/phases.yaml"

# Parse stall threshold from phases.yaml (requires grep, no yq dependency)
STALL_MINUTES=$(grep 'stall_threshold_minutes' "${PHASES_FILE}" | awk '{print $2}')
STALL_MINUTES="${STALL_MINUTES:-30}"
STALL_SECONDS=$((STALL_MINUTES * 60))

echo "=== CS Ops Harness Phase Monitor ==="
echo "Stall threshold: ${STALL_MINUTES} minutes"
echo ""

# Check active phase: id: appears 2 lines before active: true at phase level (4-space indent)
ACTIVE_PHASE=$(grep -B2 '^    active: true' "${PHASES_FILE}" | grep '  - id:' | awk '{print $3}' | tr -d '"' | head -1 || true)
echo "Active phase: ${ACTIVE_PHASE:-unknown}"
echo ""

# Check heartbeat age
if [[ ! -f "${HEARTBEAT_FILE}" ]]; then
  echo "WARNING: No heartbeat recorded yet."
  echo "   Start working and run ./scheduler/heartbeat.sh <task_id> to register activity."
  exit 0
fi

LAST_BEAT=$(cat "${HEARTBEAT_FILE}")
LAST_BEAT_TIME=$(echo "${LAST_BEAT}" | awk '{print $1}')
LAST_BEAT_TASK=$(echo "${LAST_BEAT}" | awk '{print $2}')

# Cross-platform timestamp comparison
# macOS `date -j` interprets the format in local time, so TZ=UTC is required for UTC timestamps.
if command -v gdate &>/dev/null; then
  LAST_EPOCH=$(gdate -d "${LAST_BEAT_TIME}" +%s 2>/dev/null || echo 0)
else
  LAST_EPOCH=$(TZ=UTC date -j -f "%Y-%m-%dT%H:%M:%SZ" "${LAST_BEAT_TIME}" +%s 2>/dev/null || echo 0)
fi

NOW_EPOCH=$(date +%s)
ELAPSED=$((NOW_EPOCH - LAST_EPOCH))
ELAPSED_MINUTES=$((ELAPSED / 60))

echo "Last heartbeat: ${LAST_BEAT_TIME}"
echo "Last task:      ${LAST_BEAT_TASK}"
echo "Elapsed:        ${ELAPSED_MINUTES} minutes"
echo ""

if [[ ${ELAPSED} -gt ${STALL_SECONDS} ]]; then
  echo "STALL DETECTED -- no activity for ${ELAPSED_MINUTES} minutes (threshold: ${STALL_MINUTES}m)"
  echo "   Last task: ${LAST_BEAT_TASK}"
  echo "   Action: check if a hermes/ouroboros session is blocked or waiting for input."
  exit 1
else
  echo "HEALTHY -- ${ELAPSED_MINUTES}m elapsed, within ${STALL_MINUTES}m threshold"
  exit 0
fi
