/** Real Teacher publication/START/auth/FINAL/feedback benchmark. Disposable local DB only. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {AsyncLocalStorage} from 'node:async_hooks'
import {performance} from 'node:perf_hooks'
import express from 'express'
import {prisma} from '../src/config/database'
import {requireIsolatedReleaseDatabase} from '../src/__tests__/integration/integration-env'
import {setupEducationLibraryRuntimeFixture} from '../src/__tests__/integration/educationLibraryRuntimeFixture'
import * as tools from '../src/modules/education-tools/private-tool.service'
import {compileResearchScale} from '../src/modules/survey/builder.compiler'
import {addTeacherPrivateCompositionRunTrack,publishTeacherRun} from '../src/modules/huiteacher/run.service'
import {createTeacherAssessmentRuntimeRouter} from '../src/modules/huiteacher/assessmentRuntime.routes'
import {teacherAssessmentRuntimeSource} from '../src/modules/huiteacher/assessmentRuntime.source'
import trainingRouter from '../src/modules/composite/composite.routes'
import {authorizeEducationWholeV2} from '../src/modules/composite/whole-v2.access'
import {csrfProtection} from '../src/middleware/csrf'
import {generateToken} from '../src/utils/jwt'
import {HUITEACHER_AUTH_COOKIE_NAME,HUITEACHER_CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../src/utils/authCookies'
import {decodeCompositeFinalFacts,decodeCompositeFinalRaw} from '../src/modules/assessment-runtime/composite-final.codec'

const output=process.env.BENCH_OUT!,count=Number(process.env.BENCH_COUNT??900),port=Number(process.env.BENCH_PORT??19040)
assert(output&&Number.isSafeInteger(count)&&count>0&&count<=1000)
requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
mkdirSync(output,{recursive:true})
const requestScope=new AsyncLocalStorage<string>()
const queries:Record<string,number>={}
const transactions:any[]=[]
const transact=prisma.$transaction.bind(prisma)
;(prisma as any).$transaction=(work:any,options:any)=>{
 if(typeof work!=='function')return transact(work,options)
 const queued=performance.now(),scope=requestScope.getStore()??'setup',entry={finalWrite:false} as {finalWrite:boolean;parentLockObservedAt?:number}
 let acquired:number|undefined,callbackEnded:number|undefined
 return transact(async(tx:any)=>{
  acquired=performance.now()
  const observed=new Proxy(tx,{get(target,key){
   const method=Reflect.get(target,key)
   if(!['$queryRaw','$queryRawUnsafe','$executeRaw','$executeRawUnsafe'].includes(String(key)))return method
   return async(...args:any[])=>{
    const query=args[0],sql=typeof query==='string'?query:Array.from(query?.strings??query??[]).join('?')
    if(/INSERT\s+INTO\s+composite_attempt_finals/.test(sql))entry.finalWrite=true
    const result=await Reflect.apply(method,target,args)
    if(/SELECT\s+status::text AS status/.test(sql)&&/FROM composite_assessment_attempts/.test(sql)&&/FOR UPDATE/.test(sql))entry.parentLockObservedAt=performance.now()
    return result
   }
  }})
  try{return await work(observed)}finally{callbackEnded=performance.now()}
 },options).finally(()=>{
  if(scope!=='setup'&&acquired!==undefined)transactions.push({scope,finalWrite:entry.finalWrite,acquireAndBeginMs:acquired-queued,
   callbackMs:callbackEnded!-acquired,settleAndCommitMs:performance.now()-callbackEnded!,wallMs:performance.now()-queued,
   ...(entry.parentLockObservedAt?{parentLockUntilSettlementMs:performance.now()-entry.parentLockObservedAt}:{})})
 })
}
prisma.$use(async(params,next)=>{
 const key=(requestScope.getStore()??'setup')+'.'+params.action;queries[key]=(queries[key]??0)+1
 return next(params)
})
let peakRss=process.memoryUsage().rss
setInterval(()=>{peakRss=Math.max(peakRss,process.memoryUsage().rss)},100).unref()
const app=express();app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection)
app.use((req,_res,next)=>requestScope.run(req.path.endsWith('/feedback')?'feedback':req.path.endsWith('/submit')?'submit':'other',next))
app.use('/api/huiteacher',createTeacherAssessmentRuntimeRouter(teacherAssessmentRuntimeSource))
app.use('/api/composite-assessments',trainingRouter)
app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.statusCode??500).json({code:error.code,message:error.message}))
const server=app.listen(port,'127.0.0.1')
const base='http://127.0.0.1:'+port
const resource=()=>({queries:{...queries},peakRss,memory:process.memoryUsage(),cpu:process.cpuUsage(),transactions:[...transactions]})
app.get('/resources',(_req,res)=>res.json(resource()))
app.post('/reset-observation',(_req,res)=>{Object.keys(queries).forEach(k=>delete queries[k]);transactions.length=0;peakRss=process.memoryUsage().rss;res.json({ok:true})})
const request=async(path:string,headers:Record<string,string>,body?:unknown)=>{
 const response=await fetch(base+path,{headers,...(body!==undefined?{method:'POST',body:JSON.stringify(body)}:{})})
 const value:any=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value.data
}

async function seed(){
 const f=await setupEducationLibraryRuntimeFixture({db:prisma,product:'TEACHER',trackCount:0,publish:false})
 const manager=await prisma.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId}})
 const actors=[{id:f.participantUserId,membershipId:f.subjectMembershipId,username:(await prisma.user.findUniqueOrThrow({where:{id:f.participantUserId}})).username},{id:f.managerUserId,membershipId:manager.id,username:f.manager.username}]
 for(let i=2;i<count+4;i++)actors.push({id:randomUUID(),membershipId:randomUUID(),username:'native-load-'+randomUUID()})
 await prisma.user.createMany({data:actors.slice(2).map(a=>({id:a.id,username:a.username,passwordHash:'SYNTHETIC NONLOGIN',accountDomain:'SCHOOL',role:'TEACHER',teacherApproved:true}))})
 await prisma.organizationMembership.createMany({data:actors.slice(2).map(a=>({id:a.membershipId,organizationId:f.organizationId,userId:a.id}))})
 await prisma.organizationPersonaGrant.createMany({data:actors.slice(2).map(a=>({id:randomUUID(),organizationId:f.organizationId,membershipId:a.membershipId,persona:'TEACHER',grantedByUserId:f.managerUserId}))})
 const context={entry:'TEACHER' as const,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
 const freeze=async(kind:'SCALE'|'COMPOSITION',title:string,definition:unknown)=>{
  const draft=await tools.createPrivateTool(context,{kind,title})
  const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title,definition})
  return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
 }
 const sources=[]
 for(let s=0;s<9;s++){
  const size=s<6?34:33
  const definition=compileResearchScale('Synthetic 303-question source '+s,{schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',
   responseOptions:[{optionKey:'a',label:'Option A',score:1},{optionKey:'b',label:'Option B',score:2},{optionKey:'c',label:'Option C',score:3}],
   dimensions:[{dimensionKey:'total',label:'Descriptive score',direction:'descriptive'}],
   items:Array.from({length:size},(_,i)=>({itemKey:'q'+i,prompt:`Synthetic reflection ${s+1}-${i+1}`,required:true,reverse:i%4===0,dimensionKeys:['total']}))})
  definition.report.audienceContract={schemaVersion:1,respondent:'ADULT_SELF',audience:'teacher',locale:'zh-CN'}
  const source=await freeze('SCALE','Synthetic full scale '+s,definition)
  sources.push({provider:'PRIVATE_VERSION',kind:'SCALE',versionId:source.id,contentHash:source.contentHash})
 }
 const fixed=await freeze('COMPOSITION','Synthetic 303 questions / 9 units',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'Synthetic performance fixture',blocks:sources.map(source=>({blockId:randomUUID(),instruction:'',source}))})
 assert('runtime'in fixed&&fixed.runtime)
 const membershipIds=actors.map(a=>a.membershipId)
 await addTeacherPrivateCompositionRunTrack({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId},
  {expectedVersion:f.expectedVersion,privateComposition:{versionId:fixed.id,contentHash:fixed.contentHash},subjectSelector:{kind:'ALL_CURRENT'},respondentSelector:{kind:'ALL_CURRENT'}})
 await f.open()
 // Only fixture publication gets a longer setup budget. Measured START/FINAL
 // transaction timeouts and production services retain their actual defaults.
 const transact=prisma.$transaction.bind(prisma)
 ;(prisma as any).$transaction=(work:any,options:any)=>transact(work,{...options,timeout:60000})
 try { await publishTeacherRun({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId,expectedVersion:f.expectedVersion+1,provideParticipantReport:true}) }
 finally {(prisma as any).$transaction=transact}
 const executions=await prisma.$queryRaw<Array<{id:string;userId:string}>>`SELECT e.id,r.user_id AS "userId" FROM assessment_run_executions e JOIN assessment_run_actor_snapshots r ON r.id=e.respondent_actor_snapshot_id WHERE e.run_id=${f.runId}`
 assert.equal(executions.length,actors.length)
 const fixtures:any[]=[],csrf='synthetic-native-load-csrf'
 let plan:Awaited<ReturnType<typeof authorizeEducationWholeV2>>['plan']|undefined
 // START outside the measured arrival window; native entry and frozen bindings remain real.
 for(let offset=0;offset<executions.length;offset+=4)await Promise.all(executions.slice(offset,offset+4).map(async(e,index)=>{
  const actor=actors.find(a=>a.id===e.userId)!
  const token=generateToken({userId:actor.id,username:actor.username,role:'TEACHER',accountDomain:'SCHOOL',tokenVersion:0,sessionProduct:'HUITEACHER',mfaVerifiedAt:Math.floor(Date.now()/1000)})
  const headers={'content-type':'application/json',cookie:`${HUITEACHER_AUTH_COOKIE_NAME}=${token}; ${HUITEACHER_CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf}
  const started=await request('/api/huiteacher/run-executions/'+e.id+'/start-assessment',headers,{})
  const attemptId=started.runtimeBindingRef
  if(!plan)plan=(await authorizeEducationWholeV2({params:{attemptId},user:{userId:actor.id}} as any)).plan
  const selectedPlan=plan!
  const units=Object.fromEntries(selectedPlan.slots.map(slot=>{
   assert(slot.unitType==='SCALE')
   return [slot.slotKey,{unitType:'SCALE',definitionHash:slot.definitionHash,answers:slot.definition.items.map((item,j)=>({itemCode:item.itemCode,responseValue:slot.definition.responseSets[0].options[(offset+index+j)%3].value}))}]
  }))
  fixtures.push({attemptId,headers,path:'/api/huiteacher/assessment-composite-attempts/'+attemptId+'/v2/whole/submit',feedbackPath:'/api/huiteacher/run-executions/'+e.id+'/feedback',body:{submissionId:randomUUID(),attemptEpoch:1,publicationHash:selectedPlan.publicationHash,slotSetHash:selectedPlan.slotSetHash,units}})
 }))
 const state={scope:'Real Teacher publication, START, signed-in V2 POST and direct feedback; 303 questions / 9 units',compositeId:fixed.runtime!.compositeId,runId:f.runId,organizationId:f.organizationId,fixtures}
 writeFileSync(output+'/native-state.json',JSON.stringify(state));return state
}

async function main(){
 await new Promise<void>(resolve=>server.once('listening',resolve))
 const state=process.env.BENCH_REUSE_FIXTURE?JSON.parse(readFileSync(process.env.BENCH_REUSE_FIXTURE,'utf8')):await seed()
 app.get('/verify',async(_req,res)=>{try{
  const rows=await prisma.$queryRaw<any[]>`SELECT f.*,pg_column_size(f) AS "finalBytes",pg_column_size(p) AS "parentBytes" FROM composite_attempt_finals f JOIN composite_assessment_attempts p ON p.id=f.attempt_id WHERE f.composite_id=${state.compositeId}`
  let restored=0
  const byId=new Map(state.fixtures.map((f:any)=>[f.attemptId,f]))
  for(const row of rows){
   const facts=decodeCompositeFinalFacts(row.facts_cipher,row.facts_hash),raw=decodeCompositeFinalRaw(row.raw_cipher,row.raw_hash)
   assert.equal(Object.keys(facts.units).length,9)
   assert.equal(Object.values(raw.units).reduce((n:number,u:any)=>n+u.codes.length,0),303)
   const expected:any=byId.get(row.attempt_id)
   for(const [key,unit]of Object.entries(raw.units)as any)assert.deepEqual(unit.values,expected.body.units[key].answers.map((a:any)=>a.responseValue))
   restored++
  }
  const violations=await prisma.$queryRaw<any[]>`SELECT e.id FROM assessment_run_executions e JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id JOIN composite_assessment_attempts p ON p.id=e.runtime_binding_ref WHERE e.run_id=${state.runId} AND p.status='COMPLETED' AND (e.status<>'COMPLETED' OR a.status<>'COMPLETED')`
  const [childCounts]=await prisma.$queryRaw<any[]>`SELECT (SELECT COUNT(*)::int FROM assessments a JOIN composite_assessment_attempts p ON p.id=a.composite_attempt_id WHERE p.composite_assessment_id=${state.compositeId}) AS assessments,(SELECT COUNT(*)::int FROM composite_report_jobs j JOIN composite_assessment_attempts p ON p.id=j.attempt_id WHERE p.composite_assessment_id=${state.compositeId}) AS reports`
  res.json({restored,stateMismatches:violations.length,childCounts,finalBytes:rows.map(r=>r.finalBytes),parentBytes:rows.map(r=>r.parentBytes)})
 }catch(error){res.status(500).json({error:String(error)})}})
 writeFileSync(output+'/fixtures.json',JSON.stringify(state.fixtures))
 writeFileSync(output+'/ready.json',JSON.stringify({count:state.fixtures.length,questions:303,units:9,pid:process.pid,port}))
 console.log('NATIVE_BENCH_READY',JSON.stringify({count:state.fixtures.length,port}))
}
main().catch(async error=>{console.error(error);await prisma.$disconnect();server.close();process.exit(1)})
