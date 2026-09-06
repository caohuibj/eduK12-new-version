#!/usr/bin/env bash
# Stage 4 capacity-curve runner (NORMAL nback-100 / LARGE cpt-180).
#
# Scans offered rate 25..175 step 15 (single 30s steady run per point) and
# emits Stage 2R corrected accounting per point. Same pre-run drain proof and
# drain-tail polling as the Stage 3R boundary runner; VU budgets are capped at
# high rates to stay inside the sandbox cgroup memory ceiling.
#
# Reusable env (defaults point at the perf review workspace):
#   BASE_URL, K6DIR, FIXDIR, SUMMARY_DIR, PGURL, E3_DB_PREFIX
# Usage: run-e3s4-curve.sh <normal|large>
set -uo pipefail

CLASS="${1:?usage: run-e3s4-curve.sh <normal|large>}"
BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
SUMDIR="${SUMDIR:-$FIXDIR/e3s4}"
PGURL="${PGURL:-}"

mkdir -p "$SUMDIR"

if [ "$CLASS" = normal ]; then
  GROUP=cognitiveNormal
  PREFIX="${E3_DB_PREFIX:-e3s4-nback-}"
else
  GROUP=cognitiveLarge
  PREFIX="${E3_DB_PREFIX:-e3s4-cpt-}"
fi
RATES=(25 40 55 70 85 100 115 130 145 160 175)

# --- DB env -----------------------------------------------------------------
if [ -z "$PGURL" ]; then
  ENVFILE=/data/user/work/eduK12-new-version/server-version/backend/.env
  PGURL=$(grep -E '^DATABASE_URL=' "$ENVFILE" | head -1 | cut -d= -f2-)
fi
PGHOST=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^@]+@([^:/]+).*#\1#')
PGPORT=$(printf '%s' "$PGURL" | sed -E 's#.*:([0-9]+)/.*#\1#')
PGUSER=$(printf '%s' "$PGURL" | sed -E 's#postgresql://([^:]+):.*#\1#')
PGPASSWORD=$(printf '%s' "$PGURL" | sed -E 's#postgresql://[^:]+:([^@]+)@.*#\1#')
PGDATABASE=$(printf '%s' "$PGURL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE
PSQL=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -t -A)

db_raw_count() { "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_raw_submissions rs JOIN cognitive_sessions s ON s.id=rs.session_id WHERE s.participant_key LIKE '${PREFIX}%';"; }
db_done_count() { "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_sessions WHERE participant_key LIKE '${PREFIX}%' AND status='COMPLETED';"; }
db_inprogress_count() { "${PSQL[@]}" -c "SELECT count(*) FROM cognitive_sessions WHERE participant_key LIKE '${PREFIX}%' AND status!='COMPLETED';"; }

# --- helpers ----------------------------------------------------------------
metric() { curl -s -m 3 "$BASE/metrics" | grep "^$1 " | awk '{print $2}' | head -1; }
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
  echo $(( $(date +%s) - start ))
  return 1
}

