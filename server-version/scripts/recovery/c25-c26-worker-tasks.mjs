/** One original task per fresh C26 child. Inert until called with its real API.
 * No global processor registration, claim loop, queue rewrite or retry. */
import assert from 'node:assert/strict'
import path from 'node:path'
import {realExportInvocation} from './c25-analysis-export.mjs'

export async function runReportTask(api,input,{remaining,registerCleanup}){
 assert.deepEqual(Object.keys(input).sort(),['attemptEpoch','attemptId','jobId','oldJobIds'])
 assert.ok(Number.isSafeInteger(input.attemptEpoch)&&input.attemptEpoch>0)
 assert.ok(Array.isArray(input.oldJobIds)&&new Set(input.oldJobIds).size===input.oldJobIds.length)
 const {prisma,PrismaClient,require,backend}=api
 const {claimCompositeReportJob}=require(path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))
 const {processCompositeReportJob}=require(path.join(backend,'dist/workers/compositeReportWorker.js'))
 const url=new URL(process.env.DATABASE_URL)
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.username,'eduk12_runtime');assert.equal(url.pathname,'/eduk12_c25_joint_restore')
 assert.match(url.searchParams.get('application_name')??'',/^c26:report:[a-f0-9]{16}$/)
 url.searchParams.set('connection_limit','1') // Keep the SAME owned worker label.
 const gate=new PrismaClient({datasources:{db:{url:url.toString()}}})
 registerCleanup(()=>gate.$disconnect()) // Defer until parent grants fresh close proof.
 let release,arrived,rejectReady,lockedRows
 const hold=new Promise(resolve=>release=resolve),ready=new Promise((resolve,reject)=>{arrived=resolve;rejectReady=reject})
 const budget=Math.floor(remaining());assert.ok(budget>1000&&budget<=90000)
 const transaction=gate.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET LOCAL lock_timeout = 5000');await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 8000')
  lockedRows=await tx.$queryRawUnsafe('SELECT id FROM composite_report_jobs WHERE NOT (attempt_id=ANY($1::text[])) ORDER BY id FOR UPDATE',[input.attemptId])
  assert.deepEqual(lockedRows.map(row=>row.id),[...input.oldJobIds].sort());arrived();await hold
 },{maxWait:Math.min(3000,budget),timeout:budget})
 transaction.catch(rejectReady)
 try{
  await ready;remaining()
  const before=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:input.jobId}})
  assert.equal(before.attemptId,input.attemptId);assert.equal(before.attemptEpoch,input.attemptEpoch);assert.equal(before.status,'PENDING');assert.equal(before.attemptCount,0);assert.equal(before.budgetHeld,true)
  const claimed=await claimCompositeReportJob();assert.ok(claimed);assert.equal(claimed.id,input.jobId);assert.equal(claimed.attemptId,input.attemptId);assert.equal(claimed.attemptEpoch,input.attemptEpoch);assert.equal(claimed.attemptCount,1)
  remaining();await processCompositeReportJob(claimed);remaining()
  const after=await prisma.compositeReportJob.findUniqueOrThrow({where:{id:input.jobId}})
  assert.equal(after.status,'READY');assert.equal(after.attemptCount,1);assert.equal(after.budgetHeld,false)
  return {before,claimed,after,lockedOldJobIds:lockedRows.map(row=>row.id),execution:'ONE_ORIGINAL_REPORT_CLAIM_AND_PROCESS; NO_RETRY'}
 }finally{release();await transaction}
}

export async function runExportTask(api,input,{remaining}){
 assert.deepEqual(Object.keys(input).sort(),['artifactId','batchId','productId'])
 const {prisma,require,backend}=api
 const {exportQueue}=require(path.join(backend,'dist/config/queue.js'))
 const {runExportBatch}=require(path.join(backend,'dist/workers/exportBatchTask.js'))
 const before=await prisma.exportBatch.findUniqueOrThrow({where:{id:input.batchId}})
 const artifactsBefore=await prisma.exportArtifact.findMany({where:{batchId:input.batchId},orderBy:{id:'asc'}})
 assert.equal(before.resourceType,'COMPOSITE');assert.equal(before.resourceId,input.productId);assert.equal(before.status,'PROCESSING');assert.equal(before.recordCount,0)
 assert.equal(artifactsBefore.length,1);assert.equal(artifactsBefore[0].id,input.artifactId);assert.equal(artifactsBefore[0].status,'PROCESSING')
 const job=await exportQueue.getJob('export-'+input.batchId),call=realExportInvocation(job,input.batchId)
 const redisBefore={state:await job.getState(),invocation:call};assert.ok(['waiting','paused','delayed'].includes(redisBefore.state))
 remaining();const outcome=await runExportBatch(call);remaining()
 const queued=await exportQueue.getJob('export-'+input.batchId);assert.ok(queued)
 const redisAfter={state:await queued.getState(),invocation:realExportInvocation(queued,input.batchId)}
 assert.deepEqual(redisAfter.invocation,redisBefore.invocation)
 const after=await prisma.exportBatch.findUniqueOrThrow({where:{id:input.batchId}})
 const artifactsAfter=await prisma.exportArtifact.findMany({where:{batchId:input.batchId},orderBy:{id:'asc'}})
 assert.equal(outcome?.status,'READY');assert.equal(outcome?.batchId,input.batchId);assert.equal(after.status,'READY');assert.equal(after.recordCount,1)
 assert.equal(artifactsAfter.length,1);assert.equal(artifactsAfter[0].id,input.artifactId);assert.equal(artifactsAfter[0].status,'READY');assert.deepEqual(after.options,before.options)
 return {before,after,artifactsBefore,artifactsAfter,redisBefore,redisAfter,outcome,execution:'ONE_REAL_QUEUED_EXPORT_THROUGH_ORIGINAL_TASK; NOT_BULL_SCHEDULER_COMPLETION'}
}
