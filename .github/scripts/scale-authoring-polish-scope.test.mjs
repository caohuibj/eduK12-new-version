import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {authoringPolishChecks as recipe,authoringPolishScope,catalogDiscoveryScope} from './catalog-discovery-scope.mjs';
import {requiredChecks} from './merge-gate.mjs';
const change=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
test('authoring polish selects only enumerated authoring files and existing executors',()=>{
 const entries=recipe.sources.map(change);
 assert(authoringPolishScope(entries));assert(catalogDiscoveryScope(entries));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/modules/scale/scale-scoring.ts','server-version/backend/src/modules/scale/scale-final-submit.service.ts'])assert(!authoringPolishScope([...entries,change(file)]));
 assert(!authoringPolishScope([]));assert(!authoringPolishScope([{...entries[0],status:'D',newMode:'000000'}]));
 assert.deepEqual(requiredChecks({scope:{outputs:{scenario:'catalog-discovery'}}},false),['scope','catalog-discovery','frontend','docker','codeql']);
});
test('recipe supplies actual draft and publish boundaries without database or platform workloads',()=>{
 for(const file of [...recipe.sources,...recipe.tests])assert(existsSync(file),file);
 assert(recipe.backendChecks.unitFiles.includes('src/__tests__/scale/scale-draft-completeness.test.ts'));
 assert(recipe.backendChecks.unitFiles.includes('src/__tests__/scale/scale-draft-write-guard.test.ts'));
 assert.deepEqual(recipe.backendChecks.postgresFiles,[]);
 const ci=readFileSync('.github/workflows/ci.yml','utf8'),frontend=readFileSync('.github/workflows/ci-frontend.yml','utf8');
 assert(ci.includes('AUTHORING_POLISH: ${{ needs.scope.outputs.authoring_polish }}'));
 assert(frontend.includes('AUTHORING_POLISH: ${{ inputs.authoring_polish }}'));
 assert(readFileSync('.github/scripts/content-scope.mjs','utf8').includes('authoring_polish:catalogDiscovery&&authoringPolishScope(entries)'));
 assert(ci.includes("'scale-authoring-polish-checks.json'"));assert(frontend.includes("'scale-authoring-polish-checks.json'"));
});
