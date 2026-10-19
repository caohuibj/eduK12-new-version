/** Analysis-only fixed ABBA algorithm and independent complete response oracle.
 * Inert import. The outer launcher supplies the actual bounded API/PG I/O and
 * one baseline/final pair. This module has no service/bootstrap CLI. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {createHash} from 'node:crypto'
import {analysisBindingHash as hash,C26_ANALYSIS_IDS as IDS} from './c25-c26-analysis-scope.mjs'
export const ABBA=Object.freeze(['A','B','B','A'])
export const PLAN=Object.freeze({blocks:4,warmupPerBlock:3,serialPerBlock:10,pairsPerBlock:1,pairSize:2,totalResponses:60,formalResponses:48,formalSerialPerArm:20,formalPairsPerArm:2,automaticRetries:0})
export const ACCEPTED_HTTP=Object.freeze({path:'/workspace/scratch/5a77e8bdc1ae/eduk12_c26_a_07/c25-c26-driver-events-private.jsonl',sha256:'edf33637927c76b2a23bb20a009f89eee25c8de35be0d991f16d8752c8c170a7',authorityHash:'362fa9c3de6c43ad13a221714d1426db99aea940f992fa71ce43d228bd15415a'})
const REASONS=['QUALITY_EXCLUDED','NOT_COMPARABLE','NOT_ASSIGNED','UNANSWERED','NON_FINAL','NOT_ATTEMPTED','INVALID_VALUE','MISSING_SOURCE','LEGACY_UNSCOPED','IDENTITY_UNAVAILABLE','NO_OBSERVATION','NOT_CALCULABLE']
const LIMITATIONS=['DESCRIPTIVE_RESEARCH_ONLY','NO_CAUSAL_OR_DIAGNOSTIC_INTERPRETATION','UNIQUE_OR_REJECT','NO_CROSS_STRATUM_POOLING']
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),clone=structuredClone
export function readAcceptedAnalysisAuthority(){
 const p=ACCEPTED_HTTP.path,s=fs.lstatSync(p);assert.ok(s.isFile());assert.equal(s.nlink,1);assert.equal(s.mode&0o777,0o600);assert.equal(fs.realpathSync(p),p);assert.ok(s.size<16*1024**2)
 const bytes=fs.readFileSync(p);assert.equal(sha(bytes),ACCEPTED_HTTP.sha256)
 const responses=bytes.toString().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(v=>v.stage==='HTTP_RECEIVED'&&v.route===`/courses/${IDS.course}/training-analysis`)
 assert.equal(responses.length,6);for(const response of responses){assert.equal(response.status,200);assert.equal(sha(response.response),response.responseSha256);assert.equal(JSON.parse(response.response).data.manifest.authorityHash,ACCEPTED_HTTP.authorityHash)}
 return {...ACCEPTED_HTTP,acceptedResponses:6,scope:'ACCEPTED_A07_AUTHORITY; CURRENT_FULL_BASELINE_MUST_STILL_MATCH'}
}
export function analysisManifestOracle(expected,authorityHash=ACCEPTED_HTTP.authorityHash){
 const e=clone(expected),selector=e.selector
 assert.equal(selector.courseId,IDS.course);assert.equal(selector.mode,'PAIRWISE');assert.equal(e.sources.length,2);assert.equal(e.quality.length,2)
 assert.equal(e.definitionHash,hash(selector));assert.equal(e.sourceHash,hash(e.sources));assert.equal(e.qualityHash,hash(e.quality));assert.match(authorityHash,/^[a-f0-9]{64}$/)
 const dictionary=selector.waves.flatMap(w=>w.metrics.map(metric=>({columnKey:'m_'+hash({waveKey:w.waveKey,scope:JSON.stringify([w.taskId,w.publication,w.configDigest,w.variantKey]),...metric}),waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,...metric,measurement:e.measurement,valueType:'NUMBER',missingReasons:REASONS})))
 const analysis={schemaVersion:1,kind:'TRAINING_NUMERIC_LONGITUDINAL',courseId:selector.courseId,mode:'PAIRWISE',minimumN:5,state:'suppressed',
  descriptives:selector.waves.map(w=>({waveKey:w.waveKey,taskId:w.taskId,publication:w.publication,configDigest:null,variantKey:null,itemId:w.metrics[0].itemId,metricKey:'total',measurement:e.measurement,state:'suppressed'})),
  metrics:[{metricKey:'total',state:'suppressed',countKind:'PAIRED_VALID',flow:[{fromWaveKey:'wave_a',toWaveKey:'wave_b',basis:'OBSERVED_SAMPLE',state:'suppressed'}]}],limitations:LIMITATIONS}
 const unsigned={schemaVersion:1,kind:'TRAINING_ANALYSIS',courseId:selector.courseId,actor:{id:IDS.teacher,role:'TEACHER'},selector,definitionHash:e.definitionHash,sourceHash:e.sourceHash,authorityHash,qualityHash:e.qualityHash,sources:e.sources,dictionary,observationCount:2}
 let count=0,normalizedHash=null
 const payloadAt=sourceCutoff=>{const manifestHash=hash({...unsigned,sourceCutoff});return {manifest:{schemaVersion:1,manifestHash,definitionHash:e.definitionHash,sourceHash:e.sourceHash,qualityHash:e.qualityHash,authorityHash,sourceCutoff,sourceCount:2,observationCount:2},analysis:clone(analysis),quality:{list:clone(e.quality),total:2,page:1,pageSize:25}}}
 return Object.freeze({
  // Available to pure fixtures only; actual HTTP expectations are recomputed
  // independently rather than accepting a response as its own oracle.
  payloadAt,
  check(payload){
   assert.ok(count<PLAN.totalResponses,'unexpected extra analysis response');const cutoff=payload?.manifest?.sourceCutoff
   assert.equal(typeof cutoff,'string');assert.equal(new Date(cutoff).toISOString(),cutoff)
   assert.deepEqual(payload,payloadAt(cutoff),'complete analysis response or reconstructed manifest hash differs')
   const normalized=clone(payload);normalized.manifest.sourceCutoff='2000-01-01T00:00:00.000Z';normalized.manifest.manifestHash=hash({...unsigned,sourceCutoff:normalized.manifest.sourceCutoff})
   const digest=hash(normalized);if(normalizedHash)assert.equal(digest,normalizedHash);else normalizedHash=digest
   return {sequence:++count,manifestHash:payload.manifest.manifestHash,sourceCutoff:cutoff,normalizedCompleteResponseSha256:digest,normalization:['manifest.sourceCutoff','manifest.manifestHash'],manifestRecomputed:true}
  },
  complete(){assert.equal(count,PLAN.totalResponses);return {responses:count,normalizedCompleteResponseSha256:normalizedHash,completeFieldsEqual:true}},
 })
}
export function assertBlockClosed(value,identity){
 assert.equal(value.passed,true);assert.equal(value.closeObserved,true);assert.equal(value.groupQuiescent,true);assert.deepEqual(value.exit,{code:0,signal:null})
 assert.equal(value.identity.pid,identity.pid);assert.equal(value.identity.startTicks,identity.startTicks);assert.ok(value.closedMonotonicNs)
}
export async function runAnalysisAbba({expected,io,remainingMs,record}){
 for(const fn of ['openBlock','request','measure','closeBlock','stop'])assert.equal(typeof io[fn],'function')
 assert.equal(typeof record,'function');const oracle=analysisManifestOracle(expected),results=[],pids=new Set();let failure=null
 const budget=()=>{if(failure)throw failure;const left=remainingMs();assert.ok(Number.isFinite(left)&&left>0&&left<=720000);return left}
 const stop=error=>{failure??=error;try{io.stop(failure)}catch{};return failure}
 const retain=value=>{budget();record(value);budget()}
 try{
  for(let block=0;block<ABBA.length;block++){
   budget();const arm=ABBA[block],result={block:block+1,arm,warmup:[],serial:[],pair:[],closed:null};results.push(result);let api
   try{
    api=await io.openBlock({block:block+1,arm});budget();assert.ok(Number.isSafeInteger(api.identity.pid)&&api.identity.pid>0);assert.match(api.identity.startTicks,/^[0-9]+$/)
    const identity=`${api.identity.pid}:${api.identity.startTicks}`;assert.ok(!pids.has(identity),'each block must use a new API process');pids.add(identity)
    const request=async label=>{budget();const payload=await io.request(api,clone(expected.selector),label);budget();const proof=oracle.check(payload);retain({stage:'COMPLETE_RESPONSE_ORACLE',block:block+1,arm,label,payload,proof});return proof}
    for(let n=0;n<PLAN.warmupPerBlock;n++)result.warmup.push(await request(`warmup-${n+1}`))
    for(let n=0;n<PLAN.serialPerBlock;n++){
     const item=await io.measure(api,{kind:'serial',index:n+1,requests:1},()=>request(`serial-${n+1}`));budget();assert.equal(item.passed,true);result.serial.push(item)
    }
    const pair=await io.measure(api,{kind:'pair',index:1,requests:2},async()=>{
     const outcomes=await Promise.allSettled([1,2].map(n=>request(`pair-1-${n}`).catch(error=>{stop(error);throw error})))
     const bad=outcomes.find(x=>x.status==='rejected');if(bad)throw bad.reason;return outcomes.map(x=>x.value)
    });budget();assert.equal(pair.passed,true);result.pair.push(pair)
   }catch(error){throw stop(error)}
   finally{
    // closeBlock owns reserved cleanup time and must run even after work latch
    // failure; no following block can start until exact close proof is valid.
    if(api){try{result.closed=await io.closeBlock(api);assertBlockClosed(result.closed,api.identity)}catch(error){stop(error)}}
   }
   budget();retain({stage:'BLOCK_CLOSED',block:block+1,arm,proof:result.closed})
  }
  const oracleResult=oracle.complete();budget()
  const result={schemaVersion:1,workloadComplete:true,plan:PLAN,blocks:results,oracle:oracleResult,safety:'REQUIRES_OUTER_FINAL_DATABASE_MATERIAL_INPUT_AND_LOCK_PROOFS',metricCoverage:'REPORTED_PER_WINDOW; PG_LOWER_BOUNDS_NOT_TOTAL_CPU',overallPassed:false,automaticBOptimization:false}
  retain({stage:'ABBA_WORKLOAD_COMPLETE',responses:oracleResult.responses});return result
 }catch(error){stop(error);throw Object.assign(error,{abbaPartial:{schemaVersion:1,workloadComplete:false,blocks:results,overallPassed:false}})}
}
