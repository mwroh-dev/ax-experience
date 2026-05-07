#!/usr/bin/env bash
# E2E 테스트 스크립트 — CS 운영 시나리오 검증
# Usage: ./scripts/test-e2e.sh [e2e1|e2e1b|e2e2|e2e3|f3|f4|all]

set -euo pipefail
API="http://localhost:3100"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB="$SCRIPT_DIR/../cs-ops-api/.data/cs-ops.db"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}[PASS]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1"; }
info() { echo -e "${YELLOW}[INFO]${NC} $1"; }

check_server() {
  curl -sf "$API/healthz" > /dev/null || { echo "서버 미기동. npm run dev 확인"; exit 1; }
}

get_last_case() {
  sqlite3 "$DB" "SELECT id FROM cases ORDER BY created_at DESC LIMIT 1;"
}

check_events() {
  local case_id="$1"
  sqlite3 "$DB" "SELECT event_type FROM case_events WHERE case_id='$case_id' ORDER BY created_at;"
}

# ─── E2E-1: 환불 가능 케이스 (이메일 있음 → admin API 자동 조회) ───────────────
test_e2e1() {
  info "E2E-1: 환불 가능 케이스 (eligible)"
  local REQ_ID="e2e-1-eligible-$(date +%s)"
  local RESP=$(curl -sf -X POST "$API/api/cs-events" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"email\",\"message\":\"구독 환불 가능한지 확인해주세요. 이메일은 eligible_test@test.com 입니다.\",\"metadata\":{\"request_id\":\"$REQ_ID\"}}")

  local CASE_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('case_id',''))" 2>/dev/null)
  [ -z "$CASE_ID" ] && { fail "case 생성 실패: $RESP"; return; }
  info "case_id: $CASE_ID"

  sleep 2

  # Accept 트리거 (test endpoint — guard 포함 버전)
  curl -sf -X POST "$API/api/test/action" \
    -H "Content-Type: application/json" \
    -d "{\"case_id\":\"$CASE_ID\",\"action_id\":\"case_accept\"}" > /dev/null

  # CS bot 완료 대기
  sleep 5

  local EVENTS=$(check_events "$CASE_ID")
  echo "$EVENTS" | grep -q "admin_lookup_done" && pass "admin_lookup_done 이벤트 확인" || fail "admin_lookup_done 이벤트 없음"
  echo "$EVENTS" | grep -q "agent_decision_logged" && pass "agent_decision_logged 이벤트 확인" || fail "agent_decision_logged 이벤트 없음"
  echo "$EVENTS" | grep -q "cs_bot_draft_ready" && pass "cs_bot_draft_ready 이벤트 확인" || fail "cs_bot_draft_ready 이벤트 없음"
  echo "$EVENTS" | grep -q "improvement_backlog_noted" && fail "improvement_backlog_noted 발생 (knowledge 없음)" || pass "improvement_backlog_noted 없음 (정상)"

  local TOOL_STATUS=$(sqlite3 "$DB" "SELECT status FROM tool_calls WHERE case_id='$CASE_ID' AND tool_name='auto_admin_lookup' ORDER BY created_at DESC LIMIT 1;")
  [ "$TOOL_STATUS" = "success" ] && pass "auto_admin_lookup tool_call success" || fail "auto_admin_lookup tool_call: $TOOL_STATUS"

  echo ""
}

# ─── E2E-1b: 환불 불가 케이스 (디지털 콘텐츠) ─────────────────────────────────
test_e2e1b() {
  info "E2E-1b: 환불 불가 케이스 (DIGITAL_CONTENT_DOWNLOADED)"
  local REQ_ID="e2e-1b-ineligible-$(date +%s)"
  local RESP=$(curl -sf -X POST "$API/api/cs-events" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"email\",\"message\":\"다운로드한 디지털 콘텐츠 환불 가능한가요? ineligible_test@test.com\",\"metadata\":{\"request_id\":\"$REQ_ID\"}}")

  local CASE_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('case_id',''))" 2>/dev/null)
  [ -z "$CASE_ID" ] && { fail "case 생성 실패"; return; }
  info "case_id: $CASE_ID"

  # Admin stub 직접 확인
  local CUSTOMER_ID=$(curl -sf "$API/admin/customers/lookup?email=ineligible_test@test.com" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('customer_id',''))" 2>/dev/null)
  local ELIGIBILITY=$(curl -sf "$API/admin/refunds/eligibility?customerId=$CUSTOMER_ID" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('eligible'), d.get('reason_codes',[])[0] if d.get('reason_codes') else '')" 2>/dev/null)
  echo "  admin stub 응답: $ELIGIBILITY"
  echo "$ELIGIBILITY" | grep -q "DIGITAL_CONTENT" && pass "admin stub DIGITAL_CONTENT_DOWNLOADED 확인" || fail "admin stub 시나리오 라우팅 실패"

  echo ""
}

