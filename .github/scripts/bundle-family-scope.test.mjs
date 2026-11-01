import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleChecks,bundleFamilyScope,catalogDiscoveryScope} from './catalog-discovery-scope.mjs';
const change=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
test('bundle family uses bounded application recipe and rejects unrelated runtime, schema and dependency changes',()=>{
 const entries=bundleChecks.sources.map(change);
 assert(bundleFamilyScope(entries));assert(catalogDiscoveryScope(entries));
 for(const file of ['server-version/backend/prisma/schema.prisma','server-version/backend/package-lock.json','server-version/backend/src/modules/cognitive/tasks/nback/engine.ts','.github/workflows/unreviewed.yml'])assert(!bundleFamilyScope([...entries,change(file)]));
 assert(!bundleFamilyScope([{...entries[0],status:'D',newMode:'000000'}]));assert(!bundleFamilyScope([]));
});
