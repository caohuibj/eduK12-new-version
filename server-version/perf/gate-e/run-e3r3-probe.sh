#!/usr/bin/env bash
# E3R same-child concurrent-first-submit risk probe runner (Stage 3R).
#
# For each concurrency level (2, 5, 10):
#   1. PRE-RUN DRAIN PROOF: UNIT active=0, UNIT queue=0, no stale k6, no
#      in-flight benchmark requests.
#   2. Generate FRESH probe fixtures (tail-of-pool IN_PROGRESS sessions) via
#      backend/scripts/e3r-probe-fixtures.ts.
#   3. Snapshot durable counts for those exact session ids.
#   4. Run k6-e3r-concurrent-probe.js (one VU per session, CONCURRENCY
#      simultaneous async first-submits per session).
#   5. Snapshot durable counts again; classify per session.
#
# Reusable env: BASE_URL, K6DIR, FIXDIR, SUMDIR, PGURL, BACKEND_DIR
# Usage: run-e3r3-probe.sh
set -uo pipefail

BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
BACKEND_DIR="${BACKEND_DIR:-/data/user/work/eduK12-new-version/server-version/backend}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
SUMDIR="${SUMDIR:-$FIXDIR/e3r3}"
PGURL="${PGURL:-}"

mkdir -p "$SUMDIR"

if [ -z "$PGURL" ]; then
  ENVFILE="$BACKEND_DIR/.env"
  PGURL=$(grep -E '^DATABASE_URL=' "$ENVFILE" | head -1 | cut -d= -f2-)
fi
PGHOST=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^@]+@([^:/]+).*#\1#')
PGPORT=$(printf '%s' "$PGURL" | sed -E 's#.*:([0-9]+)/.*#\1#')
PGUSER=$(printf '%s' "$PGURL" | sed -E 's#postgresql://([^:]+):.*#\1#')
PGPASSWORD=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^:]+:([^@]+)@.*#\1#')
PGDATABASE=$(printf '%s' "$PGURL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A)

metric() { curl -s -m 3 "$BASE/metrics" | grep "^$1 " | awk '{print $2}' | head -1; }
unit_active() { metric 'ptool_bounded_admission_active{gate="unit_submit"}'; }
unit_queue() { metric 'ptool_bounded_admission_queue{gate="unit_submit"}'; }
inflight() { metric 'ptool_nodejs_active_requests'; }
stale_k6() { ps aux | grep -E '[k]6 run' | wc -l; }

drain_ok() {
  local a q st inf
  a=$(unit_active); q=$(unit_queue); st=$(stale_k6); inf=$(inflight)
  [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && [ "$st" = "0" ] && [ "${inf:-x}" -le 1 ]
}

wait_drain_tail() {
  local start
  start=$(date +%s)
  local i
  for i in $(seq 1 60); do
    a=$(unit_active); q=$(unit_queue)
    [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && { echo $(( $(date +%s) - start )); return 0; }
    sleep 1
  done
  echo $(( $(date +%s) - start ))
  return 1
}

# session ids for a fixture file -> psql-safe quoted list
session_ids() {
  python3 - "$1" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
group = d.get('cognitiveNormal') or list(d.values())[0]
print(','.join("'%s'" % f['sessionId'] for f in group))
PY
}

db_raw_for() { local ids="$1"; "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_raw_submissions WHERE session_id IN ($ids);"; }
db_done_for() { local ids="$1"; "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_sessions WHERE status='COMPLETED' AND id IN ($ids);"; }
db_inprog_for() { local ids="$1"; "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_sessions WHERE status!='COMPLETED' AND id IN ($ids);"; }

run_probe() {
  local c="$1"
  local tag="e3r3-probe-conc$c"
  local fix="$FIXDIR/e3r-probe-normal-conc$c.json"
  local rec="$SUMDIR/$tag.json"
  local k6sum="$SUMDIR/$tag-k6.json"
  local k6log="$SUMDIR/$tag-k6.log"

  # 1. pre-run drain proof
  if ! drain_ok; then
    local i
    for i in 1 2 3 4 5; do sleep 3; drain_ok && break; done
    if ! drain_ok; then
      echo "{\"tag\":\"$tag\",\"error\":\"pre-run drain check FAILED: unit_active=$(unit_active) unit_queue=$(unit_queue) stale_k6=$(stale_k6) inflight=$(inflight)\"}" > "$rec"
      echo "ABORT $tag: drain check failed"
      return 1
    fi
  fi

  # 2. fresh probe fixtures (tail-of-pool IN_PROGRESS sessions)
  # The tsx wrapper can linger after writing; timeout bounds it so the probe
  # never hangs on fixture generation.
  ( cd "$BACKEND_DIR" && timeout 120 env E3_PROBE_OUT="$fix" E3_PROBE_COUNT=3 npx tsx scripts/e3r-probe-fixtures.ts > "$SUMDIR/$tag-fixture.log" 2>&1 ) || { echo "ABORT $tag: fixture generation failed"; return 1; }
  [ -f "$fix" ] || { echo "ABORT $tag: fixture file missing ($fix)"; return 1; }

  local ids
  ids=$(session_ids "$fix")
  [ -n "$ids" ] || { echo "ABORT $tag: no sessions in fixture"; return 1; }

  local raw0 done0 ip0
  raw0=$(db_raw_for "$ids"); done0=$(db_done_for "$ids"); ip0=$(db_inprog_for "$ids")

  # 4. run k6 probe
  local t0 t1 drain_s drain_rc
  t0=$(date +%s)
  ( cd "$K6DIR" && k6 run \
    -e BASE_URL="$BASE" \
    -e FIXTURE_FILE="$fix" \
    -e GROUP=cognitiveNormal \
    -e CONCURRENCY="$c" \
    -e PROBE_SUMMARY_PATH="$k6sum" \
    k6-e3r-concurrent-probe.js ) > "$k6log" 2>&1
  local k6rc=$?
  drain_s=$(wait_drain_tail); drain_rc=$?
  t1=$(date +%s)

  local raw1 done1 ip1
  raw1=$(db_raw_for "$ids"); done1=$(db_done_for "$ids"); ip1=$(db_inprog_for "$ids")

  local k6json='{}'
  [ -f "$k6sum" ] && k6json=$(cat "$k6sum")

  cat > "$rec" <<EOF
{
  "tag": "$tag",
  "concurrency": $c,
  "session_ids": [$(printf '%s' "$ids" | sed "s/'/\"/g")],
  "pre_fresh_raw": $raw0,
  "pre_fresh_completed": $done0,
  "pre_fresh_inprogress": $ip0,
  "durable_raw_submissions": $(( raw1 - raw0 )),
  "durable_session_completions": $(( done1 - done0 )),
  "inprogress_after": $ip1,
  "drain_tail_s": $drain_s,
  "drain_clean": $([ $drain_rc -eq 0 ] && echo true || echo false),
  "full_runtime_s": $(( t1 - t0 )),
  "k6_exit": $k6rc,
  "k6": $k6json
}
EOF
  echo "DONE $tag c=$c raw_delta=$(( raw1 - raw0 )) done_delta=$(( done1 - done0 )) inprog_after=$ip1 drain=${drain_s}s"
}

echo "Stage 3R concurrent-first-submit probe (concurrency 2/5/10)"
for c in 2 5 10; do
  run_probe "$c"
done
echo "Stage 3R probe complete -> $SUMDIR"
