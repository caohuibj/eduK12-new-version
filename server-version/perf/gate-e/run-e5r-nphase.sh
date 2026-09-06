#!/usr/bin/env bash
# 5R-C Aggregate N phase characterization at NON-saturating low load.
# Samples N=5 (e5s2 fresh), N=25 (e5s), N=100 (e5s) ready-parent groups via the
# per-VU-iterations distinct runner (k6-e5-finalize MODE=distinct), then scrapes
# /metrics phase histogram DELTAS (count + sum) around each run to attribute
# finalize cost across aggregate.{parent_probe_db,header_db,definition_db,
# payload_db,decrypt_parse,validate,report,encrypt,persist,cas_loser}.
#
#   BASE_URL=... K6DIR FIXDIR SUMDIR AUTH_TOKEN CSRF_TOKEN
# Usage: run-e5r-nphase.sh
set -uo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
SUMDIR="${SUMDIR:-$FIXDIR/e5r/phases}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] && [ -f "$FIXDIR/e4s2/auth.env" ]; then
  AUTH_TOKEN=$(grep -E '^PERF_AUTH_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
  CSRF_TOKEN=$(grep -E '^PERF_CSRF_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
fi
mkdir -p "$SUMDIR"
ROUTE='/api/questionnaires/assessments/:id/complete'
# Real metric phases carry an "aggregate." prefix; these are the names we display
# and their corresponding metric phase labels.
declare -A PHMAP=(
  [parent_probe_db]=aggregate.parent_probe_db
  [header_db]=aggregate.header_db
  [definition_db]=aggregate.definition_db
  [payload_db]=aggregate.payload_db
  [decrypt_parse]=aggregate.decrypt_parse
  [validate]=aggregate.validate
  [report]=aggregate.report
  [analysis]=aggregate.analysis
  [encrypt]=aggregate.encrypt
  [persist]=aggregate.persist
  [cas_loser]=aggregate.cas_loser
)
PHASES=(parent_probe_db header_db definition_db payload_db decrypt_parse validate report analysis encrypt persist cas_loser)

scrape() {
  # output lines: "<display_phase> <count> <sum_ms_total>"
  local mfile=$(mktemp)
  curl -s -m4 "$BASE/metrics" > "$mfile"
  for ph in "${PHASES[@]}"; do
    local label="${PHMAP[$ph]}"
    local esc_route="${ROUTE//\//\\\/}"
    local cnt sum
    cnt=$(grep -E "^ptool_assessment_phase_duration_seconds_count\{phase=\"${label}\",route=\"${esc_route}\"\}" "$mfile" | awk '{print $2}' | head -1)
    sum=$(grep -E "^ptool_assessment_phase_duration_seconds_sum\{phase=\"${label}\",route=\"${esc_route}\"\}" "$mfile" | awk '{print $2}' | head -1)
    printf '%s %s %s\n' "$ph" "${cnt:-0}" "${sum:-0}"
  done
  rm -f "$mfile"
}

delta() {
  # $1=pre_file $2=post_file $3=phase -> "count_delta sum_delta avg_ms"
  local pre post
  pre=$(grep -E "^$3 " "$1" | awk '{print $2}')
  local pre_sum
  pre_sum=$(grep -E "^$3 " "$1" | awk '{print $3}')
  post=$(grep -E "^$3 " "$2" | awk '{print $2}')
  local post_sum
  post_sum=$(grep -E "^$3 " "$2" | awk '{print $3}')
  local dc ds avg
  read dc ds avg <<< "$(python3 -c "
pre=$pre; pre_sum=$pre_sum; post=$post; post_sum=$post_sum
dc=post-pre
ds=post_sum-pre_sum
avg=round(ds/dc,2) if dc>0 else 0
print(f'{dc} {ds} {avg}')
")"
  printf '%s %s %s' "$dc" "$ds" "$avg"
}

run_nphase() {
  local n="$1" pool="$2" group="$3" vus="$4" tag="$5" offset="$6"
  local rec="$SUMDIR/$tag.json" pre f prefile postfile
  prefile=$(mktemp); postfile=$(mktemp)
  scrape > "$prefile"; pre=$?
  local summary="$SUMDIR/$tag-k6.json" k6log="$SUMDIR/$tag-k6.log"
  rm -f "$summary"
  ( cd "$K6DIR" && k6 run -e BASE_URL="$BASE" -e FIXTURE_FILE="$pool" -e GROUP="$group" \
    -e AUTH_TOKEN="$AUTH_TOKEN" -e CSRF_TOKEN="$CSRF_TOKEN" \
    -e MODE=distinct -e PEAK="$vus" -e FIXTURE_OFFSET="$offset" \
    -e GATE_E_SUMMARY_PATH="$summary" k6-e5-finalize.js ) > "$k6log" 2>&1
  local rc=$?
  scrape > "$postfile"
  local k6json='{}' k6err='""'
  if [ "$rc" -eq 0 ] && [ -f "$summary" ]; then k6json=$(cat "$summary")
  else k6err=$(tail -3 "$k6log" | tr '\n' ' ' | cut -c1-300 | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"); fi
  local body
  body="{\"tag\":\"$tag\",\"stage\":\"5R\",\"phase\":\"C\",\"n\":$n,\"group\":\"$group\",\"vus\":$vus,\"k6_exit\":$rc,\"k6_error\":$k6err,\"k6\":$k6json,\"phase_delta\":{"
  local first=1 sep=''
  for phname in "${PHASES[@]}"; do
    local d
    d=$(delta "$prefile" "$postfile" "$phname")
    local dcount dsum davg
    dcount=$(echo "$d" | awk '{print $1}'); dsum=$(echo "$d" | awk '{print $2}'); davg=$(echo "$d" | awk '{print $3}')
    body+="$sep\"$phname\":{\"count\":$dcount,\"sum_ms\":$dsum,\"avg_ms\":$davg}"
    sep=','
  done
  body+="}}"
  echo "$body" > "$rec"
  rm -f "$prefile" "$postfile"
  echo "DONE $tag n=$n group=$group vus=$vus rc=$rc"
}

echo "Stage 5R-C aggregate N-phase low-load sampling"
run_nphase 5   "$FIXDIR/e5s/ready-parent-fixtures.json"  parentN5  30 "e5r-nphase-n5"   76
run_nphase 25  "$FIXDIR/e5s/ready-parent-fixtures.json"  parentN25 20 "e5r-nphase-n25"  20
run_nphase 100 "$FIXDIR/e5s/ready-parent-fixtures.json"  parentN100 10 "e5r-nphase-n100" 10
echo "Stage 5R-C done -> $SUMDIR"