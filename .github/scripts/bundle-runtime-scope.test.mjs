import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {bundleRuntimeChecks as checks,bundleRuntimeScope,bundleRuntimeSelectionMatches,catalogDiscoveryScope} from './catalog-discovery-scope.mjs';
import {acceptanceFor} from './content-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const change=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const entries=[...checks.sources,...checks.tests,...checks.documents,...checks.controls].map(change);
const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
const job=name=>ci.split('\n  '+name+':\n')[1]?.split(/\n(?=  \S)/)[0];
const outputs={scenario:'catalog-discovery',application_route:'legacy',bundle_runtime:'true',bundle_family:'false',runner_profile:'hosted',run_performance_tests:'false',training_functional_only:'false',admin_permissions_functional_only:'false',codeql:'true',frontend_affected:'true',media_selection:'[]',media_groups:'[]',...Object.fromEntries(['maintenance','frontend_test','frontend_build','ui_required','visual_hosted','content','presentation','frontend','documentation',...Object.keys(acceptanceFor([]))].map(k=>[k,'false']))};

test('runtime focus accepts only enumerated regular runtime, tests, documents and route controls',()=>{
 assert(bundleRuntimeScope(entries));assert(catalogDiscoveryScope(entries));
 assert(!bundleRuntimeScope([]));assert(!bundleRuntimeScope(checks.controls.map(change)));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/modules/scale/instruments/private/1.0.0/instrument.ts','server-version/backend/src/modules/assessment-bundle/generated/packages.json','server-version/backend/src/modules/assessment-bundle/packages/new/1.0.0/manifest.json','server-version/backend/src/modules/auth/session.ts','server-version/frontend/src/api/client.ts','docs/unknown.json'])assert(!bundleRuntimeScope([...entries,change(file)]),file);
 for(const extra of [{status:'D',newMode:'000000'},{newMode:'120000'},{newMode:'100755'},{status:'R'}])assert(!bundleRuntimeScope([{...entries[0],...extra},...entries.slice(1)]));
 assert(!bundleRuntimeScope([...entries,entries[0]]));
 assert(bundleRuntimeScope([{...entries[0],status:'A',oldMode:'000000'},...entries.slice(1)]));
});

test('recomputed runtime flag cannot silently select catalog or historical family checks',()=>{
 assert(bundleRuntimeSelectionMatches(entries,outputs));
 for(const bundle_runtime of [undefined,'false','wat'])assert(!bundleRuntimeSelectionMatches(entries,{...outputs,bundle_runtime}));
 assert(!bundleRuntimeSelectionMatches(entries,{...outputs,bundle_family:'true'}));
 assert(!bundleRuntimeSelectionMatches([change('unknown')],outputs));
 assert.match(readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8'),/bundleRuntimeSelectionMatches\(entries,needs.scope.outputs\)/);
});

test('Ready requires actual bounded backend frontend image and SAST success; Draft grants only scope',()=>{
 const names=['scope','catalog-discovery','frontend','docker','codeql'];
 const needs=Object.fromEntries(names.map(name=>[name,{result:'success'}]));needs.scope.outputs=outputs;
 assert.deepEqual(requiredChecks(needs,false),names);assert.deepEqual(failedChecks(needs,false),[]);
 assert.deepEqual(requiredChecks(needs,true),['scope']);
 for(const name of names)for(const result of ['skipped','failure','cancelled',undefined])assert(failedChecks({...needs,[name]:{...needs[name],result}},false).includes(name),name+' '+result);
});

test('existing jobs select this recipe without starting platform maintenance mini media or recovery jobs',()=>{
 const needs={scope:{result:'success',outputs}},github={event_name:'pull_request',ref_name:'test',event:{pull_request:{number:999,draft:false,head:{ref:'test'}}}},vars={CI_FORCE_FULL:'false'};
 const selected=[];
 for(const name of ['catalog-discovery','frontend','docker','codeql','backend','backend-regression','pr-light-backend','pr-light-frontend','backend-browser-build','frontend-build','browser','maintenance','miniprogram','accept-media','accept-ui','accept-visual','accept-perf','accept-ops']){
  const text=job(name);assert(text,name);const expression=text.match(/^    if: (?:\$\{\{ )?(.+?)(?: \}\})?$/m)?.[1];assert(expression,name);
  const enabled=Function('needs','github','vars','inputs','cancelled','always','fromJSON','contains','return Boolean('+expression+')')(needs,github,vars,{},()=>false,()=>true,JSON.parse,(a,b)=>a.includes(b));
  if(enabled)selected.push(name);
 }
 assert.deepEqual(selected,['catalog-discovery','frontend','docker','codeql']);
 assert.match(job('scope'),/catalogDiscoveryScope\(entries\)\|\|docs\|\|toolingOnly/);
 const backend=job('catalog-discovery');assert.match(backend,/BUNDLE_RUNTIME:/);assert.match(backend,/BUNDLE_PRODUCT_TEST_DATABASE_URL:/);assert.match(backend,/prisma db push --skip-generate/);assert.doesNotMatch(backend,/migrate deploy|db:seed|redis:|npm run build/);
 assert.match(backend,/BUNDLE_RUNTIME==='true'\?'bundle-runtime-checks.json'/);assert.match(backend,/assert-release-test-report.mjs/);
 const frontend=readFileSync(new URL('../workflows/ci-frontend.yml',import.meta.url),'utf8');assert.match(frontend,/if: inputs.bundle_runtime/);assert.match(frontend,/frontendChecks:files/);assert.match(frontend,/assert-release-test-report.mjs/);
});

test('runtime recipe contains real bounded test files and leaves release content checks intact',()=>{
 const root=new URL('../../',import.meta.url);
 for(const file of [...checks.backendChecks.unitFiles,...checks.backendChecks.postgresFiles])assert(existsSync(new URL('server-version/backend/'+file,root)),file);
 for(const file of checks.frontendChecks)assert(existsSync(new URL('server-version/frontend/'+file,root)),file);
 assert(checks.backendChecks.unitFiles.some(f=>f.endsWith('/derived-core.test.ts')));assert(checks.backendChecks.unitFiles.some(f=>f.endsWith('/native-age-admission.test.ts')));
 assert(checks.backendChecks.postgresFiles.includes('src/__tests__/bundle-product/product.postgres.integration.test.ts'));
 assert.equal(checks.sources.some(f=>f.includes('/packages/')||f.includes('/instruments/')||f.includes('/prisma/')),false);
 assert.match(readFileSync(new URL('../../server-version/backend/scripts/bundle-content-check.ts',import.meta.url),'utf8'),/if \(errors.length\) throw new Error/);
});
