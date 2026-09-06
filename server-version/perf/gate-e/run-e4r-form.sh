#!/usr/bin/env bash
# Stage 4R Form boundary re-confirmation.
# Same UNIFIED_V1 form fixtures, shared 2C4G topology, Stage-2R accounting,
# constant-arrival-rate, 30s steady. Runs boundary points with fresh r2/r3 bands
# (r1 already captured in the e4s sweep). Separates latency knee from throughput
# knee; never labels the first Lateca spike alone as the throughput boundary.
#
#   BASE_URL K6DIR SUMDIR BANDS AUTH_TOKEN CSRF_TOKEN equivalent to run-e4s-*
# Usage: run-e4r-form.sh <normal|large>
set -uo pipefail
CLASS="${1:?usage: run-e4r-form.sh <normal|large>}"
BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
SUMDIR="${SUMDIR:-$FIXDIR/e4s3/sums}"
BANDS="${BANDS:-$FIXDIR/e4s3/bands}"
PGURL="${PGURL:-}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] && [ -f "$FIXDIR/e4s2/auth.env" ]; then
  AUTH_TOKEN=$(grep -E '^PERF_AUTH_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
  CSRF_TOKEN=$(grep -E '^PERF_CSRF_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
fi
mkdir -p "$SUMDIR"

if [ "$CLASS" = normal ]; then GROUP=formNormal; RATES=(85 100 115); else GROUP=formLarge; RATES=(55 70 85 100); fi

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
db_fsub_count() { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_form_answers;"; }
db_form_done() { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_form_section_attempts WHERE status='COMPLETED';"; }
db_form_ip()   { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_form_section_attempts WHERE status!='COMPLETED';"; }

metric() { curl -s -m3 "$BASE/metrics" | grep "^$1 " | awk '{print $2}' | head -1; }
unit_active() { metric 'ptool_bounded_admission_active{gate="unit_submit"}'; }
unit_queue() { metric 'ptool_bounded_admission_queue{gate="unit_submit"}'; }
inflight() { metric 'ptool_nodejs_active_requests'; }
stale_k6() { ps aux | grep -E '[k]6 run' | wc -l; }
cg_snapshot() {
  local stat max
  stat=$(awk -F' ' '{printf "%s=%s;", $1, $2}' /sys/fs/cgroup/cpu.stat 2>/dev/null)
  max=$(tr ' ' '/' < /sys/fs/cgroup/cpu.max 2>/dev/null)
  printf 'cpu_max=%s;%s' "$max" "$stat"
}
drain_ok() {
  local a q st inf
  a=$(unit_active); q=$(unit_queue); st=$(stale_k6); inf=$(inflight)
  [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && [ "$st" = "0" ] && [ "${inf:-x}" -le 1 ]
}
wait_drain_tail() {
  local start i a q
  start=$(date +%s)
  for i in $(seq 1 90); do
    a=$(unit_active); q=$(unit_queue)
    [ "${a:-x}" = "0" ] && [ "${q:-x}" = "0" ] && { echo $(( $(date +%s) - start )); return 0; }
    sleep 1
  done
  echo $(( $(date +%s) - start )); return 1
}

run_one() {
  local rate="$1" run="$2" tag="$3"
  local rec="$SUMDIR/$tag.json"
  local band="$BANDS/e4s-form-${GROUP}-${rate}s-r${run}.json"
  local t0 t1 pre drain_s
  t0=$(date +%s)
  if [ ! -f "$band" ]; then echo "MISSING $band"; return 1; fi
  pre=clean
  if ! drain_ok; then
    pre=retried
    for i in 1 2 3 4 5; do sleep 3; drain_ok && { pre=clean-after-retry; break; }; done
    if ! drain_ok; then
      echo "{\"tag\":\"$tag\",\"error\":\"pre-run drain FAILED: unit_active=$(unit_active) unit_queue=$(unit_queue) inflight=$(inflight)\"}" > "$rec"
      echo "ABORT $tag drain"; return 1
    fi
  fi
  local f0 d0 ip0 cg0
  f0=$(db_fsub_count); d0=$(db_form_done); ip0=$(db_form_ip); cg0=$(cg_snapshot)
  local summary_path="$SUMDIR/$tag-k6.json" k6log="$SUMDIR/$tag-k6.log"
  rm -f "$summary_path"
  local pre_vus=320 max_vus=560
  [ $(( rate * 2 )) -lt 320 ] && pre_vus=$(( rate * 2 ))
  [ $(( rate * 4 )) -lt 560 ] && max_vus=$(( rate * 4 ))
  [ "$max_vus" -lt "$pre_vus" ] && max_vus=$pre_vus
  ( cd "$K6DIR" && k6 run \
    -e BASE_URL="$BASE" -e FIXTURE_FILE="$band" -e GROUP="$GROUP" \
    -e AUTH_TOKEN="$AUTH_TOKEN" -e CSRF_TOKEN="$CSRF_TOKEN" \
    -e RATE="$rate" -e DURATION=30s \
    -e WARMUP_SECONDS=6 -e WARMUP_RATE=5 \
    -e PRE_ALLOCATED_VUS="$pre_vus" -e MAX_VUS="$max_vus" \
    -e GATE_E_SUMMARY_PATH="$summary_path" \
    k6-e3-cognitive-knee.js ) > "$k6log" 2>&1
  local k6rc=$?
  local f1 d1 ip1 cg1
  f1=$(db_fsub_count); d1=$(db_form_done); ip1=$(db_form_ip); cg1=$(cg_snapshot)
  drain_s=$(wait_drain_tail); local drain_rc=$?
  t1=$(date +%s)
  local k6json='{}' k6err='""'
  if [ "$k6rc" -eq 0 ] && [ -f "$summary_path" ]; then k6json=$(cat "$summary_path")
  else k6err=$(tail -5 "$k6log" 2>/dev/null | tr '\n' ' ' | cut -c1-400 | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"); fi
  cat > "$rec" <<EOF
{
  "tag": "$tag","stage":"4R","class":"$CLASS","group":"$GROUP","rate":$rate,"run":"r$run",
  "configured_duration_s":30,"warmup_s":6,"band":"$band",
  "pre_run_drain":"$pre","drain_clean":$([ $drain_rc -eq 0 ] && echo true || echo false),
  "drain_tail_s":$drain_s,"full_runtime_s":$(( t1 - t0 )),"k6_exit":$k6rc,"k6_error":$k6err,
  "db_form_answers_delta":$(( f1 - f0 )),"db_assessment_completions_delta":$(( d1 - d0 )),
  "db_inprogress_after":$ip1,"db_form_answers_before":$f0,"db_form_answers_after":$f1,
  "db_completed_before":$d0,"db_completed_after":$d1,
  "cgroup_before":"$cg0","cgroup_after":"$cg1","k6":$k6json
}
EOF
  echo "DONE $tag rate=$rate run=r$run k6rc=$k6rc answers_delta=$(( f1 - f0 )) done_delta=$(( d1 - d0 )) drain=${drain_s}s"
}

echo "Stage 4R Form $CLASS boundary: group=$GROUP rates=${RATES[*]} runs r1..r3"
for rate in "${RATES[@]}"; do
  for run in 1 2 3; do
    run_one "$rate" "$run" "e4s-${CLASS}-${rate}s-r${run}"
  done
done
echo "Stage 4R $CLASS complete -> $SUMDIR"