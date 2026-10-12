import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { encryptScaleAnswers,readScaleResult,scaleDefinitionFromRecord } from '../scale/scale-workflow.service'
import { runnerDefinition,hashScaleDefinition } from '../scale/scale-definition'
import { standaloneAdmissionPersistence } from '../scale/scale-admission.service'
import { freezeScaleRuntimeAtAttemptStart,encryptFrozenScaleRuntimeSnapshot,
  decryptFrozenScaleRuntimeSnapshot } from '../assessment-runtime/runtime-snapshot'
import { submitScaleAssessmentFinal,type FinalScaleAnswerInput } from '../scale/scale-final-submit.service'
import { releasedTeacherScaleEntry } from './scaleLicense.service'

export class TeacherPersonalAssessmentError extends Error{
  constructor(public readonly code:string,public readonly statusCode=409){
    super(code);this.name='TeacherPersonalAssessmentError'
  }
}
function reject(code:string,status=409):never {throw new TeacherPersonalAssessmentError(code,status)}
type Tx=Prisma.TransactionClient
type CurrentResource={resourceId:string;key:string;version:string;scaleId:string;
  definitionHash:string;title:string}
const eligible=async(tx:Tx,userId:string)=>{
  const person=await tx.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM "users" WHERE "id"=${userId}
      AND "account_domain"='SCHOOL' AND "role" IN ('TEACHER','ADMIN')
      AND "teacher_approved"=TRUE AND "is_active"=TRUE
      AND "is_frozen"=FALSE AND "must_change_password"=FALSE
      AND ("expires_at" IS NULL OR "expires_at">statement_timestamp())
    FOR SHARE
  `
  if(!person.length)reject('HUITEACHER_PERSONAL_ACCOUNT_UNAVAILABLE',403)
}
const currentResource=async(tx:Tx,userId:string,resourceId:string):Promise<CurrentResource>=>{
  const list=await tx.$queryRaw<CurrentResource[]>`
    SELECT r."id" AS "resourceId",r."resource_key" AS "key",
      r."resource_version" AS "version",r."scale_id" AS "scaleId",
      r."definition_hash" AS "definitionHash",
      r."entry"->>'title' AS "title"
    FROM "huiteacher_personal_scale_grants" grant_row
    JOIN "registered_assessment_resources" r
      ON r."id"=grant_row."resource_id"
      AND r."status"='PUBLISHED'
    WHERE grant_row."user_id"=${userId}
      AND grant_row."resource_id"=${resourceId}
      AND grant_row."status"='ACTIVE'
    FOR SHARE OF grant_row,r
  `
  if(!list.length)reject('HUITEACHER_PERSONAL_RESOURCE_NOT_GRANTED',403)
  const row=list[0]
  const released=await releasedTeacherScaleEntry(tx,{
    family:'SCALE',key:row.key,version:row.version,
  })
  if(released.id!==row.resourceId||released.scaleId!==row.scaleId
    ||released.definitionHash!==row.definitionHash)
    reject('HUITEACHER_PERSONAL_RESOURCE_INTEGRITY')
  return row
}

/** Personal entitlement catalog: exact pilot resources only. No school
 * activation, legacy materials, psychologist permissions or org membership.
 */
export async function listPersonalTeacherScales(userId:string){
  return prisma.$transaction(async tx=>{
    await eligible(tx,userId)
    const list=await tx.$queryRaw<CurrentResource[]>`
      SELECT r."id" AS "resourceId",r."resource_key" AS "key",
        r."resource_version" AS "version",r."scale_id" AS "scaleId",
        r."definition_hash" AS "definitionHash",
        r."entry"->>'title' AS "title"
      FROM "huiteacher_personal_scale_grants" grant_row
      JOIN "registered_assessment_resources" r
        ON r."id"=grant_row."resource_id" AND r."status"='PUBLISHED'
      WHERE grant_row."user_id"=${userId}
        AND grant_row."status"='ACTIVE'
      ORDER BY r."id" LIMIT 51
    `
    const available=[]
    for(const row of list.slice(0,50)){
      await releasedTeacherScaleEntry(tx,{family:'SCALE',key:row.key,version:row.version})
      available.push({resourceId:row.resourceId,title:row.title,version:row.version,
        scientificMaturity:'PILOT' as const,reportMode:'PERSONAL_ONLY' as const})
    }
    return {list:available,truncated:list.length>50}
  })
}

export async function startPersonalTeacherScale(input:{userId:string;resourceId:string}){
  return prisma.$transaction(async tx=>{
    // Lock user to serialize two same-account START calls. Different school
    // products and other users remain independent.
    const account=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "users" WHERE "id"=${input.userId}
        AND "account_domain"='SCHOOL' AND "role" IN ('TEACHER','ADMIN')
        AND "teacher_approved"=TRUE AND "is_active"=TRUE
        AND "is_frozen"=FALSE AND "must_change_password"=FALSE
        AND ("expires_at" IS NULL OR "expires_at">statement_timestamp())
      FOR UPDATE
    `
    if(!account.length)reject('HUITEACHER_PERSONAL_ACCOUNT_UNAVAILABLE',403)
    const release=await currentResource(tx,input.userId,input.resourceId)
    const active=await tx.$queryRaw<Array<{assessmentId:string}>>`
      SELECT binding."assessment_id" AS "assessmentId"
      FROM "huiteacher_personal_scale_attempts" binding
      JOIN "assessments" a ON a."id"=binding."assessment_id"
      WHERE binding."user_id"=${input.userId}
        AND binding."resource_id"=${input.resourceId}
        AND a."status"='IN_PROGRESS'
      ORDER BY binding."created_at" DESC LIMIT 1
    `
    if(active.length)return {assessmentId:active[0].assessmentId,
      replayed:true,kind:'HUITEACHER_PERSONAL_SCALE' as const}
    const scale=await tx.scale.findUnique({where:{id:release.scaleId}})
    if(!scale||scale.status!=='PUBLISHED'
      ||scale.definitionHash!==release.definitionHash)
      reject('HUITEACHER_PERSONAL_SCALE_CHANGED')
    const definition=scaleDefinitionFromRecord(scale)
    if(hashScaleDefinition(definition)!==release.definitionHash)
      reject('HUITEACHER_PERSONAL_SCALE_HASH_CHANGED')
    const snapshot=await freezeScaleRuntimeAtAttemptStart(tx as any,{
      instrumentKey:scale.code,instrumentVersion:scale.instrumentVersion,definition,
    })
    const assessment=await tx.assessment.create({data:{
      scaleId:scale.id,userId:input.userId,status:'IN_PROGRESS',
      deliveryMode:'FINAL_ONLY',runtimeGeneration:'UNIFIED_V1',
      runtimeSnapshotEncrypted:encryptFrozenScaleRuntimeSnapshot(snapshot),
      compiledRuntimeHash:snapshot.compiledRuntime.compiledRuntimeHash,
      ...standaloneAdmissionPersistence({
        attemptEpoch:1,userId:input.userId,
        scale:{id:scale.id,code:scale.code,name:scale.name,
          instrumentVersion:scale.instrumentVersion},
      }),
      attemptEpoch:1,progress:0,answers:encryptScaleAnswers([]),
    }})
    await tx.huiteacherPersonalScaleAttempt.create({data:{
      assessmentId:assessment.id,userId:input.userId,
      resourceId:release.resourceId,definitionHash:release.definitionHash,
    }})
    return {assessmentId:assessment.id,replayed:false,
      kind:'HUITEACHER_PERSONAL_SCALE' as const}
  },{maxWait:2000,timeout:12000})
}

