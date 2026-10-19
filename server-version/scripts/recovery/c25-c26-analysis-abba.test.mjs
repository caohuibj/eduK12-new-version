import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {ABBA,PLAN,analysisManifestOracle,readAcceptedAnalysisAuthority,runAnalysisAbba} from './c25-c26-analysis-abba.mjs'
import {C26_ANALYSIS_IDS as I,analysisBindingHash as hash} from './c25-c26-analysis-scope.mjs'
const clone=structuredClone,H='a'.repeat(64)
function expected(){
 const selector={schemaVersion:1,courseId:I.course,mode:'PAIRWISE',waves:[0,1].map(i=>({waveKey:i?'wave_b':'wave_a',taskId:I.tasks[i],publication:I.publications[i],configDigest:null,variantKey:null,metrics:[{itemId:I.items[i],metricKey:'total'}]}))}
 const sources=selector.waves.map((w,i)=>({waveKey:w.waveKey,taskId:w.taskId,attemptId:I.parents[i],attemptEpoch:1,sourceHash:H,sourceHashes:{result:H},status:'COMPLETED',taskSatisfaction:i?'SATISFIED':null}))
 const quality=sources.map(s=>({attemptId:s.attemptId,attemptEpoch:1,sourceHash:H,status:s.status,taskSatisfaction:s.taskSatisfaction,verdict:'INCLUDE',reason:null,revision:0}))
 return {selector,sources,quality,definitionHash:hash(selector),sourceHash:hash(sources),qualityHash:hash(quality),measurement:{instrumentKey:'scale',scoreKey:'total',scoringDigest:H,responseSignature:H,respondentType:'SELF',unit:'score',version:'2.0.0'}}
}
const closed=identity=>({passed:true,closeObserved:true,groupQuiescent:true,exit:{code:0,signal:null},identity,closedMonotonicNs:'12345'})
function fixture(change=()=>{}){
 const e=expected(),oracle=analysisManifestOracle(e),events=[],open=[],counts=[],stopped=[],proofs=[];let active=0,maxActive=0,remaining=600000
 const io={
  async openBlock({block,arm}){assert.equal(active,0);open.push(arm);const api={block,arm,identity:{pid:block+100,startTicks:String(block)}};counts.push({warmup:0,serial:0,pair:0});return api},
  async request(api,selector,label){assert.deepEqual(selector,e.selector);assert.equal(stopped.length,0);active++;maxActive=Math.max(maxActive,active);try{await new Promise(resolve=>setImmediate(resolve));counts[api.block-1][label.split('-')[0]]++;return oracle.payloadAt('2026-10-19T20:00:00.000Z')}finally{active--}},
  async measure(api,operation,run){const value=await run();return {passed:true,operation,value}},
  async closeBlock(api){assert.equal(active,0);const proof=closed(api.identity);proofs.push(proof);return proof},
  stop(error){stopped.push(error)},
 };change({io,setRemaining:n=>remaining=n})
 return {e,io,events,counts,stopped,proofs,open,run:()=>runAnalysisAbba({expected:e,io,remainingMs:()=>remaining,record:e=>events.push(e)}),maxActive:()=>maxActive}
}
test('fixed ABBA uses four fresh APIs, exactly 12 warmup and 48 formal responses with two-read pairs',async()=>{
 const f=fixture(),r=await f.run();assert.equal(r.workloadComplete,true);assert.equal(r.overallPassed,false);assert.deepEqual(f.open,ABBA);assert.equal(r.oracle.responses,PLAN.totalResponses);assert.equal(f.maxActive(),2)
 assert.deepEqual(f.counts,Array(4).fill({warmup:3,serial:10,pair:2}));assert.equal(f.proofs.length,4);assert.equal(f.stopped.length,0)
 assert.equal(f.events.filter(x=>x.stage==='COMPLETE_RESPONSE_ORACLE').length,60)
})
test('complete HTTP oracle recomputes manifest and permits only cutoff plus its proven derived hash',()=>{
 const e=expected(),o=analysisManifestOracle(e),p=o.payloadAt('2026-10-19T20:00:00.000Z');o.check(p)
 const next=o.payloadAt('2026-10-19T20:00:01.000Z');assert.notEqual(next.manifest.manifestHash,p.manifest.manifestHash);assert.equal(o.check(next).normalizedCompleteResponseSha256,o.check(p).normalizedCompleteResponseSha256)
 for(const mutate of [p=>p.manifest.manifestHash=H,p=>p.manifest.authorityHash=H,p=>p.analysis.descriptives[0].validN=1,p=>p.quality.total=3,p=>delete p.analysis.limitations,p=>p.extra='unapproved']){const p=clone(next);mutate(p);assert.throws(()=>analysisManifestOracle(e).check(p))}
 assert.throws(()=>analysisManifestOracle({...e,sources:[]}));assert.throws(()=>o.complete())
 const prior=readAcceptedAnalysisAuthority();assert.equal(prior.acceptedResponses,6)
})
test('fixed-cutoff independent complete oracle equals both real compiled pure manifests and response projections',()=>{
 const require=createRequire(import.meta.url),{selectAnalysisArtifact}=require('./c25-c26-analysis-artifacts.cjs'),e=expected(),sourceCutoff='2026-10-19T20:00:00.000Z'
 const source={schemaVersion:1,courseId:I.course,observations:e.selector.waves.map((w,i)=>({participantKind:'USER',participantKey:'user:'+I.student,waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,itemId:w.metrics[0].itemId,metricKey:'total',attemptId:I.parents[i],attemptEpoch:1,sourceHashes:e.sources[i].sourceHashes,value:1,reason:null,measurement:e.measurement,originalFinalStatus:'COMPLETED',taskSatisfied:i?true:null}))}
 const o=analysisManifestOracle(e);let original
 for(const arm of ['A','B']){
  const dist=selectAnalysisArtifact(arm).dist,core=require(dist+'/modules/training-analysis/core.js'),manifest=require(dist+'/modules/training-analysis/manifest.js')
  const unsigned={schemaVersion:1,kind:'TRAINING_ANALYSIS',courseId:I.course,actor:{id:I.teacher,role:'TEACHER'},selector:e.selector,definitionHash:e.definitionHash,sourceHash:e.sourceHash,authorityHash:o.payloadAt(sourceCutoff).manifest.authorityHash,qualityHash:e.qualityHash,sourceCutoff,sources:e.sources,dictionary:core.buildTrainingDictionary(e.selector,source),observationCount:2}
  const full=manifest.assertTrainingManifest({...unsigned,manifestHash:manifest.trainingManifestHash(unsigned)})
  const payload={manifest:manifest.trainingManifestSummary(full),analysis:core.buildTrainingAnalysis(e.selector,source),quality:{list:e.quality,total:2,page:1,pageSize:25}}
  assert.deepEqual(payload,o.payloadAt(sourceCutoff));o.check(payload);if(original)assert.deepEqual({full,payload},original);else original={full,payload}
 }
 assert.ok(!Object.keys(require.cache).some(p=>p.endsWith('/config/database.js')))
})
test('uncertain pair settles both and blocks every next block while preserving actual close',async()=>{
 const f=fixture(({io})=>{const request=io.request;io.request=async(api,s,l)=>{if(l==='pair-1-1')throw Error('synthetic uncertain request');return request(api,s,l)}})
 await assert.rejects(f.run(),/synthetic uncertain/);assert.deepEqual(f.open,['A']);assert.equal(f.proofs.length,1);assert.ok(f.stopped.length)
})
test('bad close, reused API identity and post-record deadline cannot produce workload success',async()=>{
 const f=fixture(({io})=>{io.closeBlock=async api=>({...closed(api.identity),groupQuiescent:false})});await assert.rejects(f.run());assert.deepEqual(f.open,['A'])
 const reused=fixture(({io})=>{const open=io.openBlock;io.openBlock=async args=>({...await open(args),identity:{pid:101,startTicks:'1'}})});await assert.rejects(reused.run(),/new API/)
 const late=fixture(({io,setRemaining})=>{const measure=io.measure;io.measure=async(...args)=>{const r=await measure(...args);setRemaining(0);return r}});await assert.rejects(late.run());assert.equal(late.proofs.length,1)
})
