#!/usr/bin/env bash
# 5R-D Same-parent duplicate pre-CAS work probe at concurrency 2/10/50.
# All VUs stampede one FRESH N5 ready-parent (k6-e5-finalize MODE=stampede).
# Keeps the DB durable-completion check (scoped e5rp-5 COMPLETED delta = authority
# for exactly-once) AND counts how many times the pre-CAS aggregate phases
# (decrypt/validate/report/encrypt/persist attempt) actually executed via
# /metrics phase count deltas. report/encrypt/persist count vs DB delta=1 reveals
# duplicate pre-CAS compute; cas_loser count = how many admitted builds lost CAS.
#
# Real metric labels carry an "aggregate." prefix (e.g. aggregate.decrypt_parse).
#
#   BASE_URL K6DIR FIXDIR SUMDIR AUTH_TOKEN CSRF_TOKEN
# Usage: run-e5r-dup.sh
set -uo pipefail
BASE="${BASE_URL:-http://127.0.0.1:3000}"
K6DIR="${K6DIR:-/data/user/work/eduK12-new-version/server-version/perf/gate-e}"
FIXDIR="${FIXDIR:-/workspace/eduk12-pr49-cloud-results}"
FIXFILE="${FIXFILE:-$FIXDIR/e5s2/ready-parent-fixtures.json}"
SUMDIR="${SUMDIR:-$FIXDIR/e5r/dup}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-}"
if [ -z "$AUTH_TOKEN" ] && [ -f "$FIXDIR/e4s2/auth.env" ]; then
  AUTH_TOKEN=$(grep -E '^PERF_AUTH_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
  CSRF_TOKEN=$(grep -E '^PERF_CSRF_TOKEN=' "$FIXDIR/e4s2/auth.env" | cut -d= -f2-)
fi
PGURL="${PGURL:-}"
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
db_completed() { "${PSQL[@]}" -c "SELECT count(*) FROM questionnaire_assessments qa JOIN questionnaires q ON qa.questionnaire_id=q.id WHERE q.code LIKE 'E5-Q-e5rp-5-%' AND qa.status='COMPLETED';"; }
mkdir -p "$SUMDIR"

ROUTE='/api/questionnaires/assessments/:id/complete'
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
  local mfile=$(mktemp)
  curl -s -m4 "$BASE/metrics" > "$mfile"
  for ph in "${PHASES[@]}"; do
    local label="${PHMAP[$ph]}"
    local cnt
    cnt=$(grep -E "^ptool_assessment_phase_duration_seconds_count\{phase=\"${label}\",route=\"${ROUTE//\//\\\/}\"\}" "$mfile" | awk '{print $2}' | head -1)
    printf '%s %s\n' "$ph" "${cnt:-0}"
  done
  rm -f "$mfile"
}
phase_pre() { awk -v p="$1" '{if($1==p)print $2}' "$2"; }

# Choose FRESH parents (not yet COMPLETED) from the pool. We slice the pool from
# a high search offset (past everything 5R-B consumed) and return the first
# fresh index whose parent has NOT completed yet. SEARCH_START advances per run
# so each concurrency level uses a distinct parent.
SEARCH_START="${SEARCH_START:-12000}"
pick_fresh() {
  # $1 = start index, $2 = fixture file -> prints "idx parentId" for first fresh parent
  python3 - "$1" "$2" <<'PYEOF'
import json, subprocess, os, sys
start=int(sys.argv[1]); fix=sys.argv[2]
pool=json.load(open(fix))
g=pool["parentN5"]; n=len(g)
cand=[(i,g[i]['parentId']) for i in range(start,n)]
with open('/tmp/dup_cand_ids.txt','w') as f:
    f.write('\n'.join(pid for _,pid in cand))
sql='''
DROP TABLE IF EXISTS _dup_cand;
CREATE TEMP TABLE _dup_cand(id text);
\\copy _dup_cand FROM '/tmp/dup_cand_ids.txt'
SELECT c.id FROM _dup_cand c
WHERE NOT EXISTS (
  SELECT 1 FROM questionnaire_assessments qa
  JOIN questionnaires q ON qa.questionnaire_id=q.id
  WHERE q.code LIKE 'E5-Q-e5rp-5-%' AND qa.status='COMPLETED' AND qa.id::text=c.id
);
'''
r=subprocess.run(['psql','-v','ON_ERROR_STOP=1','-h',os.environ['PGHOST'],'-p',os.environ['PGPORT'],'-U',os.environ['PGUSER'],'-d',os.environ['PGDATABASE'],'-t','-A'],input=sql,capture_output=True,text=True)
if r.returncode!=0:
    sys.stderr.write(r.stderr); sys.exit(2)
fresh=set(r.stdout.split())
for i,pid in cand:
    if pid in fresh:
        print(i,pid); break
PYEOF
}

