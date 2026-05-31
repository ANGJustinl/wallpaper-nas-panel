#!/usr/bin/env bash
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-apps/docker-compose.yml}"
API_URL="${API_URL:-http://127.0.0.1:${PANEL_API_PORT:-3001}}"
WEB_URL="${WEB_URL:-http://127.0.0.1:${PANEL_WEB_PORT:-8080}}"
REQUIRE_WORKER_ONLINE="${REQUIRE_WORKER_ONLINE:-true}"
REQUIRE_STEAMCMD_AVAILABLE="${REQUIRE_STEAMCMD_AVAILABLE:-true}"
REQUIRE_SUCCESSFUL_TASK="${REQUIRE_SUCCESSFUL_TASK:-false}"
REQUIRE_LIBRARY_NONEMPTY="${REQUIRE_LIBRARY_NONEMPTY:-false}"
REQUIRE_NFO="${REQUIRE_NFO:-false}"

required_services=(web api worker)

fail() {
  printf 'FAIL %s\n' "$*" >&2
  exit 1
}

pass() {
  printf 'OK   %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "missing required command: $1"
}

fetch() {
  local url="$1"
  curl --fail --silent --show-error --max-time 8 "$url"
}

json_check() {
  local json="$1"
  local js_expression="$2"
  local grep_expression="$3"
  local label="$4"

  if command -v node >/dev/null 2>&1; then
    JSON_PAYLOAD="$json" node -e "
      const payload = JSON.parse(process.env.JSON_PAYLOAD || '{}');
      if (!($js_expression)) process.exit(1);
    " || fail "$label"
    return
  fi

  printf '%s' "$json" | grep -Eq "$grep_expression" || fail "$label"
}

require_command docker
require_command curl

docker compose -f "$COMPOSE_FILE" config >/dev/null || fail "compose file is not valid: $COMPOSE_FILE"

running_services="$(docker compose -f "$COMPOSE_FILE" ps --services --status running)"
for service in "${required_services[@]}"; do
  printf '%s\n' "$running_services" | grep -qx "$service" || fail "container is not running: $service"
done
pass "containers running: ${required_services[*]}"

web_html="$(fetch "$WEB_URL")"
printf '%s' "$web_html" | grep -q 'Wallpaper Workshop Panel' || fail "web did not serve panel HTML from $WEB_URL"
pass "web reachable: $WEB_URL"

health_json="$(fetch "$API_URL/api/health")"
json_check "$health_json" 'payload.ok === true' '"ok"[[:space:]]*:[[:space:]]*true' "api health check failed: $API_URL/api/health"
pass "api health ok: $API_URL/api/health"

tasks_json="$(fetch "$API_URL/api/tasks")"
json_check "$tasks_json" 'Array.isArray(payload.tasks) && payload.worker && typeof payload.worker.status === "string"' '"tasks"[[:space:]]*:[[:space:]]*\[.*"worker"[[:space:]]*:' "tasks endpoint shape is invalid"
if [[ "$REQUIRE_WORKER_ONLINE" == "true" ]]; then
  json_check "$tasks_json" 'payload.worker.online === true' '"worker"[[:space:]]*:[{][^}]*"online"[[:space:]]*:[[:space:]]*true' "worker is not online"
fi
if [[ "$REQUIRE_SUCCESSFUL_TASK" == "true" ]]; then
  json_check "$tasks_json" 'payload.tasks.some((task) => task.status === "succeeded" && task.outputPath)' '"status"[[:space:]]*:[[:space:]]*"succeeded".*"outputPath"[[:space:]]*:' "no successful downloaded task found"
fi
pass "tasks and worker state readable"

settings_json="$(fetch "$API_URL/api/settings")"
json_check "$settings_json" 'payload.settings && payload.runtime && payload.runtime.worker' '"settings"[[:space:]]*:.*"runtime"[[:space:]]*:' "settings/runtime endpoint shape is invalid"
if [[ "$REQUIRE_STEAMCMD_AVAILABLE" == "true" ]]; then
  json_check "$settings_json" 'payload.runtime.available === true' '"runtime"[[:space:]]*:[{][^}]*"available"[[:space:]]*:[[:space:]]*true' "steamcmd runtime is not available"
fi
pass "settings and runtime readable"

library_json="$(fetch "$API_URL/api/library")"
json_check "$library_json" 'Array.isArray(payload.items)' '"items"[[:space:]]*:[[:space:]]*\[' "library endpoint shape is invalid"
if [[ "$REQUIRE_LIBRARY_NONEMPTY" == "true" ]]; then
  json_check "$library_json" 'payload.items.length > 0' '"items"[[:space:]]*:[[:space:]]*\[[{]' "library has no downloaded content records"
fi
pass "library readable"

if [[ "$REQUIRE_NFO" == "true" ]]; then
  require_command node
  nfo_items="$(JSON_PAYLOAD="$library_json" node -e '
    const payload = JSON.parse(process.env.JSON_PAYLOAD || "{}");
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) process.exit(2);
    for (const item of items) {
      if (!item.id || !item.outputPath) process.exit(3);
      console.log(`${item.id}\t${item.outputPath}`);
    }
  ')" || fail "library has no downloadable content paths for NFO verification"

  while IFS=$'\t' read -r item_id output_path; do
    [[ -n "$item_id" ]] || continue
    docker compose -f "$COMPOSE_FILE" exec -T api sh -lc 'test -f "$1/workshop.nfo"' sh "$output_path" \
      || fail "missing NFO for library item $item_id: $output_path/workshop.nfo"
  done <<< "$nfo_items"

  pass "NFO files present for downloaded contents"
fi

printf '\nDeployment verification passed.\n'
