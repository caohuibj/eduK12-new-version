/** Pure, in-memory business runtime for actual CLI process contracts only. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {event} from './c25-analysis-child-fixture.mjs'

const state=process.env.C25_CHILD_CONTRACT_STATE
const config=JSON.parse(fs.readFileSync(path.join(state,'fixture-config.json')))
assert.equal(config.scope,'SYNTHETIC_CLI_LIFECYCLE_ONLY')
event('runtime-loaded',{argv:process.argv})
const live=setInterval(()=>{},1000)
process.on('SIGTERM',()=>event('sigterm-observed'))
process.on('exit',code=>event('runtime-exit',{code}))
const copy=value=>structuredClone(value)
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))
let completed=false,claimed=0
const attempts=config.kind==='report'?config.input.attempts:[]
const jobs=attempts.map(row=>({id:row.jobId,attemptId:row.attemptId,attemptEpoch:row.attemptEpoch,status:'PENDING',attemptCount:0}))
const batch={id:config.input.batchId,resourceType:'TRAINING_ANALYSIS',resourceId:config.input.courseId,status:'PROCESSING',fieldCount:24,recordCount:4,options:{trainingAnalysis:{manifest:{immutable:'fixture-manifest'}}}}
const artifact={id:config.input.artifactId,batchId:config.input.batchId,status:'PROCESSING'}
async function task(kind){
 event('task-start',{kind})
 assert.equal(kind,config.kind)
 if(config.mode==='error')throw new Error('Synthetic '+kind+' task failure')
 if(config.mode==='timeout')await new Promise(()=>{})
 event('task-complete',{kind})
}
export const backend=path.dirname(fileURLToPath(import.meta.url))
export const prisma={
 compositeReportJob:{
  async findMany(){return copy(jobs)},
  async findUniqueOrThrow({where}){const job=jobs.find(row=>row.id===where.id);assert.ok(job);return {...copy(job),status:'READY',attemptCount:1}},
 },
 exportBatch:{async findUniqueOrThrow(){return {...copy(batch),status:completed?'READY':'PROCESSING'}}},
 exportArtifact:{async findMany(){return [{...copy(artifact),status:completed?'READY':'PROCESSING'}]}},
 async $disconnect(){await pause(20);event('prisma-disconnected');clearInterval(live)},
}
export async function closeQueues(){event('queues-close-start');await pause(20);event('queues-closed')}
export class PrismaClient{
 constructor(){event('gate-created')}
 async $transaction(fn){
  return fn({
   async $executeRawUnsafe(){return 0},
   async $queryRawUnsafe(){return [...config.input.oldJobIds].sort().map(id=>({id}))},
  })
 }
 async $disconnect(){event('gate-disconnected')}
}
const job={id:'export-'+config.input.batchId,data:{batchId:config.input.batchId},opts:{attempts:3},attemptsMade:1,async getState(){return 'waiting'}}
const modules={
 'dist/config/queue.js':{exportQueue:{async getJob(id){assert.equal(id,job.id);return job}}},
 'dist/workers/exportBatchTask.js':{async runExportBatch(call){assert.equal(call.attemptsMade,1);assert.equal(call.opts.attempts,3);await task('export');completed=true;return {status:'READY',batchId:config.input.batchId}}},
 'dist/modules/assessment-runtime/report-outbox.service.js':{async claimCompositeReportJob(){const found=jobs[claimed++];assert.ok(found);return {...copy(found),attemptCount:1}}},
 'dist/workers/compositeReportWorker.js':{async processCompositeReportJob(){await task('report')}},
}
export function require(file){const relative=path.relative(backend,file);assert.ok(Object.hasOwn(modules,relative),'Unexpected production require: '+relative);event('business-module-request',{relative});return modules[relative]}
require.cache={[fileURLToPath(import.meta.url)]:{}}
