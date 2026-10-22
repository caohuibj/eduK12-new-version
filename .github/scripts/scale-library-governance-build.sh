#!/usr/bin/env bash
# One compiler per changed component; archive bytes before downstream checks.
set -euo pipefail
component="${1:?backend or frontend}"
case "$component" in backend|frontend) ;; *) exit 2;; esac
root="${GITHUB_WORKSPACE:?}"; context="$root/server-version/$component"
evidence="$root/scale-library-governance-evidence/$component"
archives="$root/scale-library-governance-images/$component"
mkdir -p "$evidence" "$archives"
builder="scale-library-governance-$component-builder:${GITHUB_SHA:?}"
runtime="scale-library-governance-$component-runtime:$GITHUB_SHA"
recipe="$context/Dockerfile"
if [ "$component" = backend ]; then
  # Frozen scope must independently bind all unchanged generator inputs.
  recipe="$evidence/Dockerfile"
  SOURCE="$context/Dockerfile" TARGET="$recipe" python3 -B - <<'PY'
import os
from pathlib import Path
s=Path(os.environ['SOURCE']).read_text()
assert s.count('RUN npm run build\n')==1
Path(os.environ['TARGET']).write_text(s.replace('RUN npm run build\n','RUN npx tsc\n'))
PY
fi
for target in build runtime; do
  tag="$builder"; [ "$target" != runtime ] || tag="$runtime"
  docker build --target "$target" --build-arg NPM_REGISTRY=https://registry.npmjs.org --build-arg VITE_COGNITIVE_MODULE_ENABLED=true --label "org.opencontainers.image.revision=$GITHUB_SHA" -f "$recipe" -t "$tag" "$context"
done
docker image inspect "$builder" "$runtime" > "$evidence/images.json"
docker save "$builder" "$runtime" | gzip -1 > "$archives/images.tar.gz"
(cd "$archives"; sha256sum images.tar.gz) > "$evidence/images.sha256"
# Exact runtime compiler output, not an image identity substituted for bytes.
comparison="$(mktemp -d)"; container=''
cleanup(){ if [ -n "$container" ]; then docker rm -f "$container" >/dev/null; fi; rm -rf "$comparison"; }
trap cleanup EXIT
for kind in builder runtime; do
  image="$builder"; location=/app/dist
  if [ "$kind" = runtime ]; then image="$runtime"; [ "$component" != frontend ] || location=/usr/share/nginx/html; fi
  container="$(docker create "$image")"; mkdir -p "$comparison/$kind"
  docker cp "$container:$location/." "$comparison/$kind/"
  docker rm "$container" >/dev/null; container=''
done
if [ "$component" = backend ]; then
  diff -qr "$comparison/builder" "$comparison/runtime"
else
  COMPARISON="$comparison" EVIDENCE="$evidence" python3 -B - <<'PYCOMPARE'
import hashlib,json,os
from pathlib import Path
root=Path(os.environ['COMPARISON'])
files=lambda directory:{str(p.relative_to(directory)):hashlib.sha256(p.read_bytes()).hexdigest() for p in directory.rglob('*') if p.is_file()}
built=files(root/'builder');runtime=files(root/'runtime');assert built
assert all(runtime.get(name)==digest for name,digest in built.items()),'Runtime differs from compiled dist'
extra=set(runtime)-set(built);assert extra <= {'50x.html'},extra
(Path(os.environ['EVIDENCE'])/'runtime-base-extras.json').write_text(json.dumps({name:runtime[name] for name in sorted(extra)}))
PYCOMPARE
fi
(cd "$comparison/builder"; find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$evidence/runtime-files.sha256"
printf '%s\n' "$GITHUB_SHA" > "$evidence/source-head.txt"
printf '%s\n' "${GITHUB_RUN_ID:?}" > "$evidence/source-run.txt"
