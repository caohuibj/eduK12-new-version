/** Isolated shared HTTP FINAL benchmark. Synthetic entry adapter; not login/START qualification.
 * Run PostgreSQL + this server in ONE --cpus=4 --memory=4g container; client outside.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import express from 'express'
import { prisma } from '../src/config/database'
import { createCustomScaleDefinition, hashScaleDefinition } from '../src/modules/scale/scale-definition'
import { compileScaleRuntime } from '../src/modules/assessment-runtime/compiler'
import { buildCompositePublicationPlan } from '../src/modules/assessment-runtime/composite-publication-plan'
import { mountCompositeWholeV2Routes } from '../src/modules/composite/whole-v2.routes'
import { decodeCompositeFinalFacts, decodeCompositeFinalRaw } from '../src/modules/assessment-runtime/composite-final.codec'
import { hydrateCompositeScaleUnitsBatch, readCompositeFinalFactsBatch, readCompositeFinalRawBatch } from '../src/modules/assessment-runtime/composite-final.reader'
import { retainImmutableCanonicalValue } from '../src/modules/assessment-runtime/canonical'
import { requestObservabilityMiddleware } from '../src/services/runtimeObservability'
const out = process.env.BENCH_OUT!
if (!out || new URL(process.env.DATABASE_URL!).pathname !== '/whole_v2_final_test') throw new Error('Dedicated whole_v2_final_test database and BENCH_OUT required')
const id = randomUUID, count = Number(process.env.BENCH_COUNT ?? 200)
const summarize = (xs: number[]) => { const a = [...xs].sort((a,b)=>a-b); return { n:a.length, p50:a[Math.ceil(a.length*.5)-1], p95:a[Math.ceil(a.length*.95)-1], max:a.at(-1) } }
async function seedFixture() {
 const creator = await prisma.user.create({data:{username:'bench-'+id(),passwordHash:'synthetic',role:'TEACHER',accountDomain:'SCHOOL'}})
 const org = await prisma.organization.create({data:{id:id(),name:'Isolated synthetic benchmark',productDomain:'SCHOOL',createdByUserId:creator.id}})
 const comp = await prisma.compositeAssessment.create({data:{code:'bench-'+id(),name:'303 questions / 9 scales',createdBy:creator.id,receiptOnly:true}})
 const slots = Array.from({length:9},(_,s)=>{
  const def = createCustomScaleDefinition(), n = s === 8 ? 31 : 34
  def.source.title = `Synthetic scale ${s}`
  def.items = Array.from({length:n},(_,i)=>({itemCode:`Q${i+1}`,content:`合成题目 ${s}-${i}：请按近期实际情况作答。`,type:'single',required:true,sortOrder:i,responseSetKey:'default',randomizeOptions:false}))
  def.scoring.itemRules = def.items.map((q,i)=>({itemCode:q.itemCode,transform:{type:i%4===0?'reverse' as const:'identity' as const}}))
  def.scoring.scores = [{key:'total',type:'total',label:'总分',direction:'descriptive',canonical:true,displayPrecision:2,source:{type:'items',aggregation:'sum',items:def.items.map(q=>({itemCode:q.itemCode,weight:1}))}}]
  def.report.primaryScoreKeys=['total']; def.report.scoreOrder=['total']; def.report.interpretations=[]
  const definitionHash=hashScaleDefinition(def), instrumentKey=`synthetic-${s}`
  return {slotKey:`scale:${s}`,unitType:'SCALE' as const,itemId:id(),scaleId:id(),instrumentKey,instrumentVersion:'1',name:instrumentKey,title:instrumentKey,required:true,position:s,definitionHash,definition:def,compiledRuntime:compileScaleRuntime({instrumentKey,instrumentVersion:'1',definition:def,sourceDefinitionHash:definitionHash}),referenceSets:[]}
 })
 const plan = buildCompositePublicationPlan({compositeId:comp.id,title:comp.name,slots})
 const run=id(), track=id()
 await prisma.$executeRaw`INSERT INTO assessment_runs(id,organization_id,name,status,created_by_user_id) VALUES(${run},${org.id},'Synthetic benchmark','PUBLISHED',${creator.id})`
 await prisma.$executeRaw`INSERT INTO assessment_run_tracks(id,organization_id,run_id,resource_family,resource_key,resource_version,requested_policy) VALUES(${track},${org.id},${run},'FORM','synthetic','1','{}'::jsonb)`
 const contexts=new Map<string,any>(), fixtures:Record<string,any[]>={training:[],teacher:[]}
 for(const flavor of ['training','teacher']) for(let i=0;i<count+6;i++){
  const user=await prisma.user.create({data:{username:'bench-'+id(),passwordHash:'synthetic',role:'TEACHER',accountDomain:flavor==='training'?'TRAINING':'SCHOOL'}})
  let educationRun:any
  if(flavor==='teacher'){
   const member=await prisma.organizationMembership.create({data:{id:id(),organizationId:org.id,userId:user.id}})
   const actor=id(), rel=id(), exec=id()
   await prisma.$executeRaw`INSERT INTO assessment_run_actor_snapshots(id,organization_id,run_id,provenance_kind,user_id,membership_id,actor_role,snapshot_payload,snapshot_hash) VALUES(${actor},${org.id},${run},'ORG_MEMBER',${user.id},${member.id},'TEACHER','{}'::jsonb,${'a'.repeat(64)})`
   await prisma.$executeRaw`INSERT INTO assessment_run_relationship_snapshots(id,organization_id,run_id,relationship_kind,subject_actor_snapshot_id,respondent_actor_snapshot_id,snapshot_payload,snapshot_hash) VALUES(${rel},${org.id},${run},'SELF',${actor},${actor},'{}'::jsonb,${'a'.repeat(64)})`
   const ep=await prisma.assessmentEpisode.create({data:{id:id(),subjectUserId:user.id,initiatedByUserId:user.id,initiationMode:'TEACHER_CAMPAIGN'}})
   const assignment=await prisma.relationalAssessmentAssignment.create({data:{id:id(),episodeId:ep.id,subjectUserId:user.id,subjectRole:'TEACHER',respondentUserId:user.id,respondentRole:'TEACHER',createdByUserId:creator.id,relationshipKind:'SELF',relationshipSnapshotJson:{},relationshipSnapshotHash:'a'.repeat(64),perspective:'SELF_REPORT',resourceKind:'FORM',resourceKey:'synthetic',resourceVersion:'1',visibilityPolicyKey:'SELF',status:'STARTED'}})
   educationRun={executionId:exec,assignmentId:assignment.id}
   await prisma.$executeRaw`INSERT INTO assessment_run_executions(id,organization_id,run_id,track_id,subject_actor_snapshot_id,respondent_actor_snapshot_id,relationship_snapshot_id,status,relational_assignment_id) VALUES(${exec},${org.id},${run},${track},${actor},${actor},${rel},'STARTED',${assignment.id})`
  }
  const attempt=await prisma.compositeAssessmentAttempt.create({data:{compositeAssessmentId:comp.id,userId:user.id,participantKey:user.id,receiptOnly:true,publicationHash:plan.publicationHash,attemptEpoch:1,runtimeGeneration:'UNIFIED_V1'}})
  if(educationRun) await prisma.$executeRaw`UPDATE assessment_run_executions SET runtime_binding_kind='COMPOSITE',runtime_binding_ref=${attempt.id},started_at=now() WHERE id=${educationRun.executionId}`
  const ctx={attempt:{...attempt,organizationId:flavor==='teacher'?org.id:null},plan,audience:'authenticated',educationRun,persistencePolicy:{draftCheckpointEnabled:false,draftTtlHours:null,localCognitiveEnabled:false,localCognitiveTtlHours:null},...(educationRun?{verifyAuthorityInTx:async(tx:any)=>{
   const organizations=await tx.$queryRaw`SELECT status FROM organizations WHERE id=${org.id} FOR SHARE`
   const runs=await tx.$queryRaw`SELECT status FROM assessment_runs WHERE id=${run} FOR SHARE`
   const executions=await tx.$queryRaw`SELECT status FROM assessment_run_executions WHERE id=${educationRun.executionId} FOR UPDATE`
   const assignments=await tx.$queryRaw`SELECT status FROM relational_assessment_assignments WHERE id=${educationRun.assignmentId} FOR UPDATE`
   if(organizations[0]?.status!=='ACTIVE'||runs[0]?.status!=='PUBLISHED'||!['STARTED','COMPLETED'].includes(executions[0]?.status)||!['STARTED','COMPLETED'].includes(assignments[0]?.status)) throw new Error('Synthetic authority changed')
  }}:{})}
  contexts.set(attempt.id,ctx)
  const units=Object.fromEntries(slots.map(s=>[s.slotKey,{unitType:'SCALE',definitionHash:s.definitionHash,answers:s.definition.items.map((q,j)=>({itemCode:q.itemCode,responseValue:s.definition.responseSets[0].options[(i+j)%s.definition.responseSets[0].options.length].value}))}]))
  fixtures[flavor].push({attemptId:attempt.id,body:{submissionId:id(),attemptEpoch:1,publicationHash:plan.publicationHash,slotSetHash:plan.slotSetHash,units}})
 }
 return {org,run,comp,plan,contexts:[...contexts].map(([key,ctx])=>{const {plan: _plan,verifyAuthorityInTx: _verify,...rest}=ctx;return [key,rest]}),fixtures}
}
async function main() {
 const state = process.env.BENCH_REUSE_FIXTURE
  ? JSON.parse(readFileSync(process.env.BENCH_REUSE_FIXTURE,'utf8'))
  : await seedFixture()
 const {org,run,comp,fixtures}=state
 const plan=retainImmutableCanonicalValue(state.plan)
 const contexts=new Map<string,any>(state.contexts.map(([key,ctx]:[string,any])=>{
  ctx.plan=plan;ctx.attempt.startedAt=new Date(ctx.attempt.startedAt)
  if(ctx.educationRun)ctx.verifyAuthorityInTx=async(tx:any)=>{
   const organizations=await tx.$queryRaw`SELECT status FROM organizations WHERE id=${org.id} FOR SHARE`
   const runs=await tx.$queryRaw`SELECT status FROM assessment_runs WHERE id=${run} FOR SHARE`
   const executions=await tx.$queryRaw`SELECT status FROM assessment_run_executions WHERE id=${ctx.educationRun.executionId} FOR UPDATE`
   const assignments=await tx.$queryRaw`SELECT status FROM relational_assessment_assignments WHERE id=${ctx.educationRun.assignmentId} FOR UPDATE`
   if(organizations[0]?.status!=='ACTIVE'||runs[0]?.status!=='PUBLISHED'||!['STARTED','COMPLETED'].includes(executions[0]?.status)||!['STARTED','COMPLETED'].includes(assignments[0]?.status))throw new Error('Synthetic authority changed')
  }
  return [key,ctx]
 }))
 const queries:Record<string,number>={}
 prisma.$use(async(params,next)=>{queries[params.action]=(queries[params.action]??0)+1;return next(params)})
 let peakRss=process.memoryUsage().rss
 const sampling=setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss)},100);sampling.unref()
 const app=express();app.use(requestObservabilityMiddleware);app.use(express.json({limit:'2mb'}))
 for(const flavor of ['training','teacher']) {const router=express.Router();mountCompositeWholeV2Routes(router,{prefix:'/attempts',middleware:[],authorizeAttempt:async req=>{const ctx=contexts.get(req.params.attemptId);if(!ctx)throw new Error('Unknown synthetic attempt');return ctx}});app.use('/'+flavor,router)}
 app.get('/resources',(_req,res)=>res.json({queries,peakRss,cpu:process.cpuUsage(),memory:process.memoryUsage()}))
 app.post('/reset-observation',(_req,res)=>{for(const key of Object.keys(queries))delete queries[key];peakRss=process.memoryUsage().rss;res.json({ok:true})})
 app.get('/verify',async(_req,res)=>{try{
  const rows=await prisma.$queryRaw<any[]>`SELECT f.*,pg_column_size(f) AS bytes FROM composite_attempt_finals f WHERE composite_id=${comp.id}`
  let restored=0
  for(const row of rows){const facts=decodeCompositeFinalFacts(row.facts_cipher,row.facts_hash),raw=decodeCompositeFinalRaw(row.raw_cipher,row.raw_hash);if(Object.keys(facts.units).length!==9||Object.values(raw.units).reduce((n:number,u:any)=>n+u.codes.length,0)!==303)throw new Error('Restore mismatch');const expected=[...fixtures.training,...fixtures.teacher].find((f:any)=>f.attemptId===row.attempt_id);for(const [key,unit]of Object.entries(raw.units) as any){const answers=expected.body.units[key].answers;if(JSON.stringify(unit.codes)!==JSON.stringify(answers.map((a:any)=>a.itemCode))||JSON.stringify(unit.values)!==JSON.stringify(answers.map((a:any)=>a.responseValue)))throw new Error('Recovered answers differ')};restored++}
  // Hydrate actual scored results + answers through public templates, not only raw counts.
  const keys=rows.map(r=>({attemptId:r.attempt_id,attemptEpoch:r.attempt_epoch}));let hydrated=0
  for(let i=0;i<keys.length;i+=30){const batch=keys.slice(i,i+30),facts=await readCompositeFinalFactsBatch(prisma,batch),raw=await readCompositeFinalRawBatch(prisma,batch);const map=await hydrateCompositeScaleUnitsBatch([...facts.values()],{rawByKey:raw,full:true,canonical:true});for(const units of map.values()){if(units.size!==9)throw new Error('Hydration units mismatch');hydrated++}}
  const completed=await prisma.compositeAssessmentAttempt.count({where:{compositeAssessmentId:comp.id,status:'COMPLETED'}})
  const [{n:states}]=await prisma.$queryRaw<any[]>`SELECT count(*)::int AS n FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id WHERE e.run_id=${run} AND e.status='COMPLETED' AND a.status='COMPLETED'`
  const children=await prisma.assessmentUnitSnapshot.count({where:{compositeAttemptId:{in:keys.map(k=>k.attemptId)}}})
  res.json({restored,hydrated,completed,teacherCompleted:states,children,rowBytes:summarize(rows.map(r=>r.bytes)),sharedTemplates:await prisma.assessmentPublicTemplate.count(),feedbackRows:rows.filter(r=>r.feedback_cipher!==null).length})
 }catch(e){res.status(500).json({error:String(e),stack:(e as Error).stack})}})
 writeFileSync(out+'/pid',String(process.pid))
 const server=app.listen(19030,'0.0.0.0',()=>{writeFileSync(out+'/fixture-state.json',JSON.stringify(state));writeFileSync(out+'/fixtures.json',JSON.stringify(fixtures));writeFileSync(out+'/ready.json',JSON.stringify({count,planHash:plan.publicationHash,questions:303,units:9}));console.log('READY')})
 process.on('SIGTERM',async()=>{server.close();await prisma.$disconnect();process.exit(0)})
}
main().catch(e=>{console.error(e);process.exit(1)})
