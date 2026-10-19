import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {startObservedApi} from './c25-c26-api.mjs'
import {workerWrite,workerRead} from './c25-c26-worker-runtime.mjs'
const fixture=fileURLToPath(new URL('c25-c26-api-fixture.mjs',import.meta.url))
async function run(mode,action=async api=>api.stop()){
 const root=process.env.C26_PREPARE_EVIDENCE_ROOT;assert.ok(root);const directory=fs.mkdtempSync(path.join(root,`api-${mode}-`));fs.chmodSync(directory,0o700);workerWrite(path.join(directory,'fixture-config.json'),{scope:'NO_SERVICE_API_LIFECYCLE',mode})
 const end=performance.now()+7000,events=[],faults=[];let api,result,error,identity
 try{
  api=await startObservedApi({directory,node:process.execPath,env:{PATH:process.env.PATH,NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false',DATABASE_URL:'postgresql://eduk12_runtime:synthetic@127.0.0.1:54399/eduk12_c25_joint_restore',C26_API_FIXTURE_DIRECTORY:directory},remainingMs:()=>end-performance.now(),record:x=>events.push(x),onFault:e=>faults.push(e.name),register:async value=>{identity=value;await new Promise(resolve=>setImmediate(resolve));workerWrite(path.join(directory,'registration.json'),{pid:value.pid,startTicks:value.startTicks});events.push({stage:'registered'})}},
  {spawnChild:(node,argv,options)=>spawn(node,['--import',fixture,...argv],options)})
  result=await action(api)
 }catch(caught){error=caught}finally{if(api)try{await api.stop()}catch(caught){error??=caught}}
 const receipt=workerRead(path.join(directory,'api-lifecycle-private.json'));return {directory,api,result,error,receipt,events,faults,identity}
}
test('actual API leaf registers before consumer load, accepts exact PM2 ready and keeps SQL snapshot separate from exit tail',{timeout:10000},async()=>{
 const r=await run('success',async api=>{const sample=await api.snapshot();assert.equal(sample.sql.events,1);assert.equal(sample.consumerLoaded,true);api.assertHealthy();return api.stop()})
 assert.ifError(r.error);assert.equal(r.receipt.passed,true);assert.equal(r.receipt.initialProbe.sql.events,1);assert.equal(r.receipt.finalProbe.sql.events,1);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.deepEqual(r.receipt.exit,{code:0,signal:null})
 assert.ok(BigInt(r.receipt.finalProbeToCloseWallUpperNs)>=BigInt(r.receipt.finalProbeToCloseWallLowerNs));assert.match(r.receipt.scope,/CPU_UNOBSERVED/)
 assert.ok(r.events.findIndex(x=>x.stage==='registered')<r.events.findIndex(x=>x.stage==='API_PM2_READY'));assert.equal(r.faults.length,0)
})
test('malformed IPC and duplicate PM2 ready stop the real owned API fixture and preserve false',{timeout:10000},async()=>{
 for(const mode of ['bad-ipc','duplicate-ready']){const r=await run(mode);assert.ok(r.error);assert.equal(r.receipt.passed,false);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);assert.ok(r.faults.length)}
})
test('API TERM refusal escalates within cleanup budget; post-close SQL cannot be accepted as a valid sample',{timeout:10000},async()=>{
 for(const mode of ['ignore-term','late-query']){const r=await run(mode);assert.ok(r.error);assert.equal(r.receipt.passed,false);assert.equal(r.receipt.closeObserved,true);assert.equal(r.receipt.groupQuiescent,true);if(mode==='ignore-term')assert.equal(r.receipt.exit.signal,'SIGKILL')}
})
test('successful API leader exit with an owned live descendant remains false and cleans that group',{timeout:10000},async()=>{
 const r=await run('descendant');assert.ok(r.error);assert.equal(r.receipt.passed,false);assert.equal(r.receipt.exit.code,0);assert.equal(r.receipt.groupQuiescent,true);assert.ok(r.receipt.groupMembersAtClose.some(x=>!['Z','X','x'].includes(x.state)))
})