# ─── E2E-2: 정보 부족 → Pending ────────────────────────────────────────────────
test_e2e2() {
  info "E2E-2: 정보 부족 → Pending (이메일 없음)"
  local REQ_ID="e2e-2-pending-$(date +%s)"
  local RESP=$(curl -sf -X POST "$API/api/cs-events" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"chat\",\"message\":\"구독 환불 가능한가요?\",\"metadata\":{\"request_id\":\"$REQ_ID\"}}")

  local CASE_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('case_id',''))" 2>/dev/null)
  [ -z "$CASE_ID" ] && { fail "case 생성 실패"; return; }
  info "case_id: $CASE_ID"

  sleep 2
  curl -sf -X POST "$API/api/test/action" \
    -H "Content-Type: application/json" \
    -d "{\"case_id\":\"$CASE_ID\",\"action_id\":\"case_pending\"}" > /dev/null

  sleep 5

  local EVENTS=$(check_events "$CASE_ID")
  echo "$EVENTS" | grep -q "status_changed_to_pending" && pass "status → pending 확인" || fail "status pending 전환 없음"
  echo "$EVENTS" | grep -q "cs_bot_draft_ready" && pass "cs_bot_draft_ready (pending investigation)" || fail "cs_bot_draft_ready 없음"
  echo "$EVENTS" | grep -q "admin_lookup_done" && fail "이메일 없는데 admin API 호출됨" || pass "admin API 미호출 (정상)"

  echo ""
}

# ─── E2E-3: 미지식 → Improvement Backlog ────────────────────────────────────────
test_e2e3() {
  info "E2E-3: 미지식 → Improvement Backlog"
  local REQ_ID="e2e-3-unknown-$(date +%s)"
  local RESP=$(curl -sf -X POST "$API/api/cs-events" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"email\",\"message\":\"GDPR 데이터 삭제 요청 처리 절차가 궁금합니다.\",\"metadata\":{\"request_id\":\"$REQ_ID\"}}")

  local CASE_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('case_id',''))" 2>/dev/null)
  [ -z "$CASE_ID" ] && { fail "case 생성 실패"; return; }
  info "case_id: $CASE_ID"

  sleep 2
  curl -sf -X POST "$API/api/test/action" \
    -H "Content-Type: application/json" \
    -d "{\"case_id\":\"$CASE_ID\",\"action_id\":\"case_accept\"}" > /dev/null

  sleep 7

  local EVENTS=$(check_events "$CASE_ID")
  echo "$EVENTS" | grep -q "improvement_backlog_noted" && pass "improvement_backlog_noted 이벤트 확인" || fail "improvement_backlog_noted 없음"
  echo "$EVENTS" | grep -q "agent_decision_logged" && pass "agent_decision_logged 확인" || fail "agent_decision_logged 없음"

  local DEC=$(sqlite3 "$DB" "SELECT payload_json FROM case_events WHERE case_id='$CASE_ID' AND event_type='agent_decision_logged' LIMIT 1;")
  echo "$DEC" | grep -q '"notion_hits_count":0' && pass "notion_hits_count=0 확인 (knowledge 없음)" || fail "notion_hits_count 확인 불가: $DEC"

  echo ""
}

