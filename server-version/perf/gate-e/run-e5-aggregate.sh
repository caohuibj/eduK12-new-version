#!/usr/bin/env bash
# Stage 5 (Program S5) Aggregate finalizer characterization runner.
#
# Workloads over UNIFIED_V1 ready-parent fixtures (each = last-form-section
# submit driving finalize via POST /complete):
#   size curve   : MODE=distinct, GROUP=parentN2..parentN100, VUS=5 -> N-scaling
#   many-parent  : MODE=distinct, GROUP=parentN5, VUS in 10/25/50 -> throughput
#   stampede     : MODE=stampede, GROUP=parentN2, VUS in 2/10/50 -> CAS/dup probe
# Emits records to $SUMDIR with Stage-2R-corrected DB completion accounting.
#
#   BASE_URL, K6DIR, FIXTURE_FILE, SUMDIR, PGURL, AUTH_TOKEN, CSRF_TOKEN
set -uo pipefail

BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXFILE="${FIXTURE_FILE:-/workspace/eduk12-pr49-cloud-results/e5s/ready-parent-fixtures.json}"
SUMDIR="${SUMDIR:-/workspace/eduk12-pr49-cloud-results/e5s/sums}"
PGURL="${PGURL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] && [ -f /workspace/eduk12-pr49-cloud-results/e4s2/auth.env ]; then
  AUTH_TOKEN=$(grep -E '^PERF_AUTH_TOKEN=' /workspace/eduk12-pr49-cloud-results/e4s2/auth.env | cut -d= -f2-)
  CSRF_TOKEN=$(grep -E '^PERF_CSRF_TOKEN=' /workspace/eduk12-pr49-cloud-results/e4s2/auth.env | cut -d= -f2-)
fi
mkdir -p "$SUMDIR"

# --- DB env ---------------------------------------------------------------
if [ -z "$PGURL" ]; then
  PGURL=$(grep -E '^DATABASE_URL=' /data/user/work/eduK12-new-version/server-version/backend/.env | head -1 | cut -d= -f2-)
fi
PGHOST=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^@]+@([^:/]+).*#\1#')
PGPORT=$(printf '%s' "$PGURL" | sed -E 's#.*:([0-9]+)/.*#\1#')
PGUSER=$(printf '%s' "$PGURL" | sed -E 's#postgresql://([^:]+):.*#\1#')
PGPASSWORD=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^:]+:([^@]+)@.*#\1#')
PGDATABASE=$(printf '%s' "$PGURL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A)

WHEREE5="${E5_CODE_FILTER:-q.code LIKE 'E5-Q-e5p3-%'}"
db_completed() { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_assessments qa JOIN questionnaires q ON qa.questionnaire_id=q.id WHERE $WHEREE5 AND qa.status='COMPLETED';"; }
db_report()   { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_assessments qa JOIN questionnaires q ON qa.questionnaire_id=q.id WHERE $WHEREE5 AND qa.status='COMPLETED' AND qa.aggregate_report_encrypted IS NOT NULL;"; }
db_inprog()   { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_assessments qa JOIN questionnaires q ON qa.questionnaire_id=q.id WHERE $WHEREE5 AND qa.status='IN_PROGRESS';"; }

metric() { curl -s -m 3 "$BASE/metrics" | grep "^$1 " | awk '{print $2}' | head -1; }
agg_active() { metric 'ptool_bounded_admission_active{gate="aggregate_finalization"}'; }
agg_queue() { metric 'ptool_bounded_admission_queue{gate="aggregate_finalization"}'; }
stale_k6() { ps aux | grep -E '[k]6 run' | wc -l; }
cg_snapshot() {
  local stat max
  stat=$(awk -F' ' '{printf "%s=%s;", $1, $2}' /sys/fs/cgroup/cpu.stat 2>/dev/null)
  max=$(tr ' ' '/' < /sys/fs/cgroup/cpu.max 2>/dev/null)
  printf 'cpu_max=%s;%s' "$max" "$stat"
}
drain_ok() {
  local a q st
  a=$(agg_active); q=$(agg_queue); st=$(stale_k6)
  [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && [ "$st" = "0" ]
}
wait_drain() {
  local start i a q
  start=$(date +%s)
  for i in $(seq 1 90); do
    a=$(agg_active); q=$(agg_queue)
    [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && { echo $(( $(date +%s) - start )); return 0; }
    sleep 1
  done
  echo $(( $(date +%s) - start )); return 1
}

run_one() {
  local mode="$1" group="$2" peak="$3" idx="$4" tag="$5"
  local rec="$SUMDIR/$tag.json"
  local t0 t1 drain_s pre
  t0=$(date +%s)
  pre=clean
  if ! drain_ok; then
    pre=retried
    for i in 1 2 3 4 5; do sleep 3; drain_ok && { pre=clean-after-retry; break; }; done
    if ! drain_ok; then
      echo "{\"tag\":\"$tag\",\"error\":\"pre-run drain failed: agg_active=$(agg_active) agg_queue=$(agg_queue) stale_k6=$(stale_k6)\"}" > "$rec"
      echo "ABORT $tag: drain fail"; return 1
    fi
  fi
  local c0 r0 p0 cg0
  c0=$(db_completed); r0=$(db_report); p0=$(db_inprog); cg0=$(cg_snapshot)
  local summary="$SUMDIR/$tag-k6.json" k6log="$SUMDIR/$tag-k6.log"
  rm -f "$summary"
  local extra=()
  if [ "$mode" = stampede ]; then
    extra=(-e FIXTURE_INDEX="$idx")
  else
    extra=(-e FIXTURE_OFFSET="${DIST_OFFSET:-1}")
  fi
  ( cd "$K6DIR" && k6 run \
    -e BASE_URL="$BASE" \
    -e FIXTURE_FILE="$FIXFILE" \
    -e MODE="$mode" \
    -e GROUP="$group" \
    -e PEAK="$peak" \
    -e AUTH_TOKEN="$AUTH_TOKEN" \
    -e CSRF_TOKEN="$CSRF_TOKEN" \
    -e GATE_E_SUMMARY_PATH="$summary" \
    "${extra[@]}" \
    k6-e5-finalize.js ) > "$k6log" 2>&1
  local k6rc=$?
  local c1 r1 p1 cg1
  c1=$(db_completed); r1=$(db_report); p1=$(db_inprog); cg1=$(cg_snapshot)
  drain_s=$(wait_drain); local drain_rc=$?
  t1=$(date +%s)
  local k6json='{}' k6err='""'
  if [ "$k6rc" -eq 0 ] && [ -f "$summary" ]; then k6json=$(cat "$summary")
  else k6err=$(tail -5 "$k6log" 2>/dev/null | tr '\n' ' ' | cut -c1-500 | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"); fi
  cat > "$rec" <<EOF
{
  "tag": "$tag",
  "stage": "5",
  "mode": "$mode",
  "group": "$group",
  "n": ${group#parentN},
  "peak_vus": $peak,
  "fixture_index": "$idx",
  "pre_run_drain": "$pre",
  "drain_clean": $([ $drain_rc -eq 0 ] && echo true || echo false),
  "drain_tail_s": $drain_s,
  "full_runtime_s": $(( t1 - t0 )),
  "k6_exit": $k6rc,
  "k6_error": $k6err,
  "db_completed_delta": $(( c1 - c0 )),
  "db_report_delta": $(( r1 - r0 )),
  "db_inprogress_before": $p0,
  "db_inprogress_after": $p1,
  "db_completed_before": $c0,
  "db_completed_after": $c1,
  "cgroup_before": "$cg0",
  "cgroup_after": "$cg1",
  "k6": $k6json
}
EOF
  echo "DONE $tag mode=$mode n=${group#parentN} vus=$peak k6rc=$k6rc done_delta=$(( c1 - c0 )) report_delta=$(( r1 - r0 )) drain=${drain_s}s"
}

PHASE="${1:-all}"

if [ "$PHASE" = all ] || [ "$PHASE" = size ]; then
  echo "=== Stage 5 size curve (VUS=5, MODE=distinct, offset 1) ==="
  for n in 2 5 10 25 50 100; do
    run_one distinct "parentN$n" 5 0 "e5s-size-n${n}-v5"
  done
fi

if [ "$PHASE" = all ] || [ "$PHASE" = many ]; then
  # Disjoint fresh parents per run: 10 @ offset26 (idx26-35), 25 @ offset36,
  # 50 @ offset61 (idx61-110); parentN5 pool=150 keeps every parent untouched.
  echo "=== Stage 5 many-parent throughput (GROUP=parentN5, increasing offsets) ==="
  run_one distinct parentN5 10 0 "e5s-many-n5-v10"
  export DIST_OFFSET=36
  run_one distinct parentN5 25 0 "e5s-many-n5-v25"
  export DIST_OFFSET=61
  run_one distinct parentN5 50 0 "e5s-many-n5-v50"
fi

if [ "$PHASE" = all ] || [ "$PHASE" = stampede ]; then
  echo "=== Stage 5 same-parent stampede (GROUP=parentN2 distinct parent each) ==="
  export DIST_OFFSET=1
  run_one stampede parentN2 2  6  "e5s-stampede-2-v2"
  run_one stampede parentN2 10 8  "e5s-stampede-2-v10"
  run_one stampede parentN2 50 20 "e5s-stampede-2-v50"
fi

echo "Stage 5 complete -> $SUMDIR"