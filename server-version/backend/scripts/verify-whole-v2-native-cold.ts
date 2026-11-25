import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {prisma} from '../src/config/database'
import {requireIsolatedReleaseDatabase} from '../src/__tests__/integration/integration-env'
import {canonicalHash} from '../src/modules/assessment-runtime/canonical'
import {loadCompositePublicationPlan} from '../src/modules/assessment-runtime/composite-publication-plan'
import {readCompositeFinalFactsBatch,readCompositeFinalRawBatch,hydrateCompositeScaleUnitsBatch} from '../src/modules/assessment-runtime/composite-final.reader'
import {buildScaleResult} from '../src/modules/scale/scale-result'
requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
async function main(){
 const state=JSON.parse(readFileSync(process.env.BENCH_REUSE_FIXTURE!,'utf8')),expected=new Map<string,any>(state.fixtures.map((f:any)=>[f.attemptId,f]))
 const rows=await prisma.$queryRaw<any[]>`SELECT attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch",publication_hash AS "publicationHash" FROM composite_attempt_finals WHERE composite_id=${state.compositeId}`
 assert.equal(rows.length,904)
 const plan=await loadCompositePublicationPlan(rows[0].publicationHash);let restored=0,scoreResults=0
 for(let i=0;i<rows.length;i+=30){
  const batch=rows.slice(i,i+30),facts=await readCompositeFinalFactsBatch(prisma,batch),raw=await readCompositeFinalRawBatch(prisma,batch),hydrated=await hydrateCompositeScaleUnitsBatch([...facts.values()],{rawByKey:raw,full:true,canonical:true})
  for(const entry of facts.values()){
   const units=hydrated.get(`${entry.meta.attemptId}:${entry.meta.attemptEpoch}`)!,input=expected.get(entry.meta.attemptId)
   assert.equal(units.size,9)
   let answers=0
   for(const slot of plan.slots){
    assert(slot.unitType==='SCALE')
    const actual=units.get(slot.slotKey)!,payload=input.body.units[slot.slotKey]
    const recomputed=buildScaleResult({scaleId:slot.scaleId,instrumentKey:slot.instrumentKey,name:slot.name,instrumentVersion:slot.instrumentVersion,definition:slot.definition,referenceSets:slot.referenceSets,answers:payload.answers,participantContextHash:entry.facts.contextHash})
    assert.equal(canonicalHash(actual.result),canonicalHash(recomputed));assert(actual.canonical)
    const decoded=raw.get(`${entry.meta.attemptId}:${entry.meta.attemptEpoch}`)!.raw.units[slot.slotKey] as any
    assert.deepEqual(decoded.codes,payload.answers.map((a:any)=>a.itemCode));assert.deepEqual(decoded.values,payload.answers.map((a:any)=>a.responseValue));answers+=decoded.codes.length;scoreResults++
   }
   assert.equal(answers,303);restored++
  }
 }
 writeFileSync(process.env.BENCH_OUT!,JSON.stringify({scope:'Fresh-process cold template hydration, every answer compared and every Scale result independently recomputed',restored,questionsPerFinal:303,unitsPerFinal:9,scoreResults},null,2))
}
main().finally(()=>prisma.$disconnect()).catch(error=>{console.error(error);process.exitCode=1})