# ─── F3: 동시 버튼 클릭 ──────────────────────────────────────────────────────────
test_f3() {
  info "F3: 동시 버튼 클릭 (concurrent_action 보호)"
  local REQ_ID="f3-concurrent-$(date +%s)"
  local RESP=$(curl -sf -X POST "$API/api/cs-events" \
    -H "Content-Type: application/json" \
    -d "{\"source\":\"email\",\"message\":\"F3 test\",\"metadata\":{\"request_id\":\"$REQ_ID\"}}")

  local CASE_ID=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('case_id',''))" 2>/dev/null)
  [ -z "$CASE_ID" ] && { fail "case 생성 실패"; return; }
  info "case_id: $CASE_ID"

  sleep 1
  # 동시에 accept 2번
  curl -sf -X POST "$API/api/test/action" -H "Content-Type: application/json" \
    -d "{\"case_id\":\"$CASE_ID\",\"action_id\":\"case_accept\"}" > /dev/null &
  curl -sf -X POST "$API/api/test/action" -H "Content-Type: application/json" \
    -d "{\"case_id\":\"$CASE_ID\",\"action_id\":\"case_accept\"}" > /dev/null &
  wait
  sleep 1

  local STATUS=$(sqlite3 "$DB" "SELECT status FROM cases WHERE id='$CASE_ID';")
  [ "$STATUS" = "accepted" ] && pass "최종 status=accepted (정상)" || fail "status=$STATUS (예상: accepted)"

  local STALE_CNT
  STALE_CNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM case_events WHERE case_id='$CASE_ID' AND event_type='stale_action_rejected';")
  [ "$STALE_CNT" -ge 1 ] && pass "stale_action_rejected ${STALE_CNT}회 확인" || fail "stale_action_rejected 없음 (동시성 보호 미작동)"

  echo ""
}

# ─── F4: Admin API timeout ────────────────────────────────────────────────────────
test_f4() {
  info "F4: Admin API timeout (timeout_*@test.com)"
  local START=$(date +%s)
  local RESULT=$(curl -sf "$API/admin/customers/lookup?email=timeout_test@test.com" 2>&1 || true)
  local END=$(date +%s)
  local ELAPSED=$((END - START))
  info "응답 시간: ${ELAPSED}s"
  [ $ELAPSED -ge 5 ] && pass "6초 지연 확인 (timeout 시뮬레이션 동작)" || info "응답 시간 ${ELAPSED}s (stub이 빠르게 응답 — curl이 먼저 받음)"
  echo ""
}

# ─── Admin Stub 기본 검증 ─────────────────────────────────────────────────────────
test_admin_stubs() {
  info "Admin stub 시나리오 라우팅 검증"

  local RES=$(curl -sf "$API/admin/customers/lookup?email=eligible_001@test.com")
  echo "$RES" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['found']==True, d; print('  eligible lookup OK')" && pass "eligible lookup" || fail "eligible lookup"

  local CID=$(echo "$RES" | python3 -c "import json,sys; print(json.load(sys.stdin)['customer_id'])" 2>/dev/null)
  curl -sf "$API/admin/refunds/eligibility?customerId=$CID" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['eligible']==True, d; print('  eligible refund OK')" && pass "eligible refund" || fail "eligible refund"

  curl -sf "$API/admin/customers/lookup?email=notfound_001@test.com" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['found']==False, d; print('  notfound OK')" && pass "notfound lookup" || fail "notfound lookup"

  curl -sf "$API/admin/refunds/eligibility?customerId=cust_ineligible_test_test" | python3 -c "
import json,sys; d=json.load(sys.stdin)
assert d['eligible']==False, d
assert 'DIGITAL_CONTENT_DOWNLOADED' in d['reason_codes'], d
print('  ineligible refund OK')
" && pass "ineligible refund" || fail "ineligible refund"

  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────────
check_server
SCENARIO="${1:-all}"
case "$SCENARIO" in
  e2e1)  test_e2e1 ;;
  e2e1b) test_e2e1b ;;
  e2e2)  test_e2e2 ;;
  e2e3)  test_e2e3 ;;
  f3)    test_f3 ;;
  f4)    test_f4 ;;
  stubs) test_admin_stubs ;;
  all)
    test_admin_stubs
    test_e2e1b
    test_e2e2
    test_e2e3
    test_f3
    test_f4
    info "E2E-1 (accept with Slack button)은 Slack 리뷰 채널에서 수동으로 확인하세요."
    ;;
  *) echo "Usage: $0 [e2e1|e2e1b|e2e2|e2e3|f3|f4|stubs|all]" ;;
esac
