/** Fixed-rate actual Teacher POST -> GET feedback, one fresh attempt per arrival. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {setTimeout as delay} from 'node:timers/promises'
const [out,base,rateText='30',durationText='30']=process.argv.slice(2),rate=Number(rateText),seconds=Number(durationText),total=rate*seconds
assert(out&&base&&Number.isSafeInteger(total)&&!existsSync(out+'/native-results.json'))
const fixtures=JSON.parse(readFileSync(out+'/fixtures.json','utf8'));assert(fixtures.length>=total+4)
const stats=xs=>{const a=xs.toSorted((a,b)=>a-b);return {n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1)}}
async function journey(f){
 const started=performance.now()
 try{
  const response=await fetch(base+f.path,{method:'POST',headers:f.headers,body:JSON.stringify(f.body),signal:AbortSignal.timeout(60000)})
  const receipt=await response.json(),submitMs=performance.now()-started
  if(response.status!==200||receipt.data?.status!=='COMPLETED'||receipt.data.replayed) return {success:false,submitMs,status:response.status,receipt}
  if(!f.feedbackPath)return {success:true,status:response.status,submitMs,feedbackMs:0,totalMs:performance.now()-started}
  const reportStart=performance.now(),read=await fetch(base+f.feedbackPath,{headers:f.headers,signal:AbortSignal.timeout(60000)}),report=await read.json()
  return {success:read.status===200&&report.data?.state==='READY'&&report.data.units?.length===9,status:response.status,feedbackStatus:read.status,submitMs,feedbackMs:performance.now()-reportStart,totalMs:performance.now()-started,...(read.status===200?{}:{report})}
 }catch(error){return {success:false,totalMs:performance.now()-started,error:String(error)}}
}
for(const f of fixtures.slice(total,total+4))assert((await journey(f)).success)
const warmed=await(await fetch(base+'/resources')).json()
assert.equal(warmed.transactions.filter(t=>t.finalWrite).length,4,'Transaction probe must recognize all four warmup writes')
assert.equal(warmed.transactions.filter(t=>t.finalWrite&&Number.isFinite(t.parentLockUntilSettlementMs)).length,4,'Transaction probe must recognize all four parent locks')
await fetch(base+'/reset-observation',{method:'POST'})
const before=await(await fetch(base+'/resources')).json(),pending=[]
let start=performance.now()+100
const databaseSamples=[]
let probe,probeTimer,probing=false
if(process.env.PG_PROBE_DATABASE_URL){
 const url=new URL(process.env.PG_PROBE_DATABASE_URL);assert(['127.0.0.1','localhost'].includes(url.hostname)&&/test/i.test(url.pathname));url.searchParams.set('connection_limit','1')
 const {PrismaClient}=await import('@prisma/client');probe=new PrismaClient({datasources:{db:{url:url.href}}})
 await probe.$connect()
 probeTimer=setInterval(async()=>{
  if(probing)return;probing=true
  try{const [sample]=await probe.$queryRawUnsafe("SELECT COUNT(*)::int AS connections,COUNT(*) FILTER(WHERE state='active')::int AS active,COUNT(*) FILTER(WHERE state='idle in transaction')::int AS idleInTransaction,COUNT(*) FILTER(WHERE wait_event_type='Lock')::int AS lockWaiting FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()");databaseSamples.push({ms:performance.now()-start,...sample})}
  finally{probing=false}
 },200)
}
start=performance.now()+100
let inFlight=0,peakInFlight=0
for(let i=0;i<total;i++){
 const deadline=start+i*1000/rate
 for(let left=deadline-performance.now();left>0;left=deadline-performance.now())await delay(Math.max(1,Math.floor(left)))
 const sent=performance.now()-start;inFlight++;peakInFlight=Math.max(peakInFlight,inFlight)
 pending.push(journey(fixtures[i]).then(result=>{inFlight--;return {sample:i+1,scheduledMs:i*1000/rate,sentMs:sent,completedMs:performance.now()-start,...result}}))
}
await delay(Math.max(0,start+seconds*1000-performance.now()))
const inFlightAtWindowEnd=inFlight,rows=await Promise.all(pending),after=await(await fetch(base+'/resources')).json()
if(probeTimer)clearInterval(probeTimer)
while(probing)await delay(1)
await probe?.$disconnect()
const finalWrites=(after.transactions??[]).filter(t=>t.finalWrite)
const transactionLatency=Object.fromEntries(['acquireAndBeginMs','callbackMs','settleAndCommitMs','wallMs','parentLockUntilSettlementMs'].map(key=>[key,stats(finalWrites.map(t=>t[key]).filter(Number.isFinite))]))
const successful=rows.filter(r=>r.success)
const result={scope:fixtures[0].feedbackPath?'Real signed-in Teacher V2 POST -> direct GET feedback, fresh 303-question / 9-unit attempts, real frozen authority and PostgreSQL':'Real signed-in Training V2 receipt-only POST, fresh 303-question / 9-unit attempts, real published feedback policy and PostgreSQL',rate,seconds,total,success:successful.length,peakInFlight,inFlightAtWindowEnd,latency:{submit:stats(successful.map(r=>r.submitMs)),feedback:stats(successful.map(r=>r.feedbackMs)),total:stats(successful.map(r=>r.totalMs)),schedulerLag:stats(rows.map(r=>r.sentMs-r.scheduledMs))},transactionLatency,databaseSamples,before,after,rows}
writeFileSync(out+'/native-results.json',JSON.stringify(result,null,2))
const verification=await(await fetch(base+'/verify')).json();writeFileSync(out+'/native-verification.json',JSON.stringify(verification,null,2))
console.log(JSON.stringify({success:result.success,total,latency:result.latency,peakInFlight,inFlightAtWindowEnd,restored:verification.restored,stateMismatches:verification.stateMismatches,childCounts:verification.childCounts}))
assert.equal(successful.length,total);assert.equal(finalWrites.length,total);assert.equal(verification.restored,total+4);assert.equal(verification.stateMismatches,0);assert.deepEqual(verification.childCounts,{assessments:0,reports:0})
