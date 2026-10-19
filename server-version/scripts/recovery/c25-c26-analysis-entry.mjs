/** Analysis-only bridge. No service starts on import; the locked outer controller
 * supplies current logical admission, immutable artifacts and absolute budgets. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {runAnalysisAbba,readAcceptedAnalysisAuthority} from './c25-c26-analysis-abba.mjs'
import {bindAnalysisScopeFixture,prepareAnalysisExpected,C26_ANALYSIS_FIXTURE_PATH,C26_ANALYSIS_FIXTURE_SHA256,C26_ANALYSIS_IDS} from './c25-c26-analysis-scope.mjs'
import {createOperationGate,createHttpTransport} from './c25-c26-transport.mjs'
import {startObservedAnalysisApi} from './c25-c26-analysis-api.mjs'
import {startPgObserverSession} from './c25-c26-pg-session.mjs'
import {createOwnedPidRegistry} from './c25-c26-pg-observer.mjs'
import {parseProcStat} from './c25-c26-observer.mjs'
import {driverDeadlineContract,apiRssObservation} from './c25-c26-a-entry.mjs'
import {probeDelta,classifyMetricCoverage,installPrismaBusinessGate} from './c25-c26-a-driver.mjs'
import {assertResources} from './c25-c26-contract.mjs'
const require=createRequire(import.meta.url),{selectAnalysisArtifact,BACKEND}=require('./c25-c26-analysis-artifacts.cjs')
export const STATE='/workspace/scratch/5a77e8bdc1ae/eduk12_c26_analysis_abba_01'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),proc=pid=>parseProcStat(fs.readFileSync(`/proc/${pid}/stat`,'utf8'))
const sample=()=>({monotonicNs:process.hrtime.bigint().toString(),cpu:process.cpuUsage(),memory:process.memoryUsage()})
export function analysisEnvelope(bytes,status,expected=200){
 assert.equal(status,expected);assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=2*1024**2)
 const value=JSON.parse(bytes.toString());assert.deepEqual(Object.keys(value).sort(),['code','data','message'])
 if(expected===200){assert.equal(value.code,0);assert.equal(value.message,'操作成功');assert.ok(value.data&&typeof value.data==='object')}
 else if(expected===404)assert.deepEqual(value,{code:'TRAINING_ANALYSIS_NOT_FOUND',message:'课程不存在或无当前数据访问权限',data:null})
 else{assert.equal(expected,403);assert.deepEqual(value,{code:-1,message:'需要特定权限',data:null})}
 return value.data
}
export function createAnalysisHttp({apiUrl,remainingMs,record,stop,fetchImpl=fetch}){
 const gate=createOperationGate(record);let failed=null,sequence=0
 const fault=e=>{failed??=e;gate.stop(failed);stop(failed);return failed}
 const check=()=>{if(failed)throw failed;remainingMs()}
 return Object.freeze({stop:fault,assertQuiescent:()=>{check();return gate.assertQuiescent()},client(){
  const transport=createHttpTransport({apiUrl,remainingMs:()=>{check();return remainingMs()},record,gate,fetchImpl})
  const request=async(route,method,body,expected,label,analysis=false)=>{
   try{check();const {value,measurement}=await transport.request(route,method,body,expected,true,{label:`analysis-${++sequence}-${label}`,...(analysis?{readOnlyAnalysis:true,bodySha256:sha(JSON.stringify(body))}:{})})
    if(analysis){record({stage:'ANALYSIS_HTTP_COMPLETE',...measurement,response:value.toString(),responseSha256:sha(value)});check();return {data:analysisEnvelope(value,measurement.status,expected),measurement}}
    const envelope=JSON.parse(value.toString());assert.equal(measurement.status,200);assert.deepEqual(Object.keys(envelope).sort(),['code','data','message']);assert.equal(envelope.code,0);assert.equal(typeof envelope.message,'string');check();return envelope.data
   }catch(e){throw fault(e)}
  }
  return {async login(actor,role){check();assert.ok(['TEACHER','STUDENT'].includes(role));await request('/auth/csrf','GET',undefined,200,'csrf');const data=await request('/auth/training-login','POST',{username:actor.username,password:actor.password,expectedRole:role},200,'login');assert.equal(data.user.id,actor.id);assert.equal(data.user.role,role);return {id:data.user.id,role:data.user.role}},
   analysis:(selector,label,expected=200)=>request(`/courses/${selector.courseId}/training-analysis`,'POST',{selector},expected,label,true)}
 }})
}
async function loadExpected(rows,fixture,{remaining,record,stop}){
 const binding=bindAnalysisScopeFixture(rows,fixture),dist=selectAnalysisArtifact('A').dist
 // Load one exact owned singleton, gate it before either real decoder imports.
 const {prisma}=require(dist+'/config/database.js');const gate=installPrismaBusinessGate(prisma,{assertWork:remaining,record,stop})
 prisma.$use((params,next)=>{remaining();assert.equal(params.action,'queryRaw','decoder may only SELECT frozen sources');return next(params)})
 const at=sample();let failure
 try{
  const {loadStoredCanonicalUnitResult}=require(dist+'/modules/assessment-runtime/compact-assessment-storage.js'),{loadFrozenScaleRuntimeSnapshot}=require(dist+'/modules/assessment-runtime/runtime-snapshot.js')
  assert.equal(require(dist+'/config/database.js').prisma,prisma)
  const decoded=[];for(const {snapshot,child}of binding.selected){remaining();decoded.push({envelope:await loadStoredCanonicalUnitResult(snapshot.canonical_result_encrypted,prisma),runtime:await loadFrozenScaleRuntimeSnapshot(child.runtime_snapshot_encrypted,prisma)})}
  remaining();const expected=prepareAnalysisExpected(binding,decoded);gate.assertQuiescent();return expected
 }catch(e){failure=e;throw stop(e)}finally{await prisma.$disconnect();record({stage:'EXPECTED_SOURCE_SETUP',before:at,after:sample(),prisma:gate.snapshot(),passed:!failure});if(!failure)remaining()}
}
export async function runAnalysisExperiment(options,dependencies={}){
 const {directory,node,env,baseIdentities,connectionOptions,remainingMs,workRemainingMs,rows,fixture,record,write,readResources,ownedRegistryChanged}=options
 const {startApi=startObservedAnalysisApi,startSession=startPgObserverSession,decode=loadExpected,fetchImpl=fetch,readIdentity=proc,wait=ms=>new Promise(r=>setTimeout(r,ms))}=dependencies
 let failure,api,session,http,owner,active=false,probePending=false,blockClosing=false,cleaning=false,timer,resourceTimer;const abort=new AbortController(),windows=[],blocks=[],seenArms=new Set(),result={schemaVersion:1,scope:'ANALYSIS_ONLY_ABBA',passed:false,workloadComplete:false,windows,blocks,automaticRetries:0,newFixtureOrFinals:0}
 const total=()=>{const left=remainingMs();assert.ok(left>0&&left<=780000);return left}
 const work=()=>{if(failure)throw failure;const left=Math.min(workRemainingMs(),total()-60000);assert.ok(left>0&&left<=720000);return left}
 const remaining=()=>cleaning?total():work()
 const stop=e=>{failure??=e instanceof Error?e:new Error(String(e));if(!abort.signal.aborted)abort.abort(failure);return failure}
 const retain=value=>{record(value);remaining()}
 const fault=new Promise((_,reject)=>abort.signal.addEventListener('abort',()=>reject(failure),{once:true}));fault.catch(()=>{})
 const bounded=async(fn,limit=90000)=>{remaining();const end=performance.now()+Math.min(limit,remaining());let t;try{const value=await Promise.race([Promise.resolve().then(fn),...(!cleaning?[fault]:[]),new Promise((_,reject)=>t=setTimeout(()=>reject(stop(Error('analysis operation deadline'))),Math.max(1,end-performance.now())))]);remaining();assert.ok(performance.now()<end);return value}finally{clearTimeout(t)}}
 const resources=()=>{try{const value=readResources(blockClosing||cleaning?undefined:api?.identity);assertResources(value);result.minimumResources??={...value};for(const [k,n]of Object.entries(value))result.minimumResources[k]=Math.min(result.minimumResources[k]??n,n);remaining();if(!cleaning&&!blockClosing){if(!probePending)api?.assertHealthy();session?.assertHealthy()}}catch(e){stop(e)}}
 const identity={...readIdentity(process.pid),role:'driver',applicationName:`c26:driver:${randomBytes(8).toString('hex')}`}
 const url=new URL(env.DATABASE_URL);assert.equal(url.pathname,'/eduk12_c25_joint_restore');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.username,'eduk12_runtime');url.searchParams.set('application_name',identity.applicationName)
 process.env.DATABASE_URL=url.toString();process.env.DATABASE_URL_RUNTIME=url.toString();const runtime={...env,DATABASE_URL:url.toString(),DATABASE_URL_RUNTIME:url.toString()}
 const dir=name=>{const value=path.join(directory,name);fs.mkdirSync(value,{mode:0o700});return value}
 async function probe(){assert.equal(probePending,false);probePending=true;try{return await api.snapshot()}finally{probePending=false}}
 async function observe(operation,fn,{apiAfter=true}={}){
  assert.equal(active,false);active=true;const end=performance.now()+Math.min(90000,work()),row={sequence:windows.length+1,operation,passed:false,operationComplete:false};windows.push(row)
  try{await bounded(async()=>{row.pgBefore=await session.begin({maxWindowMs:Math.floor(Math.min(90000,work()))});row.before={driver:sample(),api:api?await probe():null};const at=performance.now();row.value=await fn();row.elapsedMs=performance.now()-at;row.operationComplete=true;row.after={driver:sample(),api:apiAfter&&api?await probe():null};row.pgOperationEnd=await session.operationEnd();await wait(1100);row.pgSettled=await session.settledEnd();if(row.before.api&&row.after.api)row.apiDelta=probeDelta(row.before.api,row.after.api)},90000);row.passed=true;return row}
  catch(e){row.error={name:e.name,stack:String(e.stack??e)};throw stop(e)}
  finally{active=false;write('c25-c26-analysis-windows-private.json',{schemaVersion:1,windows});if(row.passed){work();assert.ok(performance.now()<end)}}
 }
 async function closeBlock(){
  blockClosing=true;const closingApi=api;let observerProof,apiProof,error
  try{if(session)observerProof=await session.close()}catch(e){error=e;stop(e)}finally{session=null;try{if(closingApi)apiProof=await closingApi.stop()}catch(e){error??=e;stop(e)}api=null;blockClosing=false}
  if(error)throw error;assert.equal(observerProof.passed,true);assert.equal(apiProof.passed,true);return {...apiProof,observer:observerProof}
 }
 try{
  resources();work();readAcceptedAnalysisAuthority();timer=setTimeout(()=>stop(Error('analysis work cutoff')),work());resourceTimer=setInterval(resources,100)
  const expected=await bounded(()=>decode(rows,fixture,{remaining:work,record:retain,stop}));retain({stage:'EXPECTED_ANALYSIS_BOUND',expected})
  result.experiment=await runAnalysisAbba({expected,remainingMs:work,record:retain,io:{stop,
   async openBlock({block,arm}){
    assert.equal(api,undefined);const registry=createOwnedPidRegistry([...baseIdentities,identity]);const published={...registry,register(x){const value=registry.register(x);ownedRegistryChanged(registry.entries());remaining();return value},retire(x){registry.retire(x);ownedRegistryChanged(registry.entries());remaining()}}
    ownedRegistryChanged(registry.entries());session=await startSession({directory:dir(`block-${block}-observer`),node,env:runtime,registry:published,remainingMs:total,record:retain,onFault:stop,abortSignal:abort.signal});await session.connect(connectionOptions)
    const at=sample();http=createAnalysisHttp({apiUrl:`http://127.0.0.1:${env.PORT}`,remainingMs:work,record:retain,stop,fetchImpl})
    try{await observe({phase:'startup-auth-permissions',block,arm},async()=>{
     api=await startApi({arm,directory:dir(`block-${block}-api`),node,env:runtime,remainingMs:total,record:retain,onFault:stop,register:x=>session.register(x),abortSignal:abort.signal})
     owner=http.client();await owner.login(fixture.actors.teacher,'TEACHER');assert.equal(fixture.actors.teacher.id,C26_ANALYSIS_IDS.teacher)
     if(!seenArms.has(arm)){const other=http.client(),student=http.client();await other.login(fixture.actors.otherTeacher,'TEACHER');await other.analysis(expected.selector,'other-teacher',404);await student.login(fixture.actors.student,'STUDENT');await student.analysis(expected.selector,'student',403);seenArms.add(arm)}
    });blocks.push({block,arm,startupBefore:at,startupAfter:sample(),identity:api.identity});return api}
    catch(e){try{await closeBlock()}catch{}throw e}
   },
   async request(current,selector,label){assert.equal(current,api);const run=async()=>{const response=await owner.analysis(selector,label);return response.data};return label.startsWith('warmup-')?(await observe({phase:'warmup',arm:api.artifact?.arm??blocks.at(-1).arm,block:blocks.length,label},run)).value:run()},
   measure:(current,operation,fn)=>{assert.equal(current,api);return observe({phase:'formal',block:blocks.length,arm:blocks.at(-1).arm,...operation},fn)},
   async closeBlock(){http.assertQuiescent();const proof=await closeBlock();api=undefined;retain({stage:'BLOCK_PROCESS_CLOSED',block:blocks.length,proof});return proof},
  }})
  assert.equal(seenArms.size,2);work();result.workloadComplete=true
 }catch(e){stop(e);result.error={name:e.name,stack:String(e.stack??e)};if(e.abbaPartial)result.experiment=e.abbaPartial}
 finally{
  cleaning=true;clearTimeout(timer);clearInterval(resourceTimer);result.cleanup=[]
  for(const [name,fn]of [['observer',()=>session?.close()],['api',()=>api?.stop()]])try{const proof=await bounded(fn,8000);if(proof){assert.equal(proof.passed,true);result.cleanup.push({name,passed:true,proof})}}catch(e){failure??=e;result.cleanup.push({name,passed:false,error:e.name})}
  resources();result.metricCoverage=classifyMetricCoverage(windows,[]);result.passed=!failure&&result.workloadComplete;result.driverAfterCleanup=sample()
  try{total();write('c25-c26-analysis-driver-result-private.json',result);total()}catch(e){failure??=e;result.passed=false;write('c25-c26-analysis-driver-result-private.json',result)}
 }
 if(failure)throw failure;return result
}
function privateRead(p){const s=fs.lstatSync(p);assert.ok(s.isFile()&&s.nlink===1&&(s.mode&0o777)===0o600&&s.uid===process.getuid());return JSON.parse(fs.readFileSync(p))}
export async function main(){
 process.umask(0o077);assert.equal(process.argv.length,3);assert.equal(process.argv[2],STATE);assert.equal(process.version,'v24.21.0');assert.equal(process.cwd(),BACKEND)
 const invocation=privateRead(STATE+'/c25-c26-driver-invocation-private.json'),runtime=privateRead(STATE+'/c25-c26-effective-runtime-private.json');assert.equal(invocation.parentPid,process.ppid);assert.equal(invocation.scope,'ANALYSIS_ONLY_ABBA');assert.equal(invocation.database,'eduk12_c25_joint_restore')
 const deadlines=driverDeadlineContract(invocation);for(const[k,v]of Object.entries(runtime))assert.equal(process.env[k],v)
 const bytes=fs.readFileSync(C26_ANALYSIS_FIXTURE_PATH);assert.equal(sha(bytes),C26_ANALYSIS_FIXTURE_SHA256);const fixture=JSON.parse(bytes),rows=privateRead(STATE+'/c25-c26-protected-rows-private.json').rows
 const fd=fs.openSync(STATE+'/c25-c26-analysis-events-private.jsonl','wx',0o600),hash=createHash('sha256');let size=0,failed;const all=new Map()
 const write=(name,value)=>{assert.match(name,/^c25-c26-[a-z0-9-]+\.json$/);const p=path.join(STATE,name),tmp=p+'.tmp';const f=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(f,JSON.stringify(value));fs.fsyncSync(f)}finally{fs.closeSync(f)}fs.renameSync(tmp,p)}
 const record=value=>{const item=value.stage==='OBSERVER_RAW'?{stage:value.stage,sequence:value.sequence,sha256:sha(JSON.stringify(value.value))}:value;const line=Buffer.from(JSON.stringify(item)+'\n');assert.ok(size+line.length<=32*1024**2);fs.writeSync(fd,line);hash.update(line);size+=line.length}
 try{await runAnalysisExperiment({directory:STATE,node:process.execPath,env:{...runtime,PATH:process.env.PATH,HOME:STATE,TMPDIR:STATE,LANG:'C.UTF-8',TZ:'UTC',NODE_ENV:'test'},...deadlines,baseIdentities:invocation.baseIdentities,connectionOptions:invocation.connectionOptions,rows,fixture,record,write,
  ownedRegistryChanged:entries=>{for(const r of entries)all.set(`${r.pid}:${r.startTicks}`,r);write('c25-c26-owned-processes-private.json',{schemaVersion:1,parentPid:process.pid,current:entries,all:[...all.values()]})},
  readResources:identity=>{const a=fs.statfsSync('/workspace/scratch/5a77e8bdc1ae'),b=fs.statfsSync('/tmp');const r={diskBytes:a.bavail*a.bsize,tmpBytes:b.bavail*b.bsize,memoryBytes:Number(/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'))[1])*1024};if(identity){const rss=apiRssObservation(identity.pid);if(rss.status==='OBSERVED')r.apiRssBytes=rss.bytes;else record({stage:'API_RSS_NOT_OBSERVED',rss})}return r}})}catch(e){failed=e;write('c25-c26-analysis-entry-error-private.json',{name:e.name,stack:String(e.stack??e)})}
 finally{fs.fsyncSync(fd);fs.closeSync(fd);const result={passed:!failed,bytes:size,sha256:hash.digest('hex')};try{if(!failed)deadlines.remainingMs();write('c25-c26-analysis-journal-result.json',result);if(!failed)deadlines.remainingMs()}catch(e){failed??=e;result.passed=false;write('c25-c26-analysis-journal-result.json',result)}}
 if(failed)process.exitCode=1
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{process.stderr.write(`Analysis entry rejected (${e.name}); inspect private evidence.\n`);process.exitCode=1})
