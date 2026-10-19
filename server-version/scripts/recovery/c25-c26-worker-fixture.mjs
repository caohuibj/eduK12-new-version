/** No-service loader boundary. Real leaf/runtime/tasks/probe/production metric
 * consumer remain loaded. Only external task/Prisma/Redis I/O is synthetic. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {registerHooks,createRequire} from 'node:module'
const here=new URL(import.meta.url),directory=process.env.C26_WORKER_FIXTURE_DIRECTORY
assert.ok(directory&&path.isAbsolute(directory));const config=JSON.parse(fs.readFileSync(path.join(directory,'fixture-config.json')))
assert.equal(config.scope,'NO_SERVICE_WORKER_BOUNDARY')
const event=(name,extra={})=>fs.appendFileSync(path.join(directory,'fixture-events.jsonl'),JSON.stringify({name,pid:process.pid,monotonicNs:process.hrtime.bigint().toString(),...extra})+'\n',{mode:0o600})
if(!here.search){
 const target=new URL('c20-materials-client.mjs',here).href,replacement=new URL(here);replacement.search='runtime'
 const observed=['c25-c26-worker-child.mjs','c25-c26-worker-runtime.mjs','c25-c26-worker-tasks.mjs','c25-analysis-export.mjs'].map(name=>new URL(name,here).href)
 registerHooks({resolve(specifier,context,next){let resolved;try{resolved=new URL(specifier,context.parentURL).href}catch{};if(resolved===target)return {url:replacement.href,shortCircuit:true};return next(specifier,context)},load(url,context,next){const value=next(url,context);if(observed.includes(url))event('real-module-loaded',{url});return value}})
}
export const backend=path.resolve(path.dirname(fileURLToPath(here)),'../../backend')
const realRequire=createRequire(path.join(backend,'package.json')),callbacks=new Map()
let processed=false,gateOpen=false,claimCalls=0,taskCalls=0
const query=name=>{event(name);callbacks.get('query')?.({duration:0.75})}
const cloned=value=>structuredClone(value)
const pending={id:'job-new',attemptId:'parent-new',attemptEpoch:1,status:'PENDING',attemptCount:0,budgetHeld:true}
const batch={id:'batch-new',resourceType:'COMPOSITE',resourceId:'product-new',status:'PROCESSING',recordCount:0,options:{detail:'full',format:'csv'}}
const artifact={id:'artifact-new',batchId:'batch-new',resourceId:'product-new',status:'PROCESSING'}
const job={id:'export-batch-new',data:{batchId:'batch-new'},opts:{attempts:2},attemptsMade:1,getState:async()=>{query('redis-state');return 'waiting'}}
export const prisma={
 $on:(name,fn)=>callbacks.set(name,fn),$use:()=>{},
 $disconnect:async()=>{assert.ok(fs.existsSync(path.join(directory,'close-permission.json')),'prisma cleanup before fresh parent proof');event('prisma-disconnect')},
 compositeReportJob:{findUniqueOrThrow:async({where})=>{assert.deepEqual(where,{id:'job-new'});query('report-row');return {...pending,...(processed?{status:'READY',attemptCount:1,budgetHeld:false}:{})}}},
 exportBatch:{findUniqueOrThrow:async({where})=>{assert.deepEqual(where,{id:'batch-new'});query('batch-row');return {...cloned(batch),...(processed?{status:'READY',recordCount:1}:{})}}},
 exportArtifact:{findMany:async args=>{assert.deepEqual(args,{where:{batchId:'batch-new'},orderBy:{id:'asc'}});query('artifact-row');return [{...artifact,...(processed?{status:'READY'}:{})}]}},
}
export class PrismaClient{
 constructor(options){const url=new URL(options.datasources.db.url);assert.equal(url.searchParams.get('connection_limit'),'1');assert.match(url.searchParams.get('application_name'),/^c26:report:/);event('gate-created')}
 async $transaction(fn,options){assert.ok(options.timeout>1000&&options.timeout<=90000);gateOpen=true;try{return await fn({$executeRawUnsafe:async text=>{assert.match(text,/^SET LOCAL (lock|statement)_timeout = \d+$/);event('gate-setting')},$queryRawUnsafe:async(text,ids)=>{assert.match(text,/ORDER BY id FOR UPDATE$/);assert.deepEqual(ids,['parent-new']);event('gate-lock');return [{id:'old-a'},{id:'old-b'}]}})}finally{gateOpen=false;event('gate-released')}}
 async $disconnect(){assert.equal(gateOpen,false);assert.ok(fs.existsSync(path.join(directory,'close-permission.json')));event('gate-disconnect')}
}
const act=async name=>{taskCalls++;assert.equal(taskCalls,1);query(name);if(config.mode==='error')throw new TypeError('SYNTHETIC_TASK_ERROR_PRIVATE');if(config.mode==='hang'){process.on('SIGTERM',()=>{});await new Promise(()=>{})}processed=true}
export function require(filename){
 assert.ok(path.isAbsolute(filename));event('require-original-task',{filename})
 if(filename===path.join(backend,'dist/modules/assessment-runtime/report-outbox.service.js'))return {claimCompositeReportJob:async()=>{assert.equal(gateOpen,true);claimCalls++;assert.equal(claimCalls,1);query('report-claim');return {...pending,status:'PROCESSING',attemptCount:1}}}
 if(filename===path.join(backend,'dist/workers/compositeReportWorker.js'))return {processCompositeReportJob:async row=>{assert.equal(gateOpen,true);assert.equal(row.id,pending.id);assert.equal(row.attemptCount,1);await act('report-process')}}
 if(filename===path.join(backend,'dist/config/queue.js'))return {exportQueue:{getJob:async id=>{assert.equal(id,job.id);query('redis-get');return job}}}
 if(filename===path.join(backend,'dist/workers/exportBatchTask.js'))return {runExportBatch:async call=>{assert.deepEqual(call,{data:job.data,id:job.id,opts:{attempts:2},attemptsMade:1});await act('export-process');return {status:'READY',batchId:batch.id}}}
 throw new Error('UNEXPECTED_OR_GLOBAL_PROCESSOR_IMPORT')
}
require.cache=realRequire.cache
export async function closeQueues(){assert.ok(fs.existsSync(path.join(directory,'close-permission.json')),'queue cleanup before fresh parent proof');event('queues-close')}
if(here.search){
 const net=realRequire('node:net');net.Socket.prototype.connect=function(){throw Error('No worker fixture network allowed')}
 const Module=realRequire('node:module'),load=Module._load
 globalThis.prisma=prisma
 Module._load=function(name,parent,...rest){if(name==='@prisma/client'&&parent?.filename===path.join(backend,'dist/config/database.js'))return {PrismaClient:class{constructor(){throw Error('No real Prisma construction')}}};return Reflect.apply(load,this,[name,parent,...rest])}
 try{assert.equal(realRequire(path.join(backend,'dist/config/database.js')).prisma,prisma)}finally{Module._load=load}
 const metrics=realRequire(path.join(backend,'dist/services/runtimeObservability.js'));metrics.runtimeMetricLines=()=>{throw Error('No metrics scrape')};metrics.resetRuntimeObservabilityForTests=()=>{throw Error('No reset')}
 event('real-production-consumer-loaded')
}
