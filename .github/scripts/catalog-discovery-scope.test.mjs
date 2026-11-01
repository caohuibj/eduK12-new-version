import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogDiscoveryScope,catalogChecks} from './catalog-discovery-scope.mjs';
import {acceptanceFor} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const change=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
test('catalog query surfaces remain bounded across entrypoints and reject schema, runtime and dependency changes',()=>{
 const entries=catalogChecks.sources.map(change);
 assert(catalogDiscoveryScope(entries));
 assert(catalogDiscoveryScope([...entries,{...change('.github/scripts/build-ci-images.sh'),oldMode:'100755',newMode:'100755'}]));
 assert(!catalogDiscoveryScope([...entries,{...change('.github/scripts/build-ci-images.sh'),oldMode:'000000',newMode:'100755',status:'A'}]));
 assert(!catalogDiscoveryScope([]));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/src/modules/survey/runtime.service.ts','server-version/backend/package-lock.json','server-version/frontend/src/modules/cognitive/CognitiveRunner.tsx'])assert(!catalogDiscoveryScope([...entries,change(file)]));
 assert(!catalogDiscoveryScope([{...entries[0],status:'D',newMode:'000000'}]));
});
test('catalog qualification keeps query frontend image and SAST failures blocking without unrelated jobs',()=>{
 const scope={scenario:'catalog-discovery',application_route:'legacy',runner_profile:'hosted',codeql:'true',frontend_affected:'true',media_selection:'[]',media_groups:'[]',...Object.fromEntries(['maintenance','frontend_test','frontend_build','ui_required','visual_hosted','content','presentation','frontend','documentation',...Object.keys(acceptanceFor([]))].map(k=>[k,'false']))};
 assert.deepEqual(requiredChecks({scope:{outputs:scope}},false),['scope','catalog-discovery','frontend','docker','codeql']);
 assert.deepEqual(requiredChecks({scope:{outputs:scope}},true),['scope']);
 const needs=Object.fromEntries(requiredChecks({scope:{outputs:scope}},false).map(name=>[name,{result:'success'}]));needs.scope.outputs=scope;
 assert.deepEqual(failedChecks(needs,false),[]);
 for(const name of ['catalog-discovery','frontend','docker','codeql']){needs[name].result='skipped';assert(failedChecks(needs,false).includes(name));needs[name].result='success';}
});
test('temporary compilation recipe never edits the production Dockerfile or starts full lifecycle fixtures',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const job=ci.split('\n  catalog-discovery:\n')[1].split('\n  merge-gate:\n')[0];
 assert.match(job,/postgres:16\.15-bookworm/);assert.match(job,/LIBRARY_DISCOVERY_TEST_DATABASE_URL:/);
 assert.doesNotMatch(job,/migrate|seed|redis:|npm run build/);
 const images=readFileSync(new URL('../workflows/ci-images.yml',import.meta.url),'utf8');
 assert.match(images,/CATALOG_DISCOVERY: \$\{\{ inputs.catalog_discovery \}\}/);
});
