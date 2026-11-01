#!/usr/bin/env bash
set -euo pipefail
ci_task_repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ci_task_repo/server-version"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
case "${FRONTEND_ONLY:-}:${BACKEND_ONLY:-false}" in
  true:false) images=(frontend) ;;
  false:true) images=(backend worker) ;;
  false:false) images=(backend worker frontend) ;;
  *) echo 'Select frontend-only, backend-only or full images' >&2; exit 1 ;;
esac
ci_task_bake_dir="$(mktemp -d "$RUNNER_TEMP/eduk12-ci-images.XXXXXX")"
ci_task_catalog_recipe=''
cleanup() {
  rm -rf -- "$ci_task_bake_dir"
  if [ -n "$ci_task_catalog_recipe" ]; then rm -f -- "$ci_task_catalog_recipe"; fi
}
trap cleanup EXIT
# Compose may include unused target definitions; resolve the explicitly selected
# Bake targets before applying strict image/tag/runtime-stage validation.
# Force a SINGLE local Docker exporter rather than using --load: recent Buildx
# preserves an existing image exporter and APPENDS docker when --load is set.
# Keep the resolved-plan guard fail-closed: no image/registry pushes or extra outputs.
docker compose --env-file /dev/null build --print "${images[@]}" > "$ci_task_bake_dir/compose.json"
docker buildx bake --file "$ci_task_bake_dir/compose.json" --print "${images[@]}" > "$ci_task_bake_dir/plan.json"
if [ "${CATALOG_DISCOVERY:-false}" = true ]; then
  ci_task_catalog_recipe="$(mktemp "$ci_task_repo/server-version/backend/.catalog-ci.Dockerfile.XXXXXX")"
  export CATALOG_BACKEND_DOCKERFILE="$ci_task_catalog_recipe"
  node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const {catalogCompileRecipe}=await import(pathToFileURL(process.env.GITHUB_WORKSPACE+'/.github/scripts/ci-image-plan.mjs'));
writeFileSync(process.env.CATALOG_BACKEND_DOCKERFILE,catalogCompileRecipe(readFileSync('backend/Dockerfile','utf8')));
JS
fi
node "$ci_task_repo/.github/scripts/ci-image-plan.mjs" "$ci_task_bake_dir/plan.json"
docker buildx bake --file "$ci_task_bake_dir/plan.json" --pull '--set=*.output=type=docker' --print "${images[@]}" > "$ci_task_bake_dir/resolved.json"
node "$ci_task_repo/.github/scripts/ci-image-plan.mjs" "$ci_task_bake_dir/resolved.json" --verify
docker buildx bake --file "$ci_task_bake_dir/plan.json" --pull '--set=*.output=type=docker' "${images[@]}"
