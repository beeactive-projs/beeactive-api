#!/usr/bin/env bash
#
# messaging-smoke.sh
#
# Manual smoke test against a running API instance. Hits every messaging
# route at least once and prints the HTTP status for each. Intended for
# post-deploy "did this actually go live?" checks — NOT a substitute for
# the automated supertest spec.
#
# Usage:
#   ./scripts/messaging-smoke.sh                                # localhost:3800
#   API_BASE=https://api.example.com ./scripts/messaging-smoke.sh
#   TOKEN=eyJhbGciOi... RECIPIENT_ID=<uuid> ./scripts/messaging-smoke.sh
#
# Required env when hitting a non-localhost deploy:
#   - TOKEN          a JWT access token for a real registered user
#   - RECIPIENT_ID   UUID of another registered user (must have ACTIVE
#                    InstructorClient with the sender)
#
# Optional:
#   - API_BASE       default http://localhost:3800
#   - VERBOSE=1      include response bodies in output
#   - ADMIN_TOKEN    JWT for a SUPER_ADMIN/SUPPORT user (skips admin
#                    checks if omitted)

set -uo pipefail

API_BASE="${API_BASE:-http://localhost:3800}"
TOKEN="${TOKEN:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
RECIPIENT_ID="${RECIPIENT_ID:-}"
VERBOSE="${VERBOSE:-0}"

fail=0
pass=0
skipped=0

check() {
  local name="$1"
  local expected="$2"
  local actual="$3"
  local body="$4"
  if [[ "$actual" == "$expected" ]]; then
    printf '  ✓ %-45s %s\n' "$name" "$actual"
    pass=$((pass + 1))
  else
    printf '  ✗ %-45s %s (expected %s)\n' "$name" "$actual" "$expected"
    [[ "$VERBOSE" == "1" ]] && printf '    response: %s\n' "$body"
    fail=$((fail + 1))
  fi
}

skip() {
  printf '  ⊘ %-45s skipped (%s)\n' "$1" "$2"
  skipped=$((skipped + 1))
}

run() {
  local method="$1"
  local path="$2"
  # `${@:3}` would unbound-var under `set -u` when no headers are
  # supplied. Guard with the `+x` idiom so the array stays defined.
  local headers=()
  if (( $# > 2 )); then
    headers=("${@:3}")
  fi
  if (( ${#headers[@]} == 0 )); then
    body=$(curl -s -o /tmp/messaging-smoke-body \
                -w '%{http_code}' \
                -X "$method" \
                "$API_BASE$path")
  else
    body=$(curl -s -o /tmp/messaging-smoke-body \
                -w '%{http_code}' \
                -X "$method" \
                "${headers[@]}" \
                "$API_BASE$path")
  fi
  code="$body"
  body="$(cat /tmp/messaging-smoke-body 2>/dev/null || true)"
}

echo "── Health ──────────────────────────"
run GET /health
check "GET /health" "200" "$code" "$body"

echo
echo "── User-facing routes ──────────────"

if [[ -z "$TOKEN" ]]; then
  for r in \
    "POST /messaging/messages" \
    "GET  /messaging/conversations" \
    "GET  /messaging/unread-count" \
    "GET  /messaging/conversations/:id" \
    "GET  /messaging/conversations/:id/messages" \
    "GET  /messaging/messages/:id" \
    "PATCH /messaging/conversations/:id/read" \
    "PATCH /messaging/conversations/:id/mute" \
    "POST /messaging/conversations/:id/leave" \
    "DELETE /messaging/messages/:id" \
    "POST /messaging/blocks" \
    "GET  /messaging/blocks" \
    "DELETE /messaging/blocks/:blockedId" \
    "POST /messaging/reports" \
    "POST /messaging/stream/ack" \
  ; do
    skip "$r" "TOKEN not set"
  done
else
  run GET /messaging/conversations
  check "GET /messaging/conversations (no token)" "401" "$code" "$body"

  run GET /messaging/conversations -H "Authorization: Bearer $TOKEN"
  check "GET /messaging/conversations" "200" "$code" "$body"

  run GET /messaging/unread-count -H "Authorization: Bearer $TOKEN"
  check "GET /messaging/unread-count" "200" "$code" "$body"

  run GET /messaging/blocks -H "Authorization: Bearer $TOKEN"
  check "GET /messaging/blocks" "200" "$code" "$body"

  run GET /messaging/conversations/not-a-uuid \
      -H "Authorization: Bearer $TOKEN"
  check "GET /messaging/conversations/:bad-uuid" "400" "$code" "$body"

  if [[ -n "$RECIPIENT_ID" ]]; then
    run POST /messaging/messages \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"recipientId\":\"$RECIPIENT_ID\",\"body\":\"smoke-test $(date +%s)\"}"
    check "POST /messaging/messages" "201" "$code" "$body"
  else
    skip "POST /messaging/messages" "RECIPIENT_ID not set"
  fi

  run POST /messaging/stream/ack \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"lastEventId":"smoke-test-event-id"}'
  check "POST /messaging/stream/ack" "201" "$code" "$body"
fi

echo
echo "── Admin routes ────────────────────"

if [[ -z "$ADMIN_TOKEN" ]]; then
  for r in \
    "GET  /admin/messaging/reports" \
    "GET  /admin/messaging/velocity-alarms" \
  ; do
    skip "$r" "ADMIN_TOKEN not set"
  done
else
  run GET /admin/messaging/reports -H "Authorization: Bearer $ADMIN_TOKEN"
  check "GET /admin/messaging/reports" "200" "$code" "$body"

  run GET /admin/messaging/velocity-alarms \
      -H "Authorization: Bearer $ADMIN_TOKEN"
  check "GET /admin/messaging/velocity-alarms" "200" "$code" "$body"

  if [[ -n "$TOKEN" ]]; then
    run GET /admin/messaging/reports -H "Authorization: Bearer $TOKEN"
    check "GET /admin/messaging/reports (non-admin)" "403" "$code" "$body"
  fi
fi

echo
echo "── SSE stream ──────────────────────"

if [[ -z "$TOKEN" ]]; then
  skip "GET /messaging/stream" "TOKEN not set"
else
  hdrs=$(timeout 3 curl -sN -D - -o /dev/null \
                "$API_BASE/messaging/stream?token=$TOKEN" || true)
  status=$(echo "$hdrs" | awk 'NR==1 {print $2}')
  ctype=$(echo "$hdrs" | awk -F': ' 'tolower($1)=="content-type" {print $2}' | tr -d '\r')
  if [[ "$status" == "200" && "$ctype" == text/event-stream* ]]; then
    printf '  ✓ %-45s %s (%s)\n' "GET /messaging/stream" "$status" "$ctype"
    pass=$((pass + 1))
  else
    printf '  ✗ %-45s %s (ctype=%s)\n' "GET /messaging/stream" "${status:-?}" "${ctype:-?}"
    fail=$((fail + 1))
  fi
fi

echo
echo "─────────────────────────────────────"
printf '  %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skipped"

exit $(( fail > 0 ? 1 : 0 ))
