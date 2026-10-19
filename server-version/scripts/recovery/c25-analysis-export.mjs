/** New C19 analysis supplement only. Importing this module opens no service,
 * connection or worker. One real queued export is processed once, with its
 * unchanged Redis payload and retry metadata, by the frozen task function. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {runtime,sha,publicFailure} from './c25-client.mjs'
const directory=path.dirname(fileURLToPath(import.meta.url))
export const CHILD_LIMITS=Object.freeze({report:120000,export:60000})

export function privateJson(file,value){
 const fd=fs.openSync(file,'wx',0o600)
 try{fs.writeFileSync(fd,JSON.stringify(value,null,2));fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 assert.equal(fs.statSync(file).mode&0o777,0o600)
}
export function childBudget(kind,remaining){
 assert.ok(Object.hasOwn(CHILD_LIMITS,kind),'Only the two fixed supplement children are allowed')
 assert.ok(Number.isFinite(remaining)&&remaining>4000,'Insufficient phase time to spawn and reap a child')
 // This includes the two-second SIGTERM→SIGKILL allowance. Neither child can
 // outlive the shared parent phase or reset its aggregate budget.
 const aggregate=Math.floor(Math.min(CHILD_LIMITS[kind],remaining-1000))
 return {aggregate,work:aggregate-2000,killGrace:2000}
}
export function realExportInvocation(job,batchId){
 assert.ok(job&&job.data&&typeof job.data==='object','Actual Redis export job required')
 assert.equal(String(job.id),'export-'+batchId);assert.deepEqual(job.data,{batchId})
 assert.ok(Number.isInteger(job.opts?.attempts)&&job.opts.attempts>0)
 assert.ok(Number.isInteger(job.attemptsMade)&&job.attemptsMade>=0)
 // Preserve the actual payload and retry metadata. Do not manufacture opts=1
 // or reset attemptsMade to make a failed attempt look terminal/successful.
 return {data:job.data,id:String(job.id),opts:{attempts:job.opts.attempts},attemptsMade:job.attemptsMade}
}
export async function runAnalysisChild(h,kind,input){
 const budget=childBudget(kind,h.remaining()),stem='c25-analysis-'+kind+'-child'
 const nonce=randomUUID(),argv=[process.execPath,'--require',path.join(directory,'loopback-only.cjs'),path.join(directory,'c25-analysis-child.mjs'),h.state,'--child',kind,nonce]
 const invocation={schemaVersion:1,kind,phasePid:process.pid,nonce,input,budget,argv,issuedAt:new Date().toISOString()}
 privateJson(path.join(h.state,stem+'-invocation-private.json'),invocation)
 const log=path.join(h.state,stem+'-process-private.log'),fd=fs.openSync(log,'wx',0o600)
 try{
  await new Promise((resolve,reject)=>{
   const lifecycle={schemaVersion:1,kind,phasePid:process.pid,nonce,argv,issuedMonotonicMs:performance.now(),timedOut:false,interrupted:false,terminationSignals:[]}
   const child=spawn(argv[0],argv.slice(1),{env:process.env,stdio:['ignore',fd,fd],detached:false})
   lifecycle.pid=child.pid??null
   let failure=null,killer=null,settled=false
   const signal=which=>{const event={signal:which,atMonotonicMs:performance.now()};try{event.sent=child.kill(which)}catch(error){event.errorCode=error.code??null;if(error.code!=='ESRCH')failure??=error}lifecycle.terminationSignals.push(event)}
   const stop=reason=>{lifecycle[reason==='deadline'?'timedOut':'interrupted']=true;failure??=new Error('Analysis '+kind+' child exceeded its shared deadline or was interrupted');signal('SIGTERM');killer??=setTimeout(()=>signal('SIGKILL'),budget.killGrace)}
   const timer=setTimeout(()=>stop('deadline'),budget.work),interrupt=()=>stop('interrupt')
   process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt)
   const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);if(killer)clearTimeout(killer);process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);error?reject(error):resolve()}
   child.once('error',error=>{failure??=error;lifecycle.spawnError={name:error.name,code:error.code??null}})
   // Await close, rather than just exit: stdout/stderr descriptors and the
   // actual child are reaped before the coordinator can finalize the phase.
   child.once('close',(code,signalName)=>{
    lifecycle.closedMonotonicMs=performance.now();lifecycle.code=code;lifecycle.signal=signalName;lifecycle.closeObserved=true
    try{privateJson(path.join(h.state,stem+'-process-result-private.json'),lifecycle)}catch(error){failure??=error}
    finish(failure??(code===0&&!signalName?null:new Error('Analysis '+kind+' child failed; inspect its private journal')))
   })
  })
 }finally{fs.closeSync(fd)}
 h.remaining()
 const file=stem+'-result-private.json',bytes=fs.readFileSync(path.join(h.state,file)),result=JSON.parse(bytes)
 assert.equal(result.passed,true);assert.equal(result.kind,kind);assert.equal(result.nonce,invocation.nonce)
 assert.equal(result.phasePid,process.pid);assert.notEqual(result.pid,process.pid)
 const processFile=stem+'-process-result-private.json',processBytes=fs.readFileSync(path.join(h.state,processFile)),closed=JSON.parse(processBytes)
 assert.equal(closed.pid,result.pid);assert.equal(closed.nonce,nonce);assert.deepEqual(closed.argv,argv)
 assert.equal(closed.closeObserved,true);assert.equal(closed.code,0);assert.equal(closed.signal,null)
 assert.equal(closed.timedOut,false);assert.equal(closed.interrupted,false)
 return {file,sha256:sha(bytes),result,process:{file:processFile,sha256:sha(processBytes)}}
}

async function exportChild(input){
 const {prisma,require,backend}=await runtime(),{exportQueue}=require(path.join(backend,'dist/config/queue.js'))
 const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
 assert.deepEqual(Object.keys(input).sort(),['artifactId','batchId','courseId'])
 const before=await prisma.exportBatch.findUniqueOrThrow({where:{id:input.batchId}})
 const artifactsBefore=await prisma.exportArtifact.findMany({where:{batchId:input.batchId},orderBy:{id:'asc'}})
 assert.equal(before.resourceType,'TRAINING_ANALYSIS');assert.equal(before.resourceId,input.courseId);assert.equal(before.status,'PROCESSING')
 assert.equal(artifactsBefore.length,1);assert.equal(artifactsBefore[0].id,input.artifactId);assert.equal(artifactsBefore[0].status,'PROCESSING')
 const job=await exportQueue.getJob('export-'+input.batchId),call=realExportInvocation(job,input.batchId)
 const redisBefore={state:await job.getState(),invocation:call}
 assert.ok(['waiting','paused','delayed'].includes(redisBefore.state),'A global worker must not claim the new job')
 const outcome=await runExportBatch(call) // Exactly one invocation; no replay/requeue.
 const redisJobAfter=await exportQueue.getJob('export-'+input.batchId)
 assert.ok(redisJobAfter,'Direct task invocation must not erase the queued job')
 const redisAfter={state:await redisJobAfter.getState(),invocation:realExportInvocation(redisJobAfter,input.batchId)}
 assert.deepEqual(redisAfter.invocation,redisBefore.invocation)
 const after=await prisma.exportBatch.findUniqueOrThrow({where:{id:input.batchId}})
 const artifactsAfter=await prisma.exportArtifact.findMany({where:{batchId:input.batchId},orderBy:{id:'asc'}})
 assert.equal(outcome?.status,'READY');assert.equal(outcome?.batchId,input.batchId)
 assert.equal(after.status,'READY');assert.equal(artifactsAfter.length,1);assert.equal(artifactsAfter[0].status,'READY')
 assert.equal(artifactsAfter[0].id,input.artifactId)
 assert.equal(after.fieldCount,24);assert.equal(after.recordCount,4)
 assert.deepEqual(after.options,before.options,'Worker must retain the original frozen manifest')
 return {before,after,artifactsBefore,artifactsAfter,redisBefore,redisAfter,outcome,
  execution:'ONE_REAL_QUEUED_EXPORT_THROUGH_ORIGINAL_TASK; NOT_A_BULL_SCHEDULER_COMPLETION_CLAIM'}
}

export async function processOneAnalysisExport(h,{teacher,otherTeacher,courseId,selector,analyzed,expected}){
 const {prisma}=await runtime(),{assertLongCsv}=await import('./c25-analysis-oracle.mjs')
 const route=`/courses/${courseId}/training-analysis/exports`
 const before={batches:await prisma.exportBatch.findMany({orderBy:{id:'asc'}}),artifacts:await prisma.exportArtifact.findMany({orderBy:{id:'asc'}})}
 assert.equal(before.batches.length,42);assert.equal(before.artifacts.length,42)
 h.write('c25-analysis-exports-before-private.json',before)
 const requestKey=randomUUID()
 privateJson(path.join(h.state,'c25-analysis-export-issued-private.json'),{route,requestKey,manifestHash:analyzed.manifest.manifestHash,issuedAt:new Date().toISOString()})
 const queued=await teacher.request(route,'POST',{selector,manifest:analyzed.manifest,layout:'long',format:'csv',requestKey})
 assert.equal(queued.replayed,false);assert.equal(queued.status,'PROCESSING');assert.equal(queued.artifacts.length,1)
 assert.ok(!before.batches.some(row=>row.id===queued.batchId));assert.equal(queued.artifacts[0].format,'csv')
 h.write('c25-analysis-export-queued-private.json',queued)
 const child=await runAnalysisChild(h,'export',{courseId,batchId:queued.batchId,artifactId:queued.artifacts[0].id})
 const original=queued.artifacts[0].downloadUrl
 assert.equal(original,`/api/courses/${courseId}/training-analysis/export/artifacts/${queued.artifacts[0].id}`)
 const routeFromHttp=original.slice(4),status=await teacher.request(routeFromHttp+'/status')
 assert.equal(status.status,'READY');assert.equal(status.id,queued.artifacts[0].id);assert.equal(status.batchId,queued.batchId)
 assert.equal(status.downloadUrl,original)
 const bytes=await teacher.request(status.downloadUrl.slice(4),'GET',undefined,200,true)
 const csvFile='c25-analysis-long-download-private.csv',fd=fs.openSync(path.join(h.state,csvFile),'wx',0o600)
 try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 const manifest=child.result.evidence.before.options.trainingAnalysis.manifest
 const proof=assertLongCsv(bytes,{...expected,selector,manifest,analysisPayload:analyzed})
 // These are new-course/new-artifact exact negative controls only.
 await otherTeacher.request(routeFromHttp+'/status','GET',undefined,404)
 await otherTeacher.request(routeFromHttp,'GET',undefined,404)
 const after={batches:await prisma.exportBatch.findMany({orderBy:{id:'asc'}}),artifacts:await prisma.exportArtifact.findMany({orderBy:{id:'asc'}})}
 h.write('c25-analysis-exports-after-private.json',after)
 assert.deepEqual(after.batches.filter(row=>row.id!==queued.batchId),before.batches)
 assert.deepEqual(after.artifacts.filter(row=>row.id!==queued.artifacts[0].id),before.artifacts)
 assert.equal(after.batches.length,before.batches.length+1);assert.equal(after.artifacts.length,before.artifacts.length+1)
 const evidence={batchId:queued.batchId,artifactId:queued.artifacts[0].id,download:{file:csvFile,bytes:bytes.length,sha256:sha(bytes)},
  redisStateBefore:child.result.evidence.redisBefore.state,redisStateAfter:child.result.evidence.redisAfter.state,
  execution:child.result.evidence.execution,child:{file:child.file,sha256:child.sha256},proof}
 h.write('c25-analysis-export-result-private.json',evidence)
 return evidence
}

export async function childMain(){
 assert.equal(process.argv.length,6,'Exact single-child arguments required')
 const state=process.argv[2],kind=process.argv[4],nonce=process.argv[5]
 assert.equal(process.argv[3],'--child');assert.ok(Object.hasOwn(CHILD_LIMITS,kind))
 // This prerequisite is supplied by the coordinator module. It executes before
 // the lazy runtime import and does not itself start services or credentials.
 const {readAnalysisPrerequisites}=await import('./c25-analysis-contract.mjs')
 readAnalysisPrerequisites(state)
 process.umask(0o077)
 const stem='c25-analysis-'+kind+'-child',file=path.join(state,stem+'-invocation-private.json'),info=fs.lstatSync(file)
 assert.ok(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1);assert.equal(info.mode&0o777,0o600)
 const invocation=JSON.parse(fs.readFileSync(file))
 assert.equal(invocation.schemaVersion,1);assert.equal(invocation.kind,kind);assert.equal(invocation.nonce,nonce);assert.equal(invocation.phasePid,process.ppid)
 assert.ok(Date.now()-Date.parse(invocation.issuedAt)>=0&&Date.now()-Date.parse(invocation.issuedAt)<15000)
 assert.equal(process.version,'v24.21.0');assert.equal(process.env.NODE_ENV,'test')
 for(const name of ['BACKGROUND_WORKERS_ENABLED','HEAVY_PROCESSING_ENABLED','VIDEO_PROCESSING_ENABLED'])assert.equal(process.env[name],'false')
 assert.equal(process.env.ASSESSMENT_REPORT_ASYNC_ENABLED,'true')
 const target=path.join(state,stem+'-result-private.json')
 assert.ok(!fs.existsSync(target),'Child cannot be invoked twice')
 const reservation=fs.openSync(path.join(state,stem+'-started-private.json'),'wx',0o600);fs.closeSync(reservation)
 let error,api,evidence,initialModules=[],loadedModuleClosure=[]
 const closure=()=>Object.keys(api.require.cache).sort().filter(file=>fs.existsSync(file)).map(file=>({path:path.relative(api.backend,file),sha256:sha(fs.readFileSync(file))}))
 try{
  api=await runtime();initialModules=closure()
  evidence=kind==='export'?await exportChild(invocation.input):await (await import('./c25-analysis-http.mjs')).processReportChild(invocation.input)
 }catch(caught){error=caught}
 finally{
  if(api){try{loadedModuleClosure=closure();assert.ok(initialModules.every(row=>loadedModuleClosure.some(after=>after.path===row.path&&after.sha256===row.sha256)),'Loaded module bytes changed')}catch(caught){error??=caught}try{await api.closeQueues()}catch(caught){error??=caught}try{await api.prisma.$disconnect()}catch(caught){error??=caught}}
  if(error)fs.writeFileSync(path.join(state,stem+'-error-private.log'),String(error.stack??error),{flag:'wx',mode:0o600})
  privateJson(target,{schemaVersion:1,passed:!error,kind,nonce,pid:process.pid,phasePid:invocation.phasePid,loadedModuleClosure,evidence,...(error?{error:publicFailure(error)}:{})})
 }
 if(error)process.exitCode=1
}
