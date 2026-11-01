import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
export const catalogChecks=JSON.parse(readFileSync(new URL('../config/catalog-discovery-checks.json',import.meta.url)));
const files=new Set([...catalogChecks.sources,...catalogChecks.tests]);
const controls=new Set(['.github/scripts/fetch-ci-base.mjs','.github/scripts/catalog-discovery-scope.test.mjs','.github/workflows/ci-frontend.yml','.github/workflows/ci-images.yml','.github/scripts/build-ci-images.sh','.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci.yml','.github/config/catalog-discovery-checks.json','.github/scripts/catalog-discovery-scope.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs']);
// Query selection only: no commit/PR identities, new persisted catalog or permission exception.
export function catalogSurfaceScope(entries){
 return entries.some(e=>catalogChecks.sources.includes(e.file))&&entries.every(e=>
  (files.has(e.file)||controls.has(e.file))&&((e.newMode==='100644'
  &&(e.status==='M'&&e.oldMode==='100644'||e.status==='A'&&e.oldMode==='000000'))
  ||e.file==='.github/scripts/build-ci-images.sh'&&e.status==='M'&&e.oldMode==='100755'&&e.newMode==='100755'));
}

// A second bounded recipe uses the existing application qualification jobs.
// File surfaces only: no PR/commit eligibility list or evidence credentials.
export const bundleChecks=JSON.parse(readFileSync(new URL('../config/bundle-family-checks.json',import.meta.url)));
export function bundleFamilyScope(entries){
 const allowed=new Set([...bundleChecks.sources,...bundleChecks.tests,...bundleChecks.controls]);
 return entries.some(e=>e.file==='server-version/backend/src/modules/bundle-product/child-cross-method.ts')
  && entries.every(e=>(allowed.has(e.file)||/^docs\/(?:bundles\/|bundle-declarative-onboarding\/cognitive-adolescent-20261101\.md$|cognitive-control-child-(?:draft-20261101\.md|validation-20261101\.json)$|child-shared-display-integration\.patch$)/.test(e.file))
   &&e.newMode==='100644'&&(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644'));
}
export const bundleRuntimeChecks=JSON.parse(readFileSync(new URL('../config/bundle-runtime-checks.json',import.meta.url)));
export function bundleRuntimeScope(entries){
 const allowed=new Set([...bundleRuntimeChecks.sources,...bundleRuntimeChecks.tests,...bundleRuntimeChecks.documents,...bundleRuntimeChecks.controls]);
 return entries.some(e=>bundleRuntimeChecks.sources.includes(e.file))
  &&new Set(entries.map(e=>e.file)).size===entries.length
  &&entries.every(e=>allowed.has(e.file)&&e.newMode==='100644'&&(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644'));
}
export function bundleRuntimeSelectionMatches(entries,outputs){
 return (outputs.bundle_runtime||'false')===String(bundleRuntimeScope(entries))
  &&!(outputs.bundle_runtime==='true'&&outputs.bundle_family==='true');
}
export function catalogDiscoveryScope(entries){return catalogSurfaceScope(entries)||bundleFamilyScope(entries)||bundleRuntimeScope(entries);}

// The event can retain the PR's creation-time base while refs/pull/N/merge
// already uses current main. Select that parent only for this bounded diff.
export function catalogDiffBase(eventBase,head,entriesFor,env=process.env,read=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()){
 if(env.CI_EVENT!=='pull_request'||!env.CI_SOURCE_HEAD)return eventBase;
 const parents=read('cat-file','-p',head).split('\n').filter(line=>line.startsWith('parent ')).map(line=>line.slice(7));
 if(parents.length!==2||parents[1]!==env.CI_SOURCE_HEAD)return eventBase;
 return catalogDiscoveryScope(entriesFor(parents[0]))?parents[0]:eventBase;
}