async function ownedAttempt(tx:Tx,input:{userId:string;assessmentId:string}){
  await eligible(tx,input.userId)
  const row=await tx.$queryRaw<Array<{
    id:string;scaleId:string;resourceId:string;definitionHash:string;
    status:string;attemptEpoch:number;runtimeSnapshotEncrypted:string;
    result:unknown;startedAt:Date;completedAt:Date|null;
    scaleCode:string;scaleVersion:string;scaleName:string;
  }>>`
    SELECT a."id",a."scale_id" AS "scaleId",
      binding."resource_id" AS "resourceId",
      binding."definition_hash" AS "definitionHash",
      a."status",a."attempt_epoch" AS "attemptEpoch",
      a."runtime_snapshot_encrypted" AS "runtimeSnapshotEncrypted",
      a."result",a."started_at" AS "startedAt",
      a."completed_at" AS "completedAt",
      scale."code" AS "scaleCode",scale."instrument_version" AS "scaleVersion",
      scale."name" AS "scaleName"
    FROM "huiteacher_personal_scale_attempts" binding
    JOIN "assessments" a ON a."id"=binding."assessment_id"
      AND a."user_id"=binding."user_id"
      AND a."questionnaire_assessment_id" IS NULL
      AND a."composite_attempt_id" IS NULL
      AND a."delivery_mode"='FINAL_ONLY'
      AND a."runtime_generation"='UNIFIED_V1'
    JOIN "scales" scale ON scale."id"=a."scale_id"
    WHERE binding."assessment_id"=${input.assessmentId}
      AND binding."user_id"=${input.userId}
    LIMIT 1
  `
  if(!row.length)reject('HUITEACHER_PERSONAL_ASSESSMENT_NOT_FOUND',404)
  const release=await currentResource(tx,input.userId,row[0].resourceId)
  if(row[0].scaleId!==release.scaleId
    ||row[0].definitionHash!==release.definitionHash)
    reject('HUITEACHER_PERSONAL_SOURCE_INVALID')
  const frozen=decryptFrozenScaleRuntimeSnapshot(row[0].runtimeSnapshotEncrypted)
  if(frozen.legacyDefinitionHash!==release.definitionHash
    ||frozen.instrumentKey!==row[0].scaleCode
    ||frozen.instrumentVersion!==row[0].scaleVersion)
    reject('HUITEACHER_PERSONAL_FROZEN_SOURCE_INVALID')
  return {record:row[0],snapshot:frozen}
}

