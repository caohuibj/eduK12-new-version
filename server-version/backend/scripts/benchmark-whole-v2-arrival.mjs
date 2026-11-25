/** Fixed-arrival-rate load. Starts are paced by absolute deadlines, never by replies. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const [root, base, rateText='30', durationText='30'] = process.argv.slice(2)
const rate=Number(rateText), durationSeconds=Number(durationText), total=rate*durationSeconds
assert(root && base && Number.isInteger(total) && rate>0 && durationSeconds>0,
 'Usage: node benchmark-whole-v2-arrival.mjs evidence-dir http://isolated-host:19030 [rate] [seconds]')
assert(!existsSync(root+'/arrival-results.json'),'Use a fresh evidence directory; results must not be overwritten')
const fixtures=JSON.parse(readFileSync(root+'/fixtures.json','utf8'))
const stats=xs=>{const a=xs.toSorted((a,b)=>a-b);return {n:a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1)}}
const until=async deadline=>{for(let left=deadline-performance.now();left>0;left=deadline-performance.now())await delay(Math.max(1,Math.floor(left)))}
const result={scope:'Optimized shared V2 submit, synthetic entry adapters, real PostgreSQL; no login/START qualification',rate,durationSeconds,requestsPerProduct:total,measurements:{},raw:{}}
const save=()=>writeFileSync(root+'/arrival-results.json',JSON.stringify(result,null,2))

async function post(flavor,f,bodyText){
 const started=performance.now()
 try {
  const response=await fetch(`${base}/${flavor}/attempts/${f.attemptId}/v2/whole/submit`,{
   method:'POST',headers:{'content-type':'application/json'},body:bodyText,signal:AbortSignal.timeout(60000)})
  const text=await response.text();let body;try{body=JSON.parse(text)}catch{body={text}}
  return {latencyMs:performance.now()-started,status:response.status,body,
   success:response.status===200&&body?.data?.status==='COMPLETED'&&body?.data?.replayed===false}
 }catch(error){return {latencyMs:performance.now()-started,status:0,success:false,error:String(error)}}
}

for(const flavor of ['training','teacher']){
 const all=fixtures[flavor];assert(all.length>=total+4,`${flavor}: ${total+4} fresh attempts required`)
 const measured=all.slice(0,total).map(f=>({fixture:f,encoded:JSON.stringify(f.body)}))
 for(const f of all.slice(total,total+4)){const row=await post(flavor,f,JSON.stringify(f.body));assert(row.success,JSON.stringify(row))}
 await fetch(base+'/reset-observation',{method:'POST'})
 const before=await(await fetch(base+'/resources')).json()
 let inFlight=0,peakInFlight=0,completed=0,completedWithinWindow=0,sampling=false
 const samples=[], requests=[], start=performance.now()+100, windowMs=durationSeconds*1000
 const sample=async()=>{
  if(sampling)return;sampling=true
  try{const response=await fetch(base+'/resources',{signal:AbortSignal.timeout(5000)});samples.push({elapsedMs:performance.now()-start,inFlight,completed,...await response.json()})}
  catch(error){samples.push({elapsedMs:performance.now()-start,inFlight,completed,error:String(error)})}
  finally{sampling=false}
 }
 const interval=setInterval(()=>{void sample()},1000)
 console.log(JSON.stringify({event:'start',product:flavor,rate,durationSeconds,total}))
 for(let i=0;i<total;i++){
  const scheduledMs=i*1000/rate;await until(start+scheduledMs)
  const startedMs=performance.now()-start
  inFlight++;peakInFlight=Math.max(peakInFlight,inFlight)
  requests.push(post(flavor,measured[i].fixture,measured[i].encoded).then(row=>{
   const completedMs=performance.now()-start;inFlight--;completed++
   if(completedMs<=windowMs)completedWithinWindow++
   return {sample:i+1,scheduledMs,startedMs,schedulerLagMs:startedMs-scheduledMs,completedMs,...row}
  }))
 }
 await until(start+windowMs)
 const inFlightAtWindowEnd=inFlight
 const rows=await Promise.all(requests)
 clearInterval(interval)
 while(sampling)await delay(5)
 await sample()
 const after=await(await fetch(base+'/resources')).json()
 const lastCompleteMs=Math.max(...rows.map(r=>r.completedMs))
 const perSecond=Array.from({length:durationSeconds},(_,second)=>({second,started:0,completed:0,successful:0,maxLatencyMs:0}))
 for(const row of rows){
  const launch=perSecond[Math.floor(row.startedMs/1000)];if(launch)launch.started++
  const finish=perSecond[Math.floor(row.completedMs/1000)];if(finish){finish.completed++;if(row.success)finish.successful++}
  if(launch)launch.maxLatencyMs=Math.max(launch.maxLatencyMs,row.latencyMs)
 }
 const cpuMs=((after.cpu.user-before.cpu.user)+(after.cpu.system-before.cpu.system))/1000
 const metrics={scheduled:total,started:rows.length,success:rows.filter(r=>r.success).length,
  errors:rows.filter(r=>!r.success).map(({body,...row})=>({...row,response:body})),
  receiptMs:stats(rows.map(r=>r.latencyMs)),successfulReceiptMs:stats(rows.filter(r=>r.success).map(r=>r.latencyMs)),
  schedulerLagMs:stats(rows.map(r=>r.schedulerLagMs)),startedAfterWindow:rows.filter(r=>r.startedMs>=windowMs).length,
  firstStartMs:rows[0].startedMs,lastStartMs:rows.at(-1).startedMs,
  offeredRpsWithinWindow:rows.filter(r=>r.startedMs<windowMs).length/durationSeconds,
  completedWithinWindow,inFlightAtWindowEnd,peakInFlight,drainMs:Math.max(0,lastCompleteMs-windowMs),
  totalElapsedMs:Math.max(windowMs,lastCompleteMs),cpuMs,nodeCpuOneCorePercent:cpuMs/Math.max(windowMs,lastCompleteMs)*100,
  peakNodeRssBytes:Math.max(after.peakRss,after.memory.rss,...samples.filter(s=>s.memory).map(s=>s.memory.rss)),
  queries:after.queries,perSecond,resourceSamples:samples}
 result.raw[flavor]=rows;result.measurements[flavor]=metrics;save()
 console.log(JSON.stringify({event:'complete',product:flavor,success:metrics.success,total,receiptMs:metrics.receiptMs,
  schedulerLagMs:metrics.schedulerLagMs,offeredRpsWithinWindow:metrics.offeredRpsWithinWindow,
  peakInFlight,inFlightAtWindowEnd,drainMs:metrics.drainMs,nodeCpuOneCorePercent:metrics.nodeCpuOneCorePercent}))
}
const response=await fetch(base+'/verify',{signal:AbortSignal.timeout(120000)})
result.verify=await response.json();save()
assert.equal(response.status,200,JSON.stringify(result.verify))
const expected=2*(total+4)
assert.equal(result.verify.restored,expected);assert.equal(result.verify.hydrated,expected)
assert.equal(result.verify.completed,expected);assert.equal(result.verify.teacherCompleted,total+4)
assert.equal(result.verify.children,0);assert.equal(result.verify.feedbackRows,0)
for(const m of Object.values(result.measurements)){assert.equal(m.success,total,JSON.stringify(m.errors));assert.equal(m.startedAfterWindow,0,'Client failed to maintain the offered arrival rate')}
console.log(JSON.stringify({event:'verified',...result.verify}))
