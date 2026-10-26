import {test} from 'node:test';import assert from 'node:assert/strict';
import {binding,verifyCandidate,refuseUnplannedPR356,officialCandidate} from './pr356-scope.mjs';
const head='a'.repeat(40),base=binding.base;
const entries=()=>[...Object.entries(binding.source).map(([file,v])=>({file,status:v.status,oldMode:v.oldMode,newMode:v.newMode})),...binding.controls.map(file=>({file,status:binding.controlBefore[file]?'M':'A',oldMode:binding.controlBefore[file]?'100644':'000000',newMode:'100644'}))];
function read(_,ref){if(ref.startsWith(base+':')){const p=ref.slice(41);return binding.source[p]?.before||binding.controlBefore[p]}const p=ref.slice(41);return binding.source[p]?.after||binding.protectedInputs[p]||binding.components[p.replace('server-version/','')]}
test('complete immutable application candidate is qualification only',()=>{const p=verifyCandidate(entries(),base,head,read);assert.equal(p.mergeEligible,false);assert.equal(p.qualificationOnly,true)});
test('missing, duplicate, unknown, renamed, executable, base and product drift fail closed',()=>{
 const x=entries();assert.throws(()=>verifyCandidate(x.slice(1),base,head,read));assert.throws(()=>verifyCandidate([...x.slice(1),x[1]],base,head,read));
 for(const change of [{file:'unexpected.ts'},{newMode:'100755'},{status:'R100'}])assert.throws(()=>verifyCandidate(x.map((v,i)=>i? v:{...v,...change}),base,head,read));
 assert.throws(()=>verifyCandidate(x,'b'.repeat(40),head,read));assert.throws(()=>verifyCandidate(x,base,head,()=> 'bad'));
});
test('this branch cannot silently use legacy/full/probe routes',()=>{for(const k of ['CI_HEAD_REF','GITHUB_HEAD_REF','GITHUB_REF_NAME'])assert.throws(()=>refuseUnplannedPR356({[k]:binding.branch}));assert.doesNotThrow(()=>refuseUnplannedPR356({GITHUB_REF_NAME:'main'}))});
test('local or unrelated official identity cannot be impersonated',async()=>{await assert.rejects(officialCandidate({}));await assert.rejects(officialCandidate({GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:binding.repository,GITHUB_EVENT_NAME:'pull_request'}))});