export async function listOwnPersonalTeacherScales(userId:string){
  return prisma.$transaction(async tx=>{
    await eligible(tx,userId)
    const rows=await tx.$queryRaw<Array<{
      assessmentId:string;resourceId:string;title:string;
      status:string;startedAt:Date;completedAt:Date|null;
    }>>`
      SELECT a."id" AS "assessmentId",
        binding."resource_id" AS "resourceId",
        scale."name" AS "title",a."status",
        a."started_at" AS "startedAt",a."completed_at" AS "completedAt"
      FROM "huiteacher_personal_scale_attempts" binding
      JOIN "assessments" a ON a."id"=binding."assessment_id"
        AND a."user_id"=binding."user_id"
      JOIN "scales" scale ON scale."id"=a."scale_id"
      JOIN "huiteacher_personal_scale_grants" grant_row
        ON grant_row."user_id"=binding."user_id"
        AND grant_row."resource_id"=binding."resource_id"
        AND grant_row."status"='ACTIVE'
      WHERE binding."user_id"=${userId}
      ORDER BY binding."created_at" DESC,binding."assessment_id" DESC
      LIMIT 101
    `
    return {list:rows.slice(0,100),truncated:rows.length>100}
  })
}

export async function readOwnPersonalTeacherScale(input:{userId:string;assessmentId:string}){
  return prisma.$transaction(async tx=>{
    const {record,snapshot}=await ownedAttempt(tx,input)
    return {assessmentId:record.id,status:record.status,
      title:record.scaleName,attemptEpoch:record.attemptEpoch,
      definitionHash:snapshot.legacyDefinitionHash,
      runner:runnerDefinition(snapshot.definition),reportMode:'PERSONAL_ONLY' as const,
      startedAt:record.startedAt,completedAt:record.completedAt}
  })
}

export async function submitOwnPersonalTeacherScale(input:{
  userId:string;assessmentId:string;submissionId:string;
  attemptEpoch:number;definitionHash:string;
  answers:FinalScaleAnswerInput[]
}){
  // Scoped admission is performed again for every submit, even after a
  // previous START. The canonical Scale FINAL performs identity, frozen
  // epoch, definition, idempotency, payload and scientific policy checks.
  await prisma.$transaction(tx=>ownedAttempt(tx,input))
  const result=await submitScaleAssessmentFinal({
    assessmentId:input.assessmentId,userId:input.userId,
    submissionId:input.submissionId,attemptEpoch:input.attemptEpoch,
    definitionHash:input.definitionHash,contextSnapshotHash:null,
    answers:input.answers,
  })
  return {assessmentId:input.assessmentId,status:'COMPLETED' as const,
    replayed:result.replayed===true,reportMode:'PERSONAL_ONLY' as const}
}

export async function readOwnPersonalTeacherScaleReport(input:{
  userId:string;assessmentId:string
}){
  return prisma.$transaction(async tx=>{
    const {record,snapshot}=await ownedAttempt(tx,input)
    if(record.status!=='COMPLETED')reject('HUITEACHER_PERSONAL_NOT_COMPLETED',409)
    const decoded=readScaleResult(record.result)
    if(decoded.decryptError||!decoded.result)reject('HUITEACHER_PERSONAL_RESULT_INVALID')
    const result=decoded.result
    if(result.instrument.scaleId!==record.scaleId
      ||result.method.definitionHash!==record.definitionHash
      ||result.method.instrumentVersion!==snapshot.instrumentVersion)
      reject('HUITEACHER_PERSONAL_RESULT_PROVENANCE_INVALID')
    if(result.quality.status==='invalid')return {
      state:'WITHHELD' as const,reason:'INVALID_RESPONSE_QUALITY'}
    // Official Scale scorer generated these metrics and wording. Only the
    // respondent receives this projection; manager/org APIs never query it.
    return {kind:'HUITEACHER_PERSONAL_DESCRIPTION' as const,
      state:'READY' as const,title:record.scaleName,
      scientificMaturity:'PILOT' as const,
      scores:result.scores.map(x=>({
        key:x.key,label:x.label,value:x.value,
        displayPrecision:x.displayPrecision,status:x.status,
        direction:x.direction,
      })),
      interpretations:result.interpretations.map(x=>({
        scoreKey:x.scoreKey,headline:x.headline,
        interpretation:x.interpretation,guidance:x.guidance,
        limitations:x.limitations,
      })),
      caveats:result.caveats,disclaimer:result.disclaimer,
      explanation:'仅用于个人反思的描述性自评。没有中国常模或教师绩效结论。',
    }
  })
}
