# CS Ops Harness — Phase Scheduler

## Commands

    # Check current phase and pending tasks
    ./scheduler/status.sh

    # Record a heartbeat (run at start of each meaningful step)
    ./scheduler/heartbeat.sh <task_id>

    # Check for stalls (alert if no heartbeat in 30 min)
    ./scheduler/monitor.sh

## Advancing a Phase

1. Mark tasks done in `scheduler/phases.yaml` by changing `status: done`.
2. When all P0 tasks are done, set `active: false` on current phase, `active: true` on next phase, and update `current_phase`.
3. Commit the updated `phases.yaml`.

## Stall Detection

`monitor.sh` returns exit code 1 if no heartbeat within `stall_threshold_minutes`.

To run it on a schedule (macOS launchd or cron):

    # Replace <project-root> with the absolute path to your ax-experience checkout.
    # Add to crontab: check every hour during working hours
    0 9-18 * * * cd <project-root> && ./scheduler/monitor.sh >> /tmp/cs-ops-stall.log 2>&1

## Lane Priorities

- P0: Blocking — nothing else progresses until P0 is done.
- P1: High priority — do next after P0.
- P2: Nice-to-have — do last or skip if time-constrained.
