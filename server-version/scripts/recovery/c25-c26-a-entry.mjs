/** Explicit A driver CLI. The outer launcher must already hold the measurement
 * lock and have validated fresh recovery/source/producer identities and audits.
 * This is not a standalone service/bootstrap or permission to measure. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {runC26MeasuredA} from './c25-c26-a-driver.mjs'
import {loadC26IndependentAnalysis} from './c25-c26-analysis-scope.mjs'
const ROOT='/workspace/scratch/5a77e8bdc1ae'
export const STATE=ROOT+'/eduk12_c26_a_04'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const privateRead=file=>{const stat=fs.lstatSync(file);assert.ok(stat.isFile()&&!stat.isSymbolicLink());assert.equal(stat.nlink,1);assert.equal(stat.mode&0o777,0o600);assert.equal(stat.uid,process.getuid());return JSON.parse(fs.readFileSync(file,'utf8'))}
export function driverDeadlineContract(invocation,now=()=>process.hrtime.bigint()){
 for(const key of ['startedMonotonicNs','workDeadlineMonotonicNs','deadlineMonotonicNs','overallDeadlineMonotonicNs'])assert.match(invocation[key],/^[0-9]+$/)
 assert.equal(invocation.totalBudgetSeconds,1200);assert.equal(invocation.cleanupReserveSeconds,60)
 assert.equal(invocation.finalAuditReserveSeconds,300);assert.equal(invocation.materialReserveSeconds,60);assert.equal(invocation.finalVerificationAndStopReserveSeconds,60)
 const started=BigInt(invocation.startedMonotonicNs),work=BigInt(invocation.workDeadlineMonotonicNs),driver=BigInt(invocation.deadlineMonotonicNs),overall=BigInt(invocation.overallDeadlineMonotonicNs),second=1000000000n
 assert.equal(overall-started,1200n*second,'overall budget cannot expand')
 assert.equal(overall-driver,420n*second,'final audit/materials/verification-stop stay within overall')
 assert.equal(driver-work,60n*second,'driver cleanup reserve is real')
 assert.ok(now()>=started&&now()<work,'work deadline already exhausted')
 const remaining=end=>()=>{const value=Number(end-now())/1e6;assert.ok(value>0&&value<=1200000,'absolute C26 deadline');return value}
 return {remainingMs:remaining(driver),workRemainingMs:remaining(work)}
}
export function apiRssObservation(pid,read=filename=>fs.readFileSync(filename,'utf8')){
 assert.ok(Number.isSafeInteger(pid)&&pid>0);const filename=`/proc/${pid}/status`
 try{const match=/^VmRSS:\s+(\d+) kB$/m.exec(read(filename));assert.ok(match,'API RSS status malformed');return {status:'OBSERVED',pid,path:filename,bytes:Number(match[1])*1024}}
 catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;return {status:'NOT_OBSERVED',pid,path:filename,operation:'READ_API_STATUS',errno:error.code,ownedKnown:true,bytes:null}}
}
export async function main(){
 process.umask(0o077);assert.equal(process.version,'v24.21.0');assert.equal(process.argv.length,3);assert.equal(process.argv[2],STATE)
 assert.equal(fs.realpathSync(STATE),STATE);assert.equal(fs.statSync(STATE).mode&0o777,0o700)
 const invocation=privateRead(path.join(STATE,'c25-c26-driver-invocation-private.json')),runtime=privateRead(path.join(STATE,'c25-c26-effective-runtime-private.json'))
 assert.equal(invocation.schemaVersion,1);assert.equal(invocation.parentPid,process.ppid);assert.equal(invocation.database,'eduk12_c25_joint_restore');assert.equal(invocation.scope,'A_ONCE_NO_AUTOMATIC_B')
 const {remainingMs,workRemainingMs}=driverDeadlineContract(invocation)
 for(const [key,value]of Object.entries(runtime))assert.equal(process.env[key],value,`launcher runtime ${key} mismatch`)
 const log=fs.openSync(path.join(STATE,'c25-c26-driver-events-private.jsonl'),'wx',0o600),digest=createHash('sha256');let bytes=0,failed
 const write=(name,value)=>{
  assert.match(name,/^c25-c26-[a-z0-9-]+\.json$/);const filename=path.join(STATE,name),temp=filename+'.tmp';assert.ok(!fs.existsSync(temp))
  if(fs.existsSync(filename)){const stat=fs.lstatSync(filename);assert.ok(stat.isFile()&&stat.nlink===1&&(stat.mode&0o777)===0o600&&stat.uid===process.getuid())}
  const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value)+'\n');fs.fsyncSync(fd)}finally{fs.closeSync(fd)}fs.renameSync(temp,filename)
 }
 const record=value=>{
  // Full observer raw is already durably retained in the observer's two files.
  // Bind it here without making a third permanent copy of every full frame.
  const item=value.stage==='OBSERVER_RAW'?{stage:value.stage,sequence:value.sequence,kind:value.value?.kind??value.value?.stage,sha256:sha(JSON.stringify(value.value))}:value
  const line=Buffer.from(JSON.stringify(item)+'\n');assert.ok(bytes+line.length<=32*1024**2,'driver event journal budget');fs.writeSync(log,line);digest.update(line);bytes+=line.length
 }
 const owned=new Map()
 const ownedRegistryChanged=entries=>{for(const row of entries)owned.set(`${row.pid}:${row.startTicks}`,row);write('c25-c26-owned-processes-private.json',{schemaVersion:1,parentPid:process.pid,current:entries,all:[...owned.values()]})}
 const readResources=api=>{
  const stat=fs.statfsSync(ROOT),tmp=fs.statfsSync('/tmp'),memory=Number(/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'))?.[1])*1024
  const value={diskBytes:stat.bavail*stat.bsize,tmpBytes:tmp.bavail*tmp.bsize,memoryBytes:memory}
  if(api){const rss=apiRssObservation(api.pid);if(rss.status==='OBSERVED')value.apiRssBytes=rss.bytes;else record({stage:'API_RSS_NOT_OBSERVED',observation:rss})} // API lifecycle health is checked independently by the driver.
  return value
 }
 const read=name=>{
  if(name==='fixture-private.json')return privateRead(path.join(ROOT,'eduk12_c21_http_01','fixture-private.json'))
  if(name==='c25-existing-fixture-private.json')return privateRead(path.join(ROOT,'eduk12_c25_continuation_02','c25-fixture-private.json'))
  assert.match(name,/^c25-c26-[a-z0-9-]+\.json$/);return privateRead(path.join(STATE,name))
 }
 try{
  await runC26MeasuredA({directory:STATE,node:process.execPath,env:{...runtime,PATH:process.env.PATH,HOME:STATE,TMPDIR:STATE,LANG:'C.UTF-8',TZ:'UTC',NODE_ENV:'test'},baseIdentities:invocation.baseIdentities,connectionOptions:invocation.connectionOptions,remainingMs,workRemainingMs,read,write,record,readResources,ownedRegistryChanged,loadIndependentScope:(h,api)=>loadC26IndependentAnalysis(h,api,read('c25-c26-protected-rows-private.json').rows)})
 }catch(error){failed=error;write('c25-c26-entry-error-private.json',{name:error.name,stack:String(error.stack??error)})}
 finally{
  fs.fsyncSync(log);fs.closeSync(log)
  const result={schemaVersion:1,passed:!failed,bytes,sha256:digest.digest('hex')}
  try{if(!failed)remainingMs();write('c25-c26-driver-journal-result.json',result);if(!failed)remainingMs()}catch(error){failed??=error;result.passed=false;result.error={name:error.name};write('c25-c26-driver-journal-result.json',result)}
 }
 if(failed){process.stderr.write('C26 A failed; see private evidence.\n');process.exitCode=1}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(`C26 entry rejected (${error.name}); no retry.\n`);process.exitCode=1})
