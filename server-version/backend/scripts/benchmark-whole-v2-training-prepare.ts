/** Real Training identities/publication/START fixtures, separate from the measured POST window. */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {prisma} from '../src/config/database'
import {requireIsolatedReleaseDatabase} from '../src/__tests__/integration/integration-env'
import {canonicalHash} from '../src/modules/assessment-runtime/canonical'
import * as runtime from '../src/modules/composite/composite.service'
import {authorizeTrainingAuthenticatedWholeV2} from '../src/modules/composite/whole-v2.access'
import {generateToken} from '../src/utils/jwt'
import {AUTH_COOKIE_NAME,CSRF_COOKIE_NAME,CSRF_HEADER_NAME} from '../src/utils/authCookies'
requireIsolatedReleaseDatabase(process.env.DATABASE_URL!)
async function main(){
 if(process.env.TRAINING_BOOTSTRAP_OUT){
  const input=JSON.parse(readFileSync(process.env.ANONYMOUS_303_FIXTURE!,'utf8'))
  const source=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:input.compositeId},include:{items:{orderBy:{position:'asc'}},questionnaireCourses:true}})
  assert(source.items.length===9&&source.questionnaireCourses.length===1)
  const courseId=source.questionnaireCourses[0].courseId,policy={schemaVersion:1,mode:'IMMEDIATE'}
  const comp=await prisma.compositeAssessment.create({data:{code:'training-native-'+randomUUID(),name:'Synthetic Training 303 / 9 receipt',createdBy:source.createdBy,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'DRAFT',maxAttempts:1,trainingFeedbackPolicy:policy,trainingFeedbackPolicyHash:canonicalHash(policy),questionnaireCourses:{create:{courseId}}}})
  for(const item of source.items)await runtime.addItem(source.createdBy,'TEACHER',comp.id,{type:'SCALE',scaleId:item.scaleId!,required:true})
  await runtime.publishComposite(source.createdBy,'TEACHER',comp.id,undefined,undefined,undefined,false)
  const actors=Array.from({length:904},()=>({id:randomUUID(),username:'train-native-'+randomUUID()}))
  await prisma.user.createMany({data:actors.map(a=>({...a,role:'STUDENT',accountDomain:'TRAINING',passwordHash:'SYNTHETIC NONLOGIN'}))})
  await prisma.courseStudent.createMany({data:actors.map(a=>({courseId,studentId:a.id,status:'APPROVED'}))})
  writeFileSync(process.env.TRAINING_BOOTSTRAP_OUT,JSON.stringify({compositeId:comp.id,courseId,runId:null,actors,questions:303,units:9}))
  console.log('TRAINING_NATIVE_PUBLICATION_READY');return
 }
 const input=JSON.parse(readFileSync(process.env.TRAINING_PUBLICATION_FIXTURE!,'utf8')),out=process.env.BENCH_OUT!
 mkdirSync(out,{recursive:true})
 const fixtures:any[]=[];let plan:Awaited<ReturnType<typeof authorizeTrainingAuthenticatedWholeV2>>['plan']|undefined
 for(let offset=0;offset<input.actors.length;offset+=4)await Promise.all(input.actors.slice(offset,offset+4).map(async(actor:any,j:number)=>{
  const started=await runtime.startUserAttempt(actor.id,input.compositeId)
  assert.equal(started.attempt.executionMode,'WHOLE_V2')
  const attemptId=started.attempt.id
  if(!plan)plan=(await authorizeTrainingAuthenticatedWholeV2({params:{attemptId},user:{userId:actor.id}} as any)).plan
  const selected=plan!,csrf='synthetic-training-load-csrf'
  const token=generateToken({userId:actor.id,username:actor.username,role:'STUDENT',accountDomain:'TRAINING',tokenVersion:0})
  const headers={'content-type':'application/json',cookie:`${AUTH_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${csrf}`,[CSRF_HEADER_NAME]:csrf}
  const units=Object.fromEntries(selected.slots.map(slot=>{
   assert(slot.unitType==='SCALE')
   return [slot.slotKey,{unitType:'SCALE',definitionHash:slot.definitionHash,answers:slot.definition.items.map((item,i)=>({itemCode:item.itemCode,responseValue:slot.definition.responseSets[0].options[(offset+j+i)%2].value}))}]
  }))
  fixtures.push({attemptId,headers,path:'/api/composite-assessments/attempts/'+attemptId+'/v2/whole/submit',body:{submissionId:randomUUID(),attemptEpoch:1,publicationHash:selected.publicationHash,slotSetHash:selected.slotSetHash,totalTimeMs:300000,units}})
 }))
 assert.equal(plan!.slots.length,9)
 const state={...input,actors:undefined,fixtures}
 writeFileSync(out+'/native-state.json',JSON.stringify(state));writeFileSync(out+'/fixtures.json',JSON.stringify(fixtures))
 const snapshots=await prisma.$queryRaw<any[]>`SELECT training_feedback_snapshot->>'schemaVersion' AS version,COUNT(*)::int AS n,AVG(pg_column_size(training_feedback_snapshot)) AS bytes FROM composite_assessment_attempts WHERE composite_assessment_id=${input.compositeId} GROUP BY 1`
 writeFileSync(out+'/snapshot-versions.json',JSON.stringify(snapshots));console.log('TRAINING_STARTS_READY',JSON.stringify(snapshots))
}
main().finally(async()=>{await(await import('../src/config/queue')).closeQueues(true);await prisma.$disconnect()}).catch(error=>{console.error(error);process.exitCode=1})
