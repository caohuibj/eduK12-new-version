#!/usr/bin/env bash
set -euo pipefail
component="$1"
case "$component" in backend|frontend) ;; *) exit 2;; esac
root="$GITHUB_WORKSPACE"
context="$root/server-version/$component"
evidence="$root/scale-authoring-evidence"
mkdir -p "$evidence"
builder="scale-authoring-$component-builder:$GITHUB_SHA"
runtime="scale-authoring-$component-runtime:$GITHUB_SHA"
# Existing Dockerfiles keep locked installs, Prisma generation, full backend
# compile and frontend Vite compile. The second target consumes the SAME cache.
docker build --target build --build-arg NPM_REGISTRY=https://registry.npmjs.org --build-arg VITE_COGNITIVE_MODULE_ENABLED=true --label "org.opencontainers.image.revision=$GITHUB_SHA" -t "$builder" "$context"
id="$(docker create "$builder")"
trap 'docker rm -f "$id" >/dev/null 2>&1 || true' EXIT
docker cp "$id:/app/node_modules" "$context/node_modules"
docker cp "$id:/app/dist" "$context/dist"
docker rm "$id" >/dev/null
trap - EXIT
# No source modification or second compiler invocation between these targets.
docker build --target runtime --build-arg NPM_REGISTRY=https://registry.npmjs.org --build-arg VITE_COGNITIVE_MODULE_ENABLED=true --label "org.opencontainers.image.revision=$GITHUB_SHA" -t "$runtime" "$context"
# Verify runtime assembly contains the exact compiler output, not another build.
verified="$(mktemp -d)"
id="$(docker create "$runtime")"
trap 'docker rm -f "$id" >/dev/null 2>&1 || true; rm -rf "$verified"' EXIT
if [ "$component" = backend ]; then output=/app/dist; else output=/usr/share/nginx/html; fi
docker cp "$id:$output/." "$verified/"
COMPONENT="$component" BUILT="$context/dist" ASSEMBLED="$verified" EVIDENCE="$evidence" python3 - <<'PYVERIFY'
import hashlib,json,os
from pathlib import Path
source=Path(os.environ['BUILT']); target=Path(os.environ['ASSEMBLED'])
files={}
for f in sorted(source.rglob('*')):
 if f.is_file():
  key=str(f.relative_to(source)); digest=hashlib.sha256(f.read_bytes()).hexdigest()
  assert (target/key).is_file() and hashlib.sha256((target/key).read_bytes()).hexdigest()==digest,key
  files[key]=digest
assert files
(Path(os.environ['EVIDENCE'])/(os.environ['COMPONENT']+'-runtime-output.json')).write_text(json.dumps({'head':os.environ['GITHUB_SHA'],'sameCompilerOutput':True,'files':files},indent=2))
PYVERIFY
docker rm "$id" >/dev/null
rm -rf "$verified"
trap - EXIT
docker image inspect "$builder" "$runtime" --format '{{json .}}' > "$evidence/$component-images.jsonl"
tar -C "$context" -czf "$evidence/$component-build.tgz" node_modules dist
(cd "$evidence"; sha256sum "$component-build.tgz" > "$component-build.sha256")
printf '%s\n' "$GITHUB_SHA" > "$evidence/$component-head.txt"
printf '%s\n' "$GITHUB_RUN_ID" > "$evidence/$component-run.txt"

# The backend consumer keeps native dependencies on the SAME Debian image.
if [ "$component" = backend ]; then
  docker save "$builder" "$runtime" | gzip -1 > "$evidence/backend-images.tgz"
  (cd "$evidence"; sha256sum backend-images.tgz > backend-images.sha256)
fi
