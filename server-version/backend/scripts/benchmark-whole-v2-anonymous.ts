/** Native 200-VU START probe; fixture is prepared with real publication/grant services. */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {prisma} from '../src/config/database'
import {startPublicAttempt} from '../src/modules/composite/composite.service'
import {requireIsolatedReleaseDatabase} from '../src/__tests__/integration/integration-env'
const fixture=JSON.parse(readFileSync(process.env.ANONYMOUS_303_FIXTURE!,'utf8')),out=process.env.BENCH_OUT!
requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
assert(out&&fixture.questions===303&&fixture.units===9)
async function main(){
 let peakRss=process.memoryUsage().rss
 const sample=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss)},20)
 const before=process.cpuUsage(),start=performance.now()
 const rows=await Promise.all(Array.from({length:200},async()=>{
  const began=performance.now()
  try{const result=await startPublicAttempt(fixture.token);return {ms:performance.now()-began,attemptId:result.attempt.id,executionMode:result.attempt.executionMode,success:true}}
  catch(error){return {ms:performance.now()-began,success:false,error:String(error)}}
 }))
 clearInterval(sample)
 const times=rows.map(r=>r.ms).sort((a,b)=>a-b)
 const [count]=await prisma.$queryRaw<any[]>`SELECT t.used_count AS base,COALESCE(SUM(s.used_count),0)::int AS shards,COUNT(s.shard)::int AS buckets FROM composite_assessment_access_tokens t LEFT JOIN composite_access_token_usage_shards s ON s.token_id=t.id WHERE t.id=${fixture.tokenId} GROUP BY t.id`
 const [children]=await prisma.$queryRaw<any[]>`SELECT COUNT(*)::int AS count FROM assessments a JOIN composite_assessment_attempts p ON p.id=a.composite_attempt_id WHERE p.composite_assessment_id=${fixture.compositeId}`
 const result={scope:'Native Training anonymous START, real granted 303-question / 9-scale published questionnaire, 200 concurrent distinct recovery credentials',count:200,success:rows.filter(r=>r.success).length,latency:{p50:times[99],p95:times[189],p99:times[197],max:times.at(-1)},wallMs:performance.now()-start,cpu:process.cpuUsage(before),peakMiB:peakRss/1048576,counter:count,children,rows}
 writeFileSync(out,JSON.stringify(result,null,2))
 console.log(JSON.stringify({...result,rows:undefined}))
 assert.equal(result.success,200);assert.equal(new Set(rows.map(r=>r.attemptId)).size,200);assert(rows.every(r=>r.executionMode==='WHOLE_V2'));assert.equal(count.base+count.shards,200);assert.equal(children.count,0)
}
main().finally(async()=>{await(await import('../src/config/queue')).closeQueues(true);await prisma.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1})
