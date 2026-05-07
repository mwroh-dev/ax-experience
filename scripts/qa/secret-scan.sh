#!/usr/bin/env bash
# secret-scan.sh — detect leaked tokens and local paths in committed files
# Usage: bash scripts/qa/secret-scan.sh
# Exit 0 = clean, Exit 1 = findings

set -euo pipefail

FINDINGS=0
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

log_finding() {
  echo -e "${RED}[FAIL]${NC} $1"
  FINDINGS=$((FINDINGS + 1))
}

log_ok() {
  echo -e "${GREEN}[OK]${NC}   $1"
}

echo "=== Secret Scan ==="
echo ""

# Directories to scan (committed files only — excludes .env, node_modules, .git)
SCAN_DIRS="docs scripts tasks cs-ops-api/src dashboard/src README.md"

# 1. Raw Slack bot tokens
if grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
     --include="*.sh" --include="*.json" \
     -E "xoxb-[0-9]{5,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | grep -q .; then
  log_finding "Raw Slack bot token (xoxb-) found in source files"
  grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
       --include="*.sh" --include="*.json" \
       -E "xoxb-[0-9]{5,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | head -5
else
  log_ok "No raw xoxb- tokens"
fi

# 2. Raw Slack app tokens
if grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
     --include="*.sh" --include="*.json" \
     -E "xapp-[0-9]{5,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | grep -q .; then
  log_finding "Raw Slack app token (xapp-) found in source files"
  grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
       --include="*.sh" --include="*.json" \
       -E "xapp-[0-9]{5,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | head -5
else
  log_ok "No raw xapp- tokens"
fi

# 3. Notion API tokens (secret_...)
if grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
     --include="*.sh" --include="*.json" \
     -E "secret_[A-Za-z0-9]{20,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | grep -q .; then
  log_finding "Raw Notion token (secret_) found in source files"
  grep -rn --include="*.ts" --include="*.mjs" --include="*.js" --include="*.md" \
       --include="*.sh" --include="*.json" \
       -E "secret_[A-Za-z0-9]{20,}" $SCAN_DIRS 2>/dev/null | grep -v "\.env" | grep -v "example" | grep -v "\*\*\*" | head -5
else
  log_ok "No raw secret_ tokens"
fi

# 4. Local absolute paths with username
if grep -rn --include="*.md" --include="*.mjs" --include="*.sh" \
     -E "/Users/[a-zA-Z0-9_-]+/" $SCAN_DIRS 2>/dev/null | grep -v "node_modules" | grep -q .; then
  log_finding "Local absolute path (/Users/<username>/) found in committed docs/scripts"
  grep -rn --include="*.md" --include="*.mjs" --include="*.sh" \
       -E "/Users/[a-zA-Z0-9_-]+/" $SCAN_DIRS 2>/dev/null | grep -v "node_modules" | head -5
else
  log_ok "No local absolute paths"
fi

# 5. Raw Slack user/channel IDs
if grep -rn --include="*.md" --include="*.json" \
     -E '"[UC][A-Z0-9]{9,}"' $SCAN_DIRS 2>/dev/null | grep -v "example" | grep -v "C000000" | grep -q .; then
  log_finding "Possible raw Slack ID found in committed files"
  grep -rn --include="*.md" --include="*.json" \
       -E '"[UC][A-Z0-9]{9,}"' $SCAN_DIRS 2>/dev/null | grep -v "example" | grep -v "C000000" | head -5
else
  log_ok "No raw Slack IDs"
fi

echo ""
if [ "$FINDINGS" -eq 0 ]; then
  echo -e "${GREEN}=== PASS: No secrets found ($FINDINGS findings) ===${NC}"
  exit 0
else
  echo -e "${RED}=== FAIL: $FINDINGS finding(s) — fix before demo ===${NC}"
  exit 1
fi
