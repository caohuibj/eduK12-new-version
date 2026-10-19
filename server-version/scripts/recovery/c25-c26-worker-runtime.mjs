/** Leaf-worker lifecycle. Imports are inert; only the leaf CLI invokes main. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {reportNodeResources} from './c25-c26-observer.mjs'
import {runReportTask,runExportTask} from './c25-c26-worker-tasks.mjs'
export const workerSha=bytes=>createHash('sha256').update(bytes).digest('hex')
export function workerPrivateDirectory(directory){
 assert.equal(path.resolve(directory),directory);assert.equal(fs.realpathSync(directory),directory)
 const stat=fs.lstatSync(directory);assert.ok(stat.isDirectory());assert.equal(stat.mode&0o777,0o700);assert.equal(stat.uid,process.getuid())
 for(let current=directory;;current=path.dirname(current)){assert.ok(!fs.lstatSync(current).isSymbolicLink());if(current===path.dirname(current))break}
}
export function workerRead(file){
 workerPrivateDirectory(path.dirname(file));const stat=fs.lstatSync(file)
 assert.ok(stat.isFile());assert.equal(stat.nlink,1);assert.equal(stat.mode&0o777,0o600);assert.equal(stat.uid,process.getuid());assert.ok(stat.size<=4*1024*1024)
 return JSON.parse(fs.readFileSync(file,'utf8'))
}
export function workerWrite(file,value){
 workerPrivateDirectory(path.dirname(file));const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');assert.ok(bytes.length<=4*1024*1024)
 const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
 return workerSha(bytes)
}
const protocol='c26:worker'
export async function workerMain(){
 process.umask(0o077)
 assert.equal(process.version,'v24.21.0');assert.equal(process.argv.length,3)
 const inputFile=process.argv[2],invocation=workerRead(inputFile),directory=path.dirname(inputFile)
 assert.equal(path.basename(inputFile),'invocation.json')
 assert.deepEqual(Object.keys(invocation).sort(),['input','kind','nonce','parentPid','schemaVersion'])
 const {kind,nonce}=invocation;assert.equal(invocation.schemaVersion,1);assert.ok(['report','export'].includes(kind));assert.equal(invocation.parentPid,process.ppid)
 assert.match(nonce,/^[a-f0-9]{64}$/);assert.equal(process.env.C26_PROBE_NONCE,nonce);assert.equal(process.env.C26_PROBE_ROLE,kind)
 for(const [key,value]of Object.entries({NODE_ENV:'test',BACKGROUND_WORKERS_ENABLED:'false',ASSESSMENT_REPORT_ASYNC_ENABLED:'true',HEAVY_PROCESSING_ENABLED:'false',VIDEO_PROCESSING_ENABLED:'false'}))assert.equal(process.env[key],value,key)
 const deadline=BigInt(process.env.C26_WORKER_DEADLINE_NS),remaining=()=>{const n=Number(deadline-process.hrtime.bigint())/1e6;assert.ok(n>0,'worker aggregate deadline');return n}
 assert.ok(remaining()<=90000)
 const result={schemaVersion:1,passed:false,kind,nonce,pid:process.pid,parentPid:process.ppid,inputSha256:workerSha(fs.readFileSync(inputFile)),argv:process.argv.slice(),stages:[],cleanup:[],moduleClosure:[]}
 workerWrite(path.join(directory,'started.json'),{...result,startedAt:new Date().toISOString()})
 const role=kind+'_worker',ackOptions=()=>({nonce,role,timeoutMs:Math.max(1,Math.floor(Math.min(2000,remaining())))})
 const cleanups=[];let api,primaryError=null,pending=null,sequence=0,protocolError=null
 const send=value=>new Promise((resolve,reject)=>process.send({type:protocol,nonce,pid:process.pid,...value},error=>error?reject(error):resolve()))
 const fault=error=>{protocolError??=error;if(pending){clearTimeout(pending.timer);pending.reject(error);pending=null}}
 const message=value=>{if(value?.type!==protocol)return;try{assert.ok(pending,'unsolicited worker permission');assert.deepEqual(Object.keys(value).sort(),['action','nonce','sequence','type']);assert.equal(value.nonce,nonce);assert.equal(value.sequence,pending.sequence);assert.equal(value.action,pending.action);const p=pending;pending=null;clearTimeout(p.timer);p.resolve()}catch(error){fault(error)}}
 const permission=async(stage,action,extra={})=>{
  if(protocolError)throw protocolError
  const current=++sequence,wait=new Promise((resolve,reject)=>{pending={sequence:current,action,resolve,reject,timer:setTimeout(()=>fault(new Error('worker permission deadline')),Math.max(1,Math.floor(remaining())))}});wait.catch(()=>{})
  result.stages.push({stage,monotonicNs:process.hrtime.bigint().toString()});await send({stage,sequence:current,...extra});await wait
 }
 const disconnected=()=>fault(new Error('worker parent disconnected'))
 process.on('message',message);process.on('disconnect',disconnected)
 try{
  await reportNodeResources({...ackOptions(),phase:'start'})
  await permission('BOOTED','LOAD') // Registration is complete before any client constructor/import.
  api=await import('./c20-materials-client.mjs')
  await permission('LOADED','WORK')
  try{result.task=await (kind==='report'?runReportTask:runExportTask)(api,invocation.input,{remaining,registerCleanup:fn=>cleanups.push(fn)})}catch(error){primaryError=error}
  await permission('TASK_DONE','DISCONNECT',{passed:!primaryError}) // Parent awaits fresh PG attribution BEFORE cleanup.
 }catch(error){primaryError??=error}
 finally{
  // Even failed ownership/IPC proof must not skip local disconnection. Parent
  // keeps the run false and its same-deadline group supervisor is independent.
  for(const [name,fn]of [...cleanups.map((fn,i)=>['registered-'+i,fn]),...(api?[['queues',()=>api.closeQueues()],['prisma',()=>api.prisma.$disconnect()]]:[])]){
   try{remaining();await fn();result.cleanup.push({name,closed:true})}catch(error){primaryError??=error;result.cleanup.push({name,closed:false,errorClass:error.name})}
  }
 }
 try{
  if(!protocolError&&api)await permission('CLEANED','FINISH',{passed:!primaryError})
  if(api)result.moduleClosure=Object.keys(api.require.cache).sort().map(file=>({file,sha256:workerSha(fs.readFileSync(file))}))
  if(protocolError)primaryError??=protocolError
  if(primaryError)result.error={name:primaryError.name,stack:String(primaryError.stack??primaryError)}
  result.passed=!primaryError;result.finishedAt=new Date().toISOString();workerWrite(path.join(directory,'result-private.json'),result)
  process.off('message',message);process.off('disconnect',disconnected)
  await reportNodeResources({...ackOptions(),phase:'terminal'})
 }catch(error){primaryError??=error;process.off('message',message);process.off('disconnect',disconnected);if(process.connected)process.disconnect()}
 if(primaryError){process.exitCode=1;throw primaryError}
 return result
}