run_one() {
  local rate="$1" tag="$2"
  local rec="$SUMDIR/$tag.json"
  local t0 t1 pre drain_s
  t0=$(date +%s)

  # 1. pre-run drain proof
  pre=clean
  if ! drain_ok; then
    pre=retried
    local i
    for i in 1 2 3 4 5; do sleep 3; drain_ok && { pre=clean-after-retry; break; }; done
    if ! drain_ok; then
      echo "{\"tag\":\"$tag\",\"error\":\"pre-run drain check FAILED: unit_active=$(unit_active) unit_queue=$(unit_queue) stale_k6=$(stale_k6) inflight=$(inflight)\"}" > "$rec"
      echo "ABORT $tag: drain check failed"
      return 1
    fi
  fi

  local raw0 done0 ip0 cg0
  raw0=$(db_raw_count); done0=$(db_done_count); ip0=$(db_inprogress_count); cg0=$(cg_snapshot)

  local summary_path="$SUMDIR/$tag-k6.json"
  local k6log="$SUMDIR/$tag-k6.log"
  # A stale summary must never be read into this record if k6 fails.
  rm -f "$summary_path"
  # VU budget: prealloc min(rate*2, 320), max min(rate*4, 560). High rates need
  # ~rate x avg-iteration-time VUs to sustain the offered load; the cap bounds
  # k6 RSS against the 4GiB sandbox cgroup (backend + postgres + fixtures).
  local pre_vus=320 max_vus=560
  [ $(( rate * 2 )) -lt 320 ] && pre_vus=$(( rate * 2 ))
  [ $(( rate * 4 )) -lt 560 ] && max_vus=$(( rate * 4 ))
  [ "$max_vus" -lt "$pre_vus" ] && max_vus=$pre_vus
  ( cd "$K6DIR" && k6 run \
    -e BASE_URL="$BASE" \
    -e FIXTURE_FILE="$FIXDIR/e3s4-cognitive-class-fixtures-${rate}s-r1.json" \
    -e GROUP="$GROUP" \
    -e RATE="$rate" \
    -e DURATION=30s \
    -e WARMUP_SECONDS=10 \
    -e WARMUP_RATE=5 \
    -e PRE_ALLOCATED_VUS="$pre_vus" \
    -e MAX_VUS="$max_vus" \
    -e GATE_E_SUMMARY_PATH="$summary_path" \
    k6-e3-cognitive-knee.js ) > "$k6log" 2>&1
  local k6rc=$?

  local raw1 done1 ip1 cg1
  raw1=$(db_raw_count); done1=$(db_done_count); ip1=$(db_inprogress_count); cg1=$(cg_snapshot)

  drain_s=$(wait_drain_tail)
  local drain_rc=$?
  t1=$(date +%s)

  local k6json='{}'
  local k6err=''
  if [ "$k6rc" -eq 0 ] && [ -f "$summary_path" ]; then
    k6json=$(cat "$summary_path")
  else
    k6err=$(tail -5 "$k6log" 2>/dev/null | tr '\n' ' ' | cut -c1-500)
  fi

  cat > "$rec" <<EOF
{
  "tag": "$tag",
  "stage": "4",
  "class": "$CLASS",
  "group": "$GROUP",
  "rate": $rate,
  "configured_duration_s": 30,
  "warmup_s": 10,
  "pre_run_drain": "$pre",
  "drain_clean": $([ $drain_rc -eq 0 ] && echo true || echo false),
  "drain_tail_s": $drain_s,
  "full_runtime_s": $(( t1 - t0 )),
  "k6_exit": $k6rc,
  "k6_error": "$k6err",
  "db_raw_submissions_delta": $(( raw1 - raw0 )),
  "db_session_completions_delta": $(( done1 - done0 )),
  "db_inprogress_after": $ip1,
  "db_raw_before": $raw0,
  "db_raw_after": $raw1,
  "db_done_before": $done0,
  "db_done_after": $done1,
  "cgroup_before": "$cg0",
  "cgroup_after": "$cg1",
  "k6": $k6json
}
EOF
  echo "DONE $tag rate=$rate k6rc=$k6rc fresh_delta=$(( raw1 - raw0 )) done_delta=$(( done1 - done0 )) drain=${drain_s}s"
}

# --- main -------------------------------------------------------------------
echo "Stage 4 $CLASS capacity curve: group=$GROUP prefix=$PREFIX rates=${RATES[*]}"
for rate in "${RATES[@]}"; do
  band="e3s4-cognitive-class-fixtures-${rate}s-r1.json"
  [ -f "$FIXDIR/$band" ] || { echo "MISSING band file: $band"; exit 2; }
  run_one "$rate" "e3s4-${CLASS}-${rate}s-r1"
done
echo "Stage 4 $CLASS complete -> $SUMDIR"
