#!/usr/bin/env bash
# 5R-B Aggregate SUSTAINED many-parent throughput (constant-arrival, fresh parents).
# Replaces the one-shot per-VU burst capacity estimate. Each (rate,run) uses a
# DISJOINT offset slice of the fresh parentN5 pool, running a 30s constant-
# arrival finalize workload. DB completed/report delta is the durable-parent
# authority; productive finalize_per_s = fresh durable parents / steady seconds.
#
#   BASE_URL, K6DIR, FIXDIR, SUMDIR, PGURL, AUTH_TOKEN, CSRF_TOKEN
# Usage: run-e5r-sustained-many.sh
set -uo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
FIXFILE="${FIXTURE_FILE:-$FIXDIR/e5s2/ready-parent-fixtures.json}"
SUMDIR="${SUMDIR:-$FIXDIR/e5r/sums}"
RATES="${RATES:-20 30 35 40 45}"
RUNS="${RUNS:-1 2 3}"
PGURL="${PGURL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] && [ -f "$FIXDIR/e4s2/auth.env" ]; then
  AUTH_TOKEN=$(grep -E '^PERF_AUTH_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
  CSRF_TOKEN=$(grep -E '^PERF_CSRF_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
fi
mkdir -p "$SUMDIR"

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
WHEREE5="${E5_CODE_FILTER:-(q.code ~ 'E5-Q-e5rp-5-[0-9]+' OR q.code ~ 'E5-Q-e5rpb-5-[0-9]+')}"
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
  for i in $(seq 1 180); do
    a=$(agg_active); q=$(agg_queue)
    [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && { echo $(( $(date +%s) - start )); return 0; }
    sleep 1
  done
  echo $(( $(date +%s) - start )); return 1
}

# offset: each (rate,run) slice is disjoint. Pool slices are consumed top-down
# in run order: r1..r3 for a rate, then next rate. Within a rate, slice size =
# warmup bias (5/s over ~6s open-loop) + rate*30 steady.
OFFSET=0
run_one() {
  local rate="$1" run="$2" tag="$3"
  local rec="$SUMDIR/$tag.json"
  local slice=$(( rate * 30 + 40 ))
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
  local pre_vus=40 max_vus=240
  [ $(( rate * 2 )) -lt 40 ] && pre_vus=$(( rate * 2 ))
  [ $(( rate * 4 )) -lt 240 ] && max_vus=$(( rate * 4 ))
  [ "$max_vus" -lt "$pre_vus" ] && max_vus=$pre_vus
  ( cd "$K6DIR" && k6 run \
    -e BASE_URL="$BASE" -e FIXTURE_FILE="$FIXFILE" -e GROUP=parentN5 \
    -e AUTH_TOKEN="$AUTH_TOKEN" -e CSRF_TOKEN="$CSRF_TOKEN" \
    -e RATE="$rate" -e DURATION=30s \
    -e FIXTURE_OFFSET="$OFFSET" \
    -e PRE_ALLOCATED_VUS="$pre_vus" -e MAX_VUS="$max_vus" \
    -e GATE_E_SUMMARY_PATH="$summary" \
    k6-e5r-sustained-many.js ) > "$k6log" 2>&1
  local k6rc=$?
  local c1 r1 p1 cg1
  c1=$(db_completed); r1=$(db_report); p1=$(db_inprog); cg1=$(cg_snapshot)
  drain_s=$(wait_drain); local drain_rc=$?
  t1=$(date +%s)
  local k6json='{}' k6err='""'
  if [ "$k6rc" -eq 0 ] && [ -f "$summary" ]; then k6json=$(cat "$summary")
  else k6err=$(tail -5 "$k6log" 2>/dev/null | tr '\n' ' ' | cut -c1-500 | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"); fi
  local done_delta=$(( c1 - c0 ))
  cat > "$rec" <<EOF
{
  "tag": "$tag","stage":"5R","phase":"B","group":"parentN5","target_rate":$rate,"run":"r$run",
  "configured_duration_s":30,"fixture_offset":$OFFSET,"pre_run_drain":"$pre",
  "drain_clean":$([ $drain_rc -eq 0 ] && echo true || echo false),
  "drain_tail_s":$drain_s,"full_runtime_s":$(( t1 - t0 )),"k6_exit":$k6rc,"k6_error":$k6err,
  "db_completed_delta":$done_delta,"db_report_delta":$(( r1 - r0 )),
  "db_inprogress_before":$p0,"db_inprogress_after":$p1,
  "db_completed_before":$c0,"db_completed_after":$c1,
  "productive_finalize_per_s":$([ $done_delta -gt 0 ] && echo "$(python3 -c "print(round($done_delta/30.0,3))")" || echo 0),
  "cgroup_before":"$cg0","cgroup_after":"$cg1","k6":$k6json
}
EOF
  echo "DONE $tag rate=$rate run=r$run k6rc=$k6rc done_delta=$done_delta drain=${drain_s}s offset=$OFFSET"
  OFFSET=$(( OFFSET + slice ))
}

echo "Stage 5R-B aggregate sustained many-parent: rates=${RATES[*]} runs=${RUNS[*]} pool=$FIXFILE"
for rate in $RATES; do
  for run in $RUNS; do
    run_one "$rate" "$run" "e5r-sustained-n5-${rate}s-r${run}"
  done
done
echo "Stage 5R-B complete -> $SUMDIR"