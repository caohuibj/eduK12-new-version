/** Actual transport -> DTO bridge -> driver, with fetch/DB boundary I/O only.
 * No sockets, product services or database are opened by these tests. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {createRawHarness} from './c25-c26-raw-harness.mjs'
import {createC26Workload,PERSISTENCE} from './c25-c26-workload.mjs'
const H='a'.repeat(64),expiry='2026-10-19T19:00:00.000Z'
const response=(data,headers={})=>new Response(JSON.stringify({code:0,data}),{status:200,headers})
function harness(fetchImpl,{recordHook=()=>{},normalize=x=>x}={}){
 const records=[],writes=new Map(),faults=[],checks=[]
 const h=createRawHarness({state:'/private/not-opened',apiUrl:'http://127.0.0.1:43210',remaining:()=>60000,read:()=>({}),write:(name,value)=>writes.set(name,structuredClone(value)),check:value=>checks.push(value),record:value=>{recordHook(value);records.push(value)},onFault:error=>faults.push(error),normalize,fetchImpl})
 return {h,records,writes,faults,checks}
}
test('real transport login uses two requests per role, independent cookies and retained measurements with bare DTOs',async()=>{
 const issued=[];let csrf=0
 const f=harness(async(url,options)=>{
  const route=new URL(url).pathname;issued.push({route,options})
  if(route==='/api/auth/csrf')return response({nonce:++csrf},{'set-cookie':`ptool_csrf=c${csrf}; Path=/`})
  assert.equal(options.headers['x-csrf-token'],`c${csrf}`);assert.equal(options.headers.cookie,`ptool_csrf=c${csrf}`)
  return response({loggedIn:true})
 })
 for(const role of ['TEACHER','STUDENT','ADMIN']){
  const client=f.h.client();assert.deepEqual(await client.login({username:role,password:'synthetic-secret'},role),{loggedIn:true})
 }
 assert.deepEqual(issued.map(x=>x.route),['/api/auth/csrf','/api/auth/training-login','/api/auth/csrf','/api/auth/training-login','/api/auth/csrf','/api/auth/login'])
 for(const [index,role] of ['TEACHER','STUDENT','ADMIN'].entries())assert.deepEqual(JSON.parse(issued[index*2+1].options.body),{username:role,password:'synthetic-secret',...(role==='ADMIN'?{}:{expectedRole:role})})
 assert.deepEqual(f.h.assertQuiescent(),{issued:6,delivered:6,clients:3});assert.equal(f.h.result.requests.length,6)
 assert.ok(f.records.filter(x=>x.stage==='HTTP_ISSUED').every(x=>x.body==='AUTH_REDACTED'));assert.ok(!JSON.stringify(f.records).includes('synthetic-secret'))
 assert.deepEqual(f.h.result.requests.map(x=>x.clientId),[1,1,2,2,3,3]);assert.equal(f.faults.length,0)
})
test('real transport and bare-DTO bridge drive setup, one admission/save and exactly six pre-FINAL checkpoint reads',async()=>{
 let started=false,checkpoint=null,inFlight=0,maxInFlight=0;const calls=[],measured=[]
 const parent={id:'parent',attemptEpoch:1,compositeAssessmentId:'product',userId:'student',deliveryCourseId:'course',trainingPersistenceSnapshotHash:H,trainingPersistenceSnapshot:{policy:PERSISTENCE},trainingFeedbackSnapshot:{policy:{schemaVersion:1,mode:'IMMEDIATE'}}}
 const metadata={snapshotHash:H,attemptId:'parent',attemptEpoch:1,courseId:'course',checkpoint:PERSISTENCE.checkpoint,localCognitive:PERSISTENCE.localCognitive}
 const envelope={drafts:[{slotKey:'form'},{slotKey:'scale'},{slotKey:'sjt'}],cognitiveResults:[]},product={id:'product',expiresAt:expiry}
 const f=harness(async(url,options)=>{
  const route=new URL(url).pathname.slice(4);calls.push({route,method:options.method,body:options.body});inFlight++;maxInFlight=Math.max(maxInFlight,inFlight)
  try{await Promise.resolve()
   if(route.startsWith('/auth/'))return response({})
   if(route==='/questionnaire-products'||route==='/questionnaire-products/product/publish')return response(product)
   if(route==='/composite-assessments/product/attempts'){started=true;return response({attempt:{id:'parent',attemptEpoch:1,status:'IN_PROGRESS',currentItem:{type:'FORM_SECTION'},trainingPersistence:metadata}})}
   assert.equal(route,'/composite-assessments/attempts/parent/checkpoint')
   if(options.method==='PUT'){assert.equal(checkpoint,null);checkpoint={attemptId:'parent',revision:1,successfulSaveCount:1,payloadEncrypted:'cipher',payloadHash:H,expiresAt:expiry};return response({revision:1,successfulSaveCount:1})}
   return response({revision:1,successfulSaveCount:1,envelope,expiresAt:expiry,discardedTerminalSlotKeys:[],trainingPersistence:metadata})
  }finally{inFlight--}
 })
 const api={prisma:{compositeAssessmentAttempt:{count:async()=>0,findUniqueOrThrow:async()=>parent},compositeAssessment:{findUniqueOrThrow:async()=>({...product,trainingFeedbackPolicy:{schemaVersion:1,mode:'IMMEDIATE'},trainingPersistencePolicy:PERSISTENCE})},trainingAttemptCheckpoint:{findUnique:async()=>checkpoint,findUniqueOrThrow:async()=>checkpoint},compositeReportQueueBudget:{findUniqueOrThrow:async()=>({id:'reports',pending:0})},compositeReportJob:{findMany:async()=>[]},exportBatch:{findMany:async()=>[]},exportArtifact:{findMany:async()=>[]}}}
 const actors={teacher:{id:'teacher',username:'teacher',password:'synthetic'},student:{id:'student',username:'student',password:'synthetic'}}
 const scope={teacher:f.h.client(),route:'/courses/00000000-0000-0000-0000-000000000001/training-analysis',selector:{schemaVersion:1,courseId:'00000000-0000-0000-0000-000000000001',mode:'PAIRWISE',waves:['a','b'].map(key=>({waveKey:'wave_'+key,taskId:'task-'+key,publication:expiry,configDigest:null,variantKey:null,metrics:[{itemId:'scale-'+key,metricKey:'total'}]}))},sourceIdentity:{scope:'ACCEPTED_JOINT_RESTORE_C25_AB',sourceSha256:H,rowsSha256:H,teacherId:'old-teacher'},assertResponse(){}}
 const driver=createC26Workload(f.h,{runtimeLoader:async()=>api,fixtureLoader:async()=>({seed:async()=>({actors,products:{}}),draftProduct:async client=>client.request('/questionnaire-products','POST',{}),publish:async client=>client.request('/questionnaire-products/product/publish','POST',{}),checkpointEnvelope:async()=>envelope}),independentReadScope:scope,measure:async(meta,run)=>{measured.push(meta);return run()},reportChild:()=>assert.fail('No FINAL/report in transport boundary'),exportChild:()=>assert.fail('No export in transport boundary')})
 await driver.prepare();await driver.startAndSaveCheckpoint();await driver.readCheckpoint()
 assert.equal(started,true);assert.equal(calls.length,14);assert.equal(f.h.result.requests.length,14);assert.equal(maxInFlight,2);assert.equal(f.faults.length,0)
 assert.equal(measured.filter(x=>x.phase==='setup').length,6);assert.equal(measured.filter(x=>x.phase==='serial').length,4);assert.equal(measured.filter(x=>x.phase==='wave').length,1)
 assert.equal(calls.filter(x=>x.route.endsWith('/checkpoint')&&x.method==='GET').length,6);assert.equal(calls.filter(x=>x.route.endsWith('/checkpoint')&&x.method==='PUT').length,1)
 assert.ok(calls.every(x=>!x.route.includes('/metrics')&&!x.route.endsWith('/submit')));assert.equal(f.h.assertQuiescent().issued,14)
})
test('DTO journal failure after a real write response permanently stops all clients without retry',async()=>{
 let calls=0;const f=harness(async()=>{calls++;return response({accepted:true})},{recordHook:row=>{if(row.stage==='DTO_DELIVERED')throw new Error('synthetic journal failure')}})
 const a=f.h.client(),b=f.h.client();await assert.rejects(a.request('/resource','POST',{}),/journal failure/)
 await assert.rejects(b.request('/later'),/journal failure/);assert.throws(()=>f.h.assertQuiescent());assert.equal(calls,1);assert.equal(f.faults.length,1)
})
test('transport normalization and raw binary retain exact return identities while measurements stay separate',async()=>{
 const dto={normalized:true},bytes=Buffer.from('private synthetic csv'),f=harness(async url=>new URL(url).pathname.endsWith('/binary')?new Response(bytes):response({wrapped:true}),{normalize:()=>dto}),c=f.h.client()
 assert.equal(await c.request('/json'),dto);assert.deepEqual(await c.request('/binary','GET',undefined,200,true),bytes)
 assert.equal(f.h.result.requests.length,2);assert.equal(f.h.result.requests[1].responseBytes,bytes.length);assert.equal(f.h.assertQuiescent().delivered,2)
})
