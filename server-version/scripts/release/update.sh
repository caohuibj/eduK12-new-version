#!/usr/bin/env bash
# Small dispatcher over the operator's existing Compose entry. Default: plan only.
set -euo pipefail
apply=false; entry=; live=; next=; rollback=; ops=; roles=; grace=60; data_action=preflight; git_sync=; git_main=
usage() {
  cat <<'EOF'
update.sh [--apply] frontend|service|content|full --entry COMPOSE_ENTRY
  [--live-profile JSON --next-profile JSON --rollback-profile UNUSED_PATH]
  [--ops-overlay FILE] [--role-sync EXECUTABLE] [--stop-timeout SECONDS]
  [--data-action reuse|preflight|backfill] # full only; default: preflight
  [--content-main-sha COMMIT | --scale-main-sha COMMIT] # content mode or post-cutover service/full step
  -- [application service names | existing npm script and its arguments]
Default is a non-mutating command plan. Images must already be qualified/preloaded.
frontend: frontend only; service: explicit application services, no migration.
content: synchronize committed main releases without restarting services.
--scale-main-sha: use the existing Scale-only command for older ops images.
full: explicit business services; one migration then the existing role coordinator.
EOF
}
die() { printf '%s\n' "$*" >&2; exit 2; }
mode=
while (($#)); do
  case "$1" in
    frontend|service|content|full) [[ -z "$mode" ]] || die 'One mode required'; mode=$1; shift ;;
    --apply) apply=true; shift ;;
    --entry|--live-profile|--next-profile|--rollback-profile|--ops-overlay|--role-sync|--stop-timeout|--data-action|--content-main-sha|--scale-main-sha)
      (($# >= 2)) || die "Missing value for $1"
      case "$1" in
        --entry) entry=$2;; --live-profile) live=$2;; --next-profile) next=$2;;
        --rollback-profile) rollback=$2;; --ops-overlay) ops=$2;; --role-sync) roles=$2;; --stop-timeout) grace=$2;; --data-action) data_action=$2;;
        --content-main-sha|--scale-main-sha)
          [[ -z "$git_sync" ]] || die 'Specify one Git release input flag'
          git_sync=${1#--}; git_sync=${git_sync%-main-sha}; git_main=$2;;
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
git_repo=
prepare_git_sync() {
  [[ "$git_main" =~ ^[0-9a-f]{40}$ && -n "$ops" && "$mode" != frontend ]] ||
    die 'Content synchronization requires an exact main SHA and the ops profile'
  git_repo="$(git --no-replace-objects -C "$(dirname -- "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
  local remote
  remote="$(git -C "$git_repo" remote get-url origin)"
  case "$remote" in
    https://github.com/caohuibj/eduK12-new-version.git|https://github.com/caohuibj/eduK12-new-version|git@github.com:caohuibj/eduK12-new-version.git) ;;
    *) die 'Content synchronization expects the official GitHub repository';;
  esac
  [[ "$(git --no-replace-objects -C "$git_repo" rev-parse --verify 'refs/remotes/origin/main^{commit}')" = "$git_main" ]] ||
    die 'Content synchronization expects the approved, fetched origin/main commit'
}
verify_git_ops() {
  local image
  image="$("$entry" -f "$ops" --profile ops config --format json |
    python3 -c 'import json,re,sys
from urllib.parse import urlsplit
service=json.load(sys.stdin)["services"]["migrate"]
environment=service.get("environment",{})
def value(name):
    result=environment.get(name)
    if not isinstance(result,str) or not result.strip():
        raise SystemExit("Content release ops profile must provide "+name)
    return result
value("DATABASE_URL")
value("SYSTEM_GIT_RELEASE_ACTOR_ID")
if environment.get("NODE_ENV")=="production":
    origin=urlsplit(value("CORS_ORIGIN"))
    if origin.scheme not in ("http","https") or not origin.hostname or origin.username or origin.password or origin.path not in ("","/") or origin.query or origin.fragment:
        raise SystemExit("Content release ops profile needs an exact HTTP(S) CORS_ORIGIN")
    for name in ("JWT_SECRET","ASSET_SIGNING_SECRET"):
        if len(value(name))<32:
            raise SystemExit("Content release ops profile needs a valid "+name)
    if not re.fullmatch(r"[a-fA-F0-9]{64}",value("DATA_ENCRYPTION_KEY")):
        raise SystemExit("Content release ops profile needs a valid DATA_ENCRYPTION_KEY")
    if environment.get("COGNITIVE_MODULE_ENABLED")=="true" and not re.fullmatch(r"[a-fA-F0-9]{64}",value("DATA_PSEUDONYM_KEY")):
        raise SystemExit("Content release ops profile needs a valid DATA_PSEUDONYM_KEY")
print(service.get("image",""))')"
  [[ "$image" =~ ^([^[:space:]@]+@)?sha256:[0-9a-f]{64}$ ]] || die 'Use a qualified immutable ops image in the overlay'
  docker image inspect --format '{{.Id}}' "$image" >/dev/null
}
sync_git_releases() (
  local path scale_path command mount frontends container
  command="$git_sync:sync-releases"
  mount="/$git_sync-release-input"
  if ! "$apply"; then
    printf '+ export %s declarations from Git main %s, confirm running frontend artwork, and run %s in the ops container\n' "$git_sync" "$git_main" "$command"
    return 0
  fi
  umask 022
  path="$(mktemp -d)"
  trap 'rm -r -- "$path"' EXIT
  python3 "$(dirname -- "${BASH_SOURCE[0]}")/export-content-releases.py" "$git_repo" "$git_main" "$path" "$git_sync"
  chmod 0755 "$path"
  scale_path="$path"
  if [[ "$git_sync" = content ]]; then scale_path="$path/scale"; fi
  frontends="$("$entry" ps --status running -q frontend)"
  while IFS= read -r container; do
    [[ -n "$container" ]] || continue
    [[ "$container" =~ ^[a-f0-9]{12,64}$ ]] || die 'Unexpected running frontend container identity'
    if ! docker cp "$container:/usr/local/share/eduk12/scale-artwork-inventory.json" "$scale_path/.artwork/live-$container.json" >/dev/null 2>&1; then
      # A missing image inventory matters only when the selected release uses artwork.
      printf '{"schemaVersion":1,"files":{}}\n' > "$scale_path/.artwork/live-$container.json"
    fi
    chmod 0644 "$scale_path/.artwork/live-$container.json"
  done <<< "$frontends"
  run "$entry" -f "$ops" --profile ops run --rm --no-deps --pull never \
    -v "$path:$mount:ro" migrate npm run "$command" -- "$mount" "$git_main"
)
if [[ -n "$git_sync" ]]; then prepare_git_sync; fi
if [[ "$mode" = content ]]; then
  if [[ -n "$git_sync" ]]; then
    (($# == 0)) || die 'A committed content release selects its own synchronizer'
    if "$apply"; then verify_git_ops; fi
    sync_git_releases
    exit 0
  fi
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
if [[ -n "$git_sync" ]] && "$apply"; then verify_git_ops; fi
if [[ "$mode" = full ]]; then
  # Early read-only index-contract check, before any business service stops:
  # a broken index state fails fast here so the release never takes downtime
  # for a migration that cannot succeed. The formal preflight below still
  # re-runs after the stop, because the database may change in between.
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/assessment-run-index-contract.mjs pre
  # Early resource-contract check on the ACTUAL next profile, before any
  # business service stops: the preflight validates the rendered Compose
  # document about to be activated (FINAL gates vs Prisma pool, worker stop
  # grace vs shutdown budget, CPU/memory/pool budgets, HTTPS/CORS). The
  # next profile is a rendered `docker compose config --format json`
  # document, the same shape CI validates. Non-full modes change images
  # only (enforced by the profile diff above), so their resource contract
  # is unchanged from the live profile and needs no re-check here. The
  # preflight script lives outside the backend build context, so it is
  # mounted read-only into the migrate container alongside the next
  # profile. Like the index check, a failure aborts before the stop.
  preflight_script="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)/prelaunch-resource-preflight.mjs"
  run "$entry" -f "$ops" --profile ops run --rm --no-deps \
    -v "$preflight_script:/tmp/prelaunch-resource-preflight.mjs:ro" \
    -v "$next:/tmp/next-profile.json:ro" \
    migrate node /tmp/prelaunch-resource-preflight.mjs --compose-json /tmp/next-profile.json
fi
if [[ "$mode" != frontend ]]; then run "$entry" stop -t "$grace" "${services[@]}"; fi
if [[ "$mode" = full ]]; then
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/pr24-migration-preflight.mjs
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/assessment-run-index-contract.mjs pre
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/migrate-deploy-bounded.mjs
  run "$entry" -f "$ops" --profile ops run --rm --no-deps migrate node scripts/assessment-run-index-contract.mjs post
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
if [[ -n "$git_sync" ]]; then sync_git_releases; fi
printf '%s\n' 'Run only readiness and one affected short flow; full/DB rollback is operator-directed.'
