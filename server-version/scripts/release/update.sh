#!/usr/bin/env bash
# Small dispatcher over the operator's existing Compose entry. Default: plan only.
set -euo pipefail
apply=false; entry=; live=; next=; rollback=; ops=; roles=; grace=60; data_action=preflight
usage() {
  cat <<'EOF'
update.sh [--apply] frontend|service|content|full --entry COMPOSE_ENTRY
  [--live-profile JSON --next-profile JSON --rollback-profile UNUSED_PATH]
  [--ops-overlay FILE] [--role-sync EXECUTABLE] [--stop-timeout SECONDS]
  [--data-action reuse|preflight|backfill] # full only; default: preflight
  -- [application service names | existing npm script and its arguments]
Default is a non-mutating command plan. Images must already be qualified/preloaded.
frontend: frontend only; service: explicit application services, no migration.
content: existing content CLI only, no service restart or automatic publication.
full: explicit business services; one migration then the existing role coordinator.
EOF
}
die() { printf '%s\n' "$*" >&2; exit 2; }
mode=
while (($#)); do
  case "$1" in
    frontend|service|content|full) [[ -z "$mode" ]] || die 'One mode required'; mode=$1; shift ;;
    --apply) apply=true; shift ;;
    --entry|--live-profile|--next-profile|--rollback-profile|--ops-overlay|--role-sync|--stop-timeout|--data-action)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --entry) entry=$2;; --live-profile) live=$2;; --next-profile) next=$2;;
        --rollback-profile) rollback=$2;; --ops-overlay) ops=$2;; --role-sync) roles=$2;; --stop-timeout) grace=$2;; --data-action) data_action=$2;;
      esac; shift 2 ;;
    --) shift; break;;
    -h|--help) usage; exit 0;;
    *) die "Unknown argument: $1";;
  esac
done
[[ -n "$mode" && -n "$entry" && "$entry" = /* ]] || { usage >&2; exit 2; }
[[ "$grace" =~ ^[1-9][0-9]*$ ]] || die 'Positive stop timeout required'
case "$data_action" in reuse|preflight|backfill) ;; *) die 'Invalid full data action';; esac
run() { printf '+ '; printf '%q ' "$@"; printf '\n'; if "$apply"; then "$@"; fi; }
if [[ "$mode" = content ]]; then
  [[ -n "$ops" && $# -gt 0 ]] || die 'Content requires --ops-overlay and an existing npm script after --'
  case "$1" in
    bundle:package:preview|bundle:package:install|bundle:package:publish|bundle:package:hold|bundle:package:retire|scale:instrument:install|scale:instrument:publish|cognitive:configs:publish) ;;
    *) die 'Use an existing supported content CLI; arbitrary JS/shell upload is not supported';;
  esac
  script=$1; shift
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate npm run "$script" -- "$@"
  exit 0
fi
if [[ "$mode" = frontend ]]; then
  (($# == 0)) || die 'frontend takes no service list'; services=(frontend)
else
  (($# > 0)) || die 'Explicit application service names required after --'; services=("$@")
fi
for service in "${services[@]}"; do
  [[ "$service" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]*$ ]] || die 'Invalid service name'
  case "$service" in postgres|redis|migrate|seed) die 'DB/Redis/ops are not business restart targets';; esac
  [[ "$mode" != service || "$service" != frontend ]] || die 'Use frontend mode for frontend'
done
[[ -n "$live" && -n "$next" && -n "$rollback" ]] || die 'Image updates require live, next and rollback profile paths'
[[ "$live" = /* && "$next" = /* && "$rollback" = /* && "$live" != "$next" && "$live" != "$rollback" && "$next" != "$rollback" ]] || die 'Use three distinct absolute profile paths'
[[ ! -e "$rollback" ]] || die 'Rollback profile already exists; choose an unused path'
[[ "$mode" != full || ( -n "$ops" && -n "$roles" && "$roles" = /* ) ]] || die 'full requires --ops-overlay and the prepared --role-sync executable'
# Actual site profiles are JSON Compose documents. Never resolve or print .env.
# Small updates may change only selected image fields, preserving topology/config.
images=$(python3 - "$mode" "$live" "$next" "${services[@]}" <<'PY'
import copy,json,re,sys
mode,live,next,*names=sys.argv[1:]
old=json.load(open(live));new=json.load(open(next));a=copy.deepcopy(old);b=copy.deepcopy(new)
for name in names:
    before=a['services'][name];after=b['services'][name]
    image=after['image']
    if not re.fullmatch(r'(?:[^\s@]+@)?sha256:[0-9a-f]{64}',image):
        raise SystemExit('Use a fixed preloaded image ID or registry digest: '+name)
    print(image)
    before.pop('image',None);after.pop('image',None)
if mode!='full' and a!=b:
    raise SystemExit('Small update changes more than selected images; prepare a full release')
PY
)
if "$apply"; then
  [[ -x "$entry" && ( "$mode" != full || -x "$roles" ) ]] || die 'Prepared entry/role coordinator must be executable'
  while IFS= read -r image; do docker image inspect --format '{{.Id}}' "$image" >/dev/null; done <<< "$images"
fi
# The profile belongs to the existing entry; no daemon/global configuration changes.
export EDUK12_RELEASE_OVERLAY="$live"
if [[ "$mode" != frontend ]]; then run "$entry" stop -t "$grace" "${services[@]}"; fi
if [[ "$mode" = full ]]; then
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/pr24-migration-preflight.mjs
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate ./node_modules/.bin/prisma migrate deploy
  run "$roles"
  if [[ "$data_action" = backfill ]]; then
    run "$entry" -f "$ops" --profile ops run --rm --no-deps checkin-token-backfill
  fi
  if [[ "$data_action" = reuse ]]; then
    printf '%s\n' 'Reuse applicable recorded token/asset data evidence; do not rerun conversion.'
    run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/runtime-role-contract.mjs post-migrate
  else
    # Existing preflight also verifies runtime role/schema; do not repeat it above.
    run "$entry" -f "$ops" --profile ops run --rm --no-deps release-preflight
  fi
fi
printf '+ preserve live profile at %q; atomically activate %q\n' "$rollback" "$next"
if "$apply"; then
  cp -p "$live" "$rollback"
  tmp=$(mktemp "${live}.next.XXXXXX")
  trap 'rm -f "$tmp"' EXIT
  cp -p "$live" "$tmp"; cat "$next" > "$tmp"; mv -f "$tmp" "$live"
  trap - EXIT
fi
# Explicitly use the same persistent profile as subsequent ordinary restarts.
run env "EDUK12_RELEASE_OVERLAY=$live" "$entry" up -d --no-build --no-deps "${services[@]}"
printf '%s\n' 'Run only readiness and one affected short flow; full/DB rollback is operator-directed.'
