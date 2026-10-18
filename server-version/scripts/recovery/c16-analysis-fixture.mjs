/** Explicit synthetic analysis fixture, never a browser/respondent submission.
 * Creates new Training courses/tasks/participants/accepted typed facts only.
 * Original FULL02 definitions, FINALs, hashes, scores and jobs are never edited.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend')
const require=createRequire(path.join(backend,'package.json'))
const {canonicalHash}=require(path.join(backend,'dist/modules/assessment-runtime/canonical.js'))
const {encryptUnifiedRuntimePayload}=require(path.join(backend,'dist/modules/assessment-runtime/security.js'))
const {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet,formSectionSlotKey}=require(path.join(backend,'dist/modules/assessment-runtime/slot-set.js'))
const {mapCompositeSection}=require(path.join(backend,'dist/modules/assessment-runtime/form-section-definition.js'))
const {createTypedFormSectionCollectionFacts}=require(path.join(backend,'dist/modules/assessment-runtime/form-facts.js'))
const {typedCompositeFormQuestion}=require(path.join(backend,'dist/modules/assessment-runtime/typed-form.js'))
const {assertTypedCompositeFormFacts}=require(path.join(backend,'dist/modules/assessment-runtime/typed-form-facts.js'))

export async function createAnalysisFixture({prisma,teacherId,passwordHash,incomparable=false}){
 assert.equal(process.env.NODE_ENV,'test');assert.equal(new URL(process.env.DATABASE_URL).hostname,'127.0.0.1')
 assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime')
 const course=await prisma.course.create({data:{creatorId:teacherId,title:'C16 SYNTHETIC numeric longitudinal qualification',courseCode:'C16-'+randomUUID(),courseType:'TRAINING_COURSE',status:'PUBLISHED'}})
 const waves=[]
 for(let index=0;index<2;index++){
  const task=await prisma.compositeAssessment.create({data:{code:'C16-'+randomUUID(),name:`C16 SYNTHETIC wave ${index+1}`,description:'Synthetic typed numeric PG fixture; not participant or browser FINAL evidence',createdBy:teacherId,courseId:course.id,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',status:'PUBLISHED',publishedAt:new Date(Date.now()-60000+index),maxAttempts:100}})
  const section=await prisma.compositeFormSection.create({data:{compositeAssessmentId:task.id,title:'SYNTHETIC numeric facts',position:0}})
  const definition={itemKey:'c16_numeric_value',type:'NUMBER',prompt:incomparable&&index===1?'Different synthetic measurement':'Synthetic numeric measure',required:false,options:[],rows:[],precision:8}
  const item=await prisma.compositeAssessmentItem.create({data:{compositeAssessmentId:task.id,type:'FORM',position:0,required:false,formType:'number',formLabel:definition.prompt,formDefinition:definition,formSectionId:section.id,formSectionPosition:0}})
  const mapped=mapCompositeSection({...section,items:[item]});typedCompositeFormQuestion(mapped.items[0])
  const slots=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:formSectionSlotKey(section.id),unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:section.id,version:'1',hash:canonicalHash(mapped)},sourceBinding:{sectionId:section.id}}]})
  waves.push({task,section,item,mapped,slots,index})
 }
 return {schemaVersion:1,label:'SYNTHETIC_DATABASE_FIXTURE_NOT_BROWSER_OR_NEW_SCORING',courseId:course.id,teacherId,passwordHash,waves,participants:[],attempts:[],selector:{schemaVersion:1,courseId:course.id,mode:'PAIRWISE',waves:waves.map((wave,index)=>({waveKey:`wave_${index+1}`,taskId:wave.task.id,publication:wave.task.publishedAt.toISOString(),configDigest:null,variantKey:null,metrics:[{itemId:wave.item.id,metricKey:'c16_numeric_value'}]}))}}
}

export async function addParticipants(prisma,fixture,count,options={}){
 const target=count-fixture.participants.length;assert.ok(target>0)
 const users=Array.from({length:target},(_,offset)=>({id:randomUUID(),username:'c16-synthetic-'+randomUUID(),passwordHash:fixture.passwordHash,role:'STUDENT',accountDomain:'TRAINING',isActive:true,mustChangePassword:false,index:fixture.participants.length+offset+1}))
 await prisma.user.createMany({data:users.map(({index,...user})=>user)})
 await prisma.courseStudent.createMany({data:users.map(user=>({courseId:fixture.courseId,studentId:user.id,status:'ACTIVE'}))})
 const parents=[],snapshots=[]
 for(const user of users)for(const wave of fixture.waves){
  if(options.omitSecond&&wave.index===1)continue
  const id=randomUUID(),sourceAttemptId=randomUUID(),submissionId=randomUUID(),completedAt=new Date(),value=options.missingFirst&&wave.index===0?null:user.index+10*wave.index,status=options.nonFinalSecond&&wave.index===1?'IN_PROGRESS':'COMPLETED'
  const facts=createTypedFormSectionCollectionFacts({sectionKey:wave.section.id,items:[{key:wave.item.id,label:wave.item.formLabel,value}]})
  assertTypedCompositeFormFacts(wave.mapped,facts)
  parents.push({id,compositeAssessmentId:wave.task.id,userId:user.id,participantKey:'c16-synthetic:'+user.id,deliveryCourseId:fixture.courseId,status,runtimeGeneration:'UNIFIED_V1',deliveryMode:'FINAL_ONLY',attemptEpoch:1,attemptNo:1,progress:100,completedItems:1,completedAt,taskSatisfaction:'SATISFIED',frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(wave.slots),frozenActiveSlotSetHash:wave.slots.snapshotHash,aggregateInputHash:canonicalHash({synthetic:true,user:user.id,wave:wave.index,value})})
  if(status==='COMPLETED')snapshots.push({id:randomUUID(),compositeAttemptId:id,attemptEpoch:1,slotKey:formSectionSlotKey(wave.section.id),unitType:'FORM_SECTION',terminalState:'COMPLETED',payloadKind:'COLLECTION_FACTS',sourceType:'COMPOSITE_FORM_SECTION',sourceAttemptId,sourceSubmissionId:submissionId,sourceDefinitionHash:canonicalHash(wave.mapped),collectionFactsEncrypted:encryptUnifiedRuntimePayload(facts),completedAt})
  fixture.attempts.push({id,userId:user.id,index:user.index,waveIndex:wave.index,value})
 }
 await prisma.compositeAssessmentAttempt.createMany({data:parents});await prisma.assessmentUnitSnapshot.createMany({data:snapshots})
 fixture.participants.push(...users.map(({passwordHash,...user})=>user))
}

export async function addDuplicate(prisma,fixture){
 const original=await prisma.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:fixture.attempts[0].id}})
 const snapshots=await prisma.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:original.id}})
 const duplicate=await prisma.compositeAssessmentAttempt.create({data:{...original,id:randomUUID(),attemptNo:2,recoveryTokenHash:null}})
 await prisma.assessmentUnitSnapshot.createMany({data:snapshots.map(row=>({...row,id:randomUUID(),compositeAttemptId:duplicate.id,sourceAttemptId:randomUUID(),sourceSubmissionId:randomUUID()}))})
 return duplicate
}
