#!/usr/bin/env bash
set -euo pipefail
root="$GITHUB_WORKSPACE"
evidence="$root/scale-authoring-evidence"
component="$1"
case "$component" in backend|frontend) ;; *) exit 2;; esac
cd "$root/server-version/$component"
# Fresh locked environment, unlike the earlier adjacent local dependency trees.
# Exact changed contract files only. PG lifecycle is a separately selected case.
mapfile -t tests < <(node -e 'const p=require(process.argv[1]);for(const t of p.tests[process.argv[2]]) console.log(t)' "$root/.github/scripts/scale-authoring-bindings.json" "$component")
[ "${#tests[@]}" -gt 0 ]
node node_modules/vitest/vitest.mjs run --maxWorkers=2 "${tests[@]}" --reporter=default --reporter=json --outputFile="$evidence/$component-tests.json"
node "$root/.github/scripts/scale-authoring-scope.mjs" report "$evidence/$component-tests.json"
COMPONENT="$component" EVIDENCE="$evidence" node - <<'JS'
const assert=require('node:assert/strict');const path=require('node:path');
const p=require(process.env.GITHUB_WORKSPACE+'/.github/scripts/scale-authoring-bindings.json');const r=require(process.env.EVIDENCE+'/'+process.env.COMPONENT+'-tests.json');
const actual=r.testResults.map(x=>path.resolve(x.name));const expected=p.tests[process.env.COMPONENT].map(x=>path.resolve(x));
assert.deepEqual([...actual].sort(),[...expected].sort(),'Every selected test file must be collected exactly once');
for(const file of r.testResults){assert(file.assertionResults.length>0,'Empty selected test file');assert(file.assertionResults.every(x=>x.status==='passed'),'Selected assertion not passed')}
JS
npm audit --audit-level=high --json > "$evidence/$component-audit.json"
if [ "$component" = frontend ]; then
  node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit
  mapfile -t lint < <(node -e 'const p=require(process.argv[1]);for(const f of p.frontendLint) console.log(f)' "$root/.github/scripts/scale-authoring-bindings.json")
  node node_modules/eslint/bin/eslint.js "${lint[@]}"
fi
