import {assertEducationRuntimeContentScope} from './education-content-scope'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { compositeForbidden } from './composite.errors'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getContentRelease } from '../measurement-content/repository'
import { ContentReleaseError, prepareRelease } from '../measurement-content/release'
import type { TrainingContentSnapshot } from './training-content-binding'
import {validateTrainingStandardDerivedContent} from './training-standard-content'

type Stored = NonNullable<Awaited<ReturnType<typeof getContentRelease>>>
export const trainingReportSelectionSchema = z.object({schemaVersion:z.literal(1),units:z.array(z.object({
  itemId:z.string().guid(),reportReleaseId:z.string().guid(),
}).strict()).max(1000)}).strict().superRefine((value,ctx)=>{
  if(new Set(value.units.map(unit=>unit.itemId)).size!==value.units.length)ctx.addIssue({code:'custom',message:'Duplicate report selection item'})
})
class TrainingReportSelectionError extends ContentReleaseError { readonly statusCode=409 }
function fail():never { throw new TrainingReportSelectionError('CONTENT_TRAINING_REPORT_SELECTION_INVALID') }

/** Owner use of an already published private report. This confers no authoring capability. */
export async function validateTrainingReportPointer(db:Prisma.TransactionClient,input:{
  unit:TrainingContentSnapshot['units'][number];compositeId:string;ownerId:string;
  reportReleaseId:string;contentHash?:string;publication:boolean;releases:Map<string,Stored>
}) {
  let report=input.releases.get(input.reportReleaseId)
  if(!report){const loaded=await getContentRelease(db,input.reportReleaseId,true);if(!loaded)fail();report=loaded;input.releases.set(report.releaseId,report)}
  if(input.unit.source.standardCombination){
    if(report.layer!=='REPORT'||input.contentHash!==undefined&&report.contentHash!==input.contentHash||input.publication&&report.status!=='PUBLISHED')fail()
    await validateTrainingStandardDerivedContent(db,input.unit,report,{compositeId:input.compositeId,ownerId:input.ownerId})
    return {releaseId:report.releaseId,contentHash:report.contentHash}
  }
  const scope=report.scope
  if(scope.kind==='PLATFORM'||scope.kind==='PRIVATE'&&['SCHOOL','TEACHER'].includes(scope.product)){
    if(report.layer!=='REPORT'||report.family!==input.unit.family||input.publication&&report.status!=='PUBLISHED'
      ||input.contentHash!==undefined&&report.contentHash!==input.contentHash)fail()
    const source=await assertEducationRuntimeContentScope(db,{...input,release:report})
    const measurement=input.releases.get(input.unit.measurement.releaseId)??source.releases.get(input.unit.measurement.releaseId)
    if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.contentHash!==input.unit.measurement.contentHash
      ||report.content.measurements.length!==1||report.content.measurements[0].releaseId!==measurement.releaseId
      ||report.content.measurements[0].contentHash!==measurement.contentHash
      ||report.content.audience!==(source.origin.product==='TEACHER'?'teacher':'student')
      ||report.content.metricKeys.some(key=>!measurement.content.metrics.some(metric=>metric.metricKey===key)))fail()
    return {releaseId:report.releaseId,contentHash:report.contentHash}
  }
  if(report.layer!=='REPORT'||report.family!==input.unit.family||scope.kind!=='PRIVATE'||scope.product!=='TRAINING'
    ||scope.ownerId!==input.ownerId||scope.resourceId!==input.compositeId||input.publication&&report.status!=='PUBLISHED'
    ||input.contentHash!==undefined&&report.contentHash!==input.contentHash||prepareRelease({layer:report.layer,family:report.family,key:report.key,version:report.version,scope:report.scope,assetRefs:report.assetRefs,sourceReleaseId:report.sourceReleaseId,provenance:report.provenance,content:report.content}).contentHash!==report.contentHash)fail()
  if(!['teacher','researcher'].includes(report.content.audience)||report.assetRefs.length
    ||report.content.measurements.length!==1||report.content.measurements[0].releaseId!==input.unit.measurement.releaseId
    ||report.content.measurements[0].contentHash!==input.unit.measurement.contentHash)fail()
  const measurement=input.releases.get(input.unit.measurement.releaseId)
  if(!measurement||measurement.layer!=='MEASUREMENT'||measurement.contentHash!==input.unit.measurement.contentHash
    ||report.content.metricKeys.some(key=>!measurement.content.metrics.some(metric=>metric.metricKey===key)))fail()
  return {releaseId:report.releaseId,contentHash:report.contentHash}
}
export async function attachTrainingReportSelection(db:Prisma.TransactionClient,input:{
  snapshot:TrainingContentSnapshot;releases:Map<string,Stored>;ownerId:string;selection:unknown
}) {
  if(input.selection==null)return {snapshot:input.snapshot,snapshotHash:canonicalHash(input.snapshot)}
  const selection=trainingReportSelectionSchema.parse(input.selection)
  const byItem=new Map(input.snapshot.units.map(unit=>[unit.itemId,unit]))
  const pointers=new Map<string,{releaseId:string;contentHash:string}>()
  for(const selected of selection.units){
    const unit=byItem.get(selected.itemId);if(!unit)fail()
    pointers.set(unit.itemId,await validateTrainingReportPointer(db,{unit,compositeId:input.snapshot.compositeId,
      ownerId:input.ownerId,reportReleaseId:selected.reportReleaseId,publication:true,releases:input.releases}))
  }
  const snapshot={...input.snapshot,units:input.snapshot.units.map(unit=>({...unit,...(pointers.has(unit.itemId)?{report:pointers.get(unit.itemId)!}:{})}))}
  return {snapshot,snapshotHash:canonicalHash(snapshot)}
}

export async function assertCurrentTrainingContentOwner(tx:Prisma.TransactionClient,actor:{userId:string},row:any) {
  // Selecting an installed, already authorized profile may publish this owned
  // execution instance; it confers no platform config or new runner authoring.
  const [principal]=await tx.$queryRaw<Array<{role:string;account_domain:string;teacher_approved:boolean;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
    SELECT role::text,account_domain,teacher_approved,is_active,is_frozen,must_change_password,expires_at
    FROM users WHERE id=${actor.userId} FOR SHARE`)
  const courseIds:string[]=(row.questionnaireCourses??[]).map((entry:any)=>entry.courseId)
  if(row.questionnaireType==='COURSE') {
    if(!courseIds.length)throw compositeForbidden('测量实例须属于真实 Training 课程')
    const currentCourses=await tx.$queryRaw<Array<{id:string;creator_id:string;course_type:string;is_library:boolean}>>(Prisma.sql`
      SELECT id,creator_id,course_type,is_library FROM courses WHERE id IN (${Prisma.join(courseIds)}) ORDER BY id FOR SHARE`)
    if(currentCourses.length!==new Set(courseIds).size||currentCourses.some(course=>course.creator_id!==actor.userId||course.course_type!=='TRAINING_COURSE'||course.is_library))
      throw compositeForbidden('测量实例须属于本人 Training 课程')
  }
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!principal||row.createdBy!==actor.userId||principal.role!=='TEACHER'||!principal.teacher_approved
    ||!['TRAINING','LEGACY'].includes(principal.account_domain)||!principal.is_active||principal.is_frozen||principal.must_change_password
    ||!clock||principal.expires_at&&principal.expires_at<=clock.now)throw compositeForbidden('测量实例发布需要当前真实作者资格')
  return principal.expires_at
}
