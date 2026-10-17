import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {admitsSharedAssetStorage,sharedAssetStorageRequired} from './shared-asset-storage-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const bindings=JSON.parse(readFileSync(new URL('./shared-asset-storage-bindings.json',import.meta.url)));
const entries=Object.entries(bindings.files).map(([file,b])=>({file,status:b.before===null?'A':'M',oldMode:b.before===null?'000000':'100644',newMode:'100644'}));
const read=(ref,file)=>bindings.files[file]?.[ref==='base'?'before':'after'];
test('exact full source boundary accepts only its bound inputs',()=>{
 assert.equal(admitsSharedAssetStorage(entries,read),true);
 assert.equal(admitsSharedAssetStorage(entries.slice(1),read),false);
 assert.equal(admitsSharedAssetStorage(entries,()=> 'f'.repeat(40)),false);
 for(const change of [{file:'server-version/frontend/src/App.tsx',status:'M',oldMode:'100644',newMode:'100644'}, {...entries[0],newMode:'120000'}, {...entries[0],status:'D'}])assert.equal(admitsSharedAssetStorage([...entries,change],read),false);
});
test('ready gate requires scope, actual candidate and SAST; skipped is not success',()=>{
 const p={schema:1,route:'shared-asset-storage',base:'a'.repeat(40),head:'b'.repeat(40),changed:['backend'],tests:['contract'],required:sharedAssetStorageRequired};
 const outputs={application_route:p.route,scenario:p.route,shared_asset_storage_plan:JSON.stringify(p),codeql:'true',frontend_build:'false',ui_required:'false',media_selection:'[]',media_groups:'[]'};
 for(const k of ['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'])outputs[k]='false';
 const needs={scope:{result:'success',outputs},'shared-asset-storage':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','shared-asset-storage','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 needs['shared-asset-storage'].result='skipped';assert.ok(failedChecks(needs,false).includes('shared-asset-storage'));
 assert.ok(failedChecks(needs,true).includes('scope'));
});
