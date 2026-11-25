import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { prisma } from '../src/config/database'
import { canonicalHash, retainImmutableCanonicalValue } from '../src/modules/assessment-runtime/canonical'
import { commitCompositeWholeFinal, prepareCompositeWholeFinal } from '../src/modules/assessment-runtime/composite-final.writer'
import { hydrateCompositeScaleUnitsBatch, readCompositeFinalFactsBatch, readCompositeFinalRawBatch } from '../src/modules/assessment-runtime/composite-final.reader'
import { publicTemplates, publicTemplateHash, publicTemplatesForDatabase, withCommittedPublicTemplates } from '../src/modules/assessment-runtime/public-templates'
import { buildScaleResult } from '../src/modules/scale/scale-result'

async function main() {
 const url=new URL(process.env.DATABASE_URL!)
 assert(['127.0.0.1','localhost'].includes(url.hostname)&&url.pathname==='/whole_v2_final_test','Explicit isolated benchmark test database required')
 const state=JSON.parse(readFileSync(process.env.BENCH_REUSE_FIXTURE!,'utf8'))
 const plan=retainImmutableCanonicalValue(state.plan), fixtureById=new Map<string,any>([...state.fixtures.training,...state.fixtures.teacher].map((f:any)=>[f.attemptId,f]))
 const rows=await prisma.$queryRaw<any[]>`SELECT attempt_id AS "attemptId",attempt_epoch AS "attemptEpoch" FROM composite_attempt_finals WHERE composite_id=${state.comp.id}`
 assert.equal(rows.length,410)
 let exactResults=0
 for(let i=0;i<rows.length;i+=30){
  const keys=rows.slice(i,i+30),facts=await readCompositeFinalFactsBatch(prisma,keys),raw=await readCompositeFinalRawBatch(prisma,keys)
  const hydrated=await hydrateCompositeScaleUnitsBatch([...facts.values()],{rawByKey:raw,full:true,canonical:true})
  for(const entry of facts.values()){
   const input=fixtureById.get(entry.meta.attemptId),units=hydrated.get(`${entry.meta.attemptId}:${entry.meta.attemptEpoch}`)!
   assert.equal(units.size,9)
   for(const slot of plan.slots){
    const result=buildScaleResult({scaleId:slot.scaleId,instrumentKey:slot.instrumentKey,name:slot.name,instrumentVersion:slot.instrumentVersion,definition:slot.definition,referenceSets:slot.referenceSets,answers:input.body.units[slot.slotKey].answers,participantContextHash:null})
    assert.equal(canonicalHash(units.get(slot.slotKey)!.result),canonicalHash(result),'Hydrated score/result differs from independently recomputed frozen definition')
    assert(units.get(slot.slotKey)!.canonical)
    exactResults++
   }
  }
 }
 const rollback=new Error('intentional isolated rollback')
 for(const flavor of ['training','teacher']){
  const inputFixture=state.fixtures[flavor].at(-1)
  const ctx=state.contexts.find(([key]:[string,any])=>key===inputFixture.attemptId)[1]
  const input={attempt:{...ctx.attempt,startedAt:new Date(ctx.attempt.startedAt)},plan,submit:inputFixture.body,educationRun:ctx.educationRun,draftCheckpointEnabled:false}
  const prepared=await prepareCompositeWholeFinal(input);assert(prepared)
  await assert.rejects(withCommittedPublicTemplates(work=>prisma.$transaction(work),async tx=>{
   const receipt=await commitCompositeWholeFinal(tx,input,prepared);assert.equal(receipt.replayed,false)
   const [inside]=await tx.$queryRaw<any[]>`SELECT status::text AS status FROM composite_assessment_attempts WHERE id=${input.attempt.id}`
   assert.equal(inside.status,'COMPLETED')
   throw rollback
  }),e=>e===rollback)
  const [after]=await prisma.$queryRaw<any[]>`SELECT p.status::text AS status,(SELECT count(*)::int FROM composite_attempt_finals f WHERE f.attempt_id=p.id) AS finals FROM composite_assessment_attempts p WHERE p.id=${input.attempt.id}`
  assert.equal(after.status,'IN_PROGRESS');assert.equal(after.finals,0)
  if(input.educationRun){
   const [run]=await prisma.$queryRaw<any[]>`SELECT e.status AS execution,a.status AS assignment FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${input.educationRun.executionId}`
   assert.deepEqual(run,{execution:'STARTED',assignment:'STARTED'})
   await assert.rejects(prisma.$transaction(async tx=>{
    await tx.$executeRaw`UPDATE relational_assessment_assignments SET status='REVOKED' WHERE id=${input.educationRun.assignmentId}`
    await commitCompositeWholeFinal(tx,input,prepared)
   }),(e:any)=>e.code==='STALE_ATTEMPT')
   const [finalCount]=await prisma.$queryRaw<any[]>`SELECT count(*)::int AS n FROM composite_attempt_finals WHERE attempt_id=${input.attempt.id}`
   assert.equal(finalCount.n,0)
   const parent=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:input.attempt.id}});assert.equal(parent.status,'IN_PROGRESS')
   const [still]=await prisma.$queryRaw<any[]>`SELECT e.status AS execution,a.status AS assignment FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.id=${input.educationRun.executionId}`
   assert.deepEqual(still,{execution:'STARTED',assignment:'STARTED'})
  }
 }
 const kind='SCALE_INTERPRETATION' as const,value={publicContent:'isolated cache rollback '+randomUUID()},hash=publicTemplateHash(kind,value)
 await assert.rejects(withCommittedPublicTemplates(work=>prisma.$transaction(work),async tx=>{
  await publicTemplatesForDatabase(tx).saveMany([{kind,value}]);assert.equal(publicTemplates.get(hash),undefined);throw rollback
 }),e=>e===rollback)
 assert.equal(publicTemplates.get(hash),undefined)
 const [cacheRow]=await prisma.$queryRaw<any[]>`SELECT count(*)::int AS n FROM assessment_public_templates WHERE template_hash=${hash}`;assert.equal(cacheRow.n,0)
 const legacyCounts:Record<string,number>={}
 for(const table of ['assessments','composite_form_answers','assessment_unit_snapshots','assessment_result_facts','composite_report_jobs']){
  const [row]=await prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS n FROM "${table}"`);legacyCounts[table]=row.n;assert.equal(row.n,0,table)
 }
 console.log(JSON.stringify({finals:rows.length,exactResults,legacyCounts,transactionRollback:true,teacherRevocationRollback:true,templateRollbackIsolation:true},null,2))
}
main().then(()=>prisma.$disconnect()).catch(async e=>{console.error(e);await prisma.$disconnect();process.exitCode=1})
