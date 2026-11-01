import {readFileSync} from 'node:fs';
export const catalogChecks=JSON.parse(readFileSync(new URL('../config/catalog-discovery-checks.json',import.meta.url)));
const files=new Set([...catalogChecks.sources,...catalogChecks.tests]);
const controls=new Set(['.github/scripts/catalog-discovery-scope.test.mjs','.github/workflows/ci-frontend.yml','.github/workflows/ci-images.yml','.github/scripts/build-ci-images.sh','.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci.yml','.github/config/catalog-discovery-checks.json','.github/scripts/catalog-discovery-scope.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs']);
// Query selection only: no commit/PR identities, new persisted catalog or permission exception.
export function catalogDiscoveryScope(entries){
 return entries.some(e=>catalogChecks.sources.includes(e.file))&&entries.every(e=>
  (files.has(e.file)||controls.has(e.file))&&e.newMode==='100644'
  &&(e.status==='M'&&e.oldMode==='100644'||e.status==='A'&&e.oldMode==='000000'));
}
