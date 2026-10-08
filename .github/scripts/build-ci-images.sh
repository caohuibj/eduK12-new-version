#!/usr/bin/env bash
set -euo pipefail
ci_task_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ci_task_repo/server-version"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
case "${FRONTEND_ONLY:-}" in
  true) images=(frontend) ;;
  false) images=(backend worker frontend) ;;
  *) echo 'FRONTEND_ONLY must be true or false' >&2; exit 1 ;;
esac
ci_task_bake_dir="$(mktemp -d "$RUNNER_TEMP/eduk12-ci-images.XXXXXX")"
trap 'rm -rf -- "$ci_task_bake_dir"' EXIT
# Compose may include unused target definitions; resolve the explicitly selected
# Bake targets before applying strict image/tag/runtime-stage validation.
# Force a SINGLE local Docker exporter rather than using --load: recent Buildx
# preserves an existing image exporter and APPENDS docker when --load is set.
# Keep the resolved-plan guard fail-closed: no image/registry pushes or extra outputs.
docker compose --env-file /dev/null build --print "${images[@]}" > "$ci_task_bake_dir/compose.json"
docker buildx bake --file "$ci_task_bake_dir/compose.json" --print "${images[@]}" > "$ci_task_bake_dir/plan.json"
node "$ci_task_repo/.github/scripts/ci-image-plan.mjs" "$ci_task_bake_dir/plan.json"
docker buildx bake --file "$ci_task_bake_dir/plan.json" --pull '--set=*.output=type=docker' --print "${images[@]}" > "$ci_task_bake_dir/resolved.json"
node "$ci_task_repo/.github/scripts/ci-image-plan.mjs" "$ci_task_bake_dir/resolved.json" --verify
docker buildx bake --file "$ci_task_bake_dir/plan.json" --pull '--set=*.output=type=docker' "${images[@]}"