IDX=0
run_dup() {
  local conc="$1" tag="$2"
  local rec="$SUMDIR/$tag.json" prefile postfile
  prefile=$(mktemp); postfile=$(mktemp)
  scrape > "$prefile"
  local c0
  c0=$(db_completed)
  local parentid idx
  read idx parentid <<< "$(pick_fresh "$SEARCH_START" "$FIXFILE")"
  if [ -z "$parentid" ]; then
    echo "{\"tag\":\"$tag\",\"error\":\"no fresh parent found from search offset $SEARCH_START\"}" > "$rec"
    echo "ABORT $tag: no fresh parent"; return 1
  fi
  SEARCH_START=$(( idx + 1 ))
  local summary="$SUMDIR/$tag-k6.json" k6log="$SUMDIR/$tag-k6.log"
  rm -f "$summary"
  ( cd "$K6DIR" && BASE_URL="$BASE" FIXTURE_FILE="$FIXFILE" GROUP=parentN5 \
    AUTH_TOKEN="$AUTH_TOKEN" CSRF_TOKEN="$CSRF_TOKEN" \
    MODE=stampede PEAK="$conc" FIXTURE_INDEX="$idx" \
    GATE_E_SUMMARY_PATH="$summary" k6 run k6-e5-finalize.js ) > "$k6log" 2>&1
  local rc=$?
  scrape > "$postfile"
  local c1
  c1=$(db_completed)
  local k6json='{}' k6err='""'
  if [ "$rc" -eq 0 ] && [ -f "$summary" ]; then k6json=$(cat "$summary")
  else k6err=$(tail -3 "$k6log" | tr '\n' ' ' | cut -c1-300 | python3 -c "import sys,json;print(json.dumps(sys.stdin.read()))"); fi
  local pstatus
  pstatus=$("${PSQL[@]}" -c "SELECT status FROM questionnaire_assessments WHERE id='$parentid';")
  local body d di
  body="{\"tag\":\"$tag\",\"stage\":\"5R\",\"phase\":\"D\",\"concurrency\":$conc,\"fixture_index\":$idx,\"fresh_parent\":\"$parentid\",\"parent_final_status\":\"$pstatus\",\"db_completed_delta\":$(( c1 - c0 )),\"k6_exit\":$rc,\"k6_error\":$k6err,\"k6\":$k6json,\"pre_cas_phase_counts\":{"
  local first=1 sep=''
  for phname in "${PHASES[@]}"; do
    d=$(( $(phase_pre "$phname" "$postfile") - $(phase_pre "$phname" "$prefile") ))
    body+="$sep\"$phname\":$d"
    sep=','
  done
  body+="}}"
  echo "$body" > "$rec"
  rm -f "$prefile" "$postfile"
  echo "DONE $tag conc=$conc idx=$idx parent=$parentid status=$pstatus db_delta=$(( c1 - c0 )) rc=$rc"
  IDX=$(( IDX + 1 ))
}

echo "Stage 5R-D same-parent duplicate-work probe (conc 2/10/50), pool=$FIXFILE"
run_dup 2  "e5r-dup-conc2"
run_dup 10 "e5r-dup-conc10"
run_dup 50 "e5r-dup-conc50"
echo "Stage 5R-D done -> $SUMDIR"