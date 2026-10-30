import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {projectPersonalChanges,type PersonalChanges} from '../reporting/personal-tracking'
import {lockPersonalTrackingSubject} from '../anonymous-study/service'
import {readTrainingTracking} from './personal-tracking'
import {readTrainingPersonalLeafs} from './personal-tracking-results'
import {compositeForbidden} from './composite.errors'
import {evaluateTrainingFeedbackForAttempt} from './training-feedback-binding'
type Proof={userId:string;study?:never}|{userId?:never;study:{studyId:string;credential:string}}
function fail():never{throw compositeForbidden('本人变化报告不可访问')}

/** On-demand SELF projection; FINAL and answer persistence remain unchanged. */
export async function readTrainingPersonalChanges(attemptId:string,proof:Proof){
 return prisma.$transaction(async tx=>{
  const study=proof.study?await lockPersonalTrackingSubject(tx,proof.study.studyId,proof.study.credential):null
  const end=await tx.compositeAssessmentAttempt.findUnique({where:{id:attemptId},include:{compositeAssessment:true}})
  if(!end||end.status!=='COMPLETED'||!end.completedAt||end.assignmentRef||end.subjectUserId&&end.subjectUserId!==end.userId
   ||end.respondentUserId&&end.respondentUserId!==end.userId)fail()
  if(proof.userId?end!.userId!==proof.userId:(!study?.attemptIds.includes(attemptId)||end!.userId!==null))fail()
  const publication=end!.compositeAssessment
  const courseId=end!.deliveryCourseId??(publication.productKind==='ASSESSMENT_BUNDLE'?publication.courseId:null)
  if(!publication.personalTrackingBaselineId)return {status:'NOT_CONFIGURED' as const}
  if(!publication.createdBy||!['PUBLISHED','ARCHIVED'].includes(publication.status)||!['QUESTIONNAIRE','ASSESSMENT_BUNDLE'].includes(publication.productKind))fail()
  const creator=await tx.user.findUnique({where:{id:publication.createdBy},select:{isActive:true,isFrozen:true,expiresAt:true,accountDomain:true}})
  if(!creator?.isActive||creator.isFrozen||creator.expiresAt&&creator.expiresAt<=new Date()||!['LEGACY','TRAINING'].includes(creator.accountDomain))fail()
  if(proof.userId){
   const person=await tx.user.findUnique({where:{id:proof.userId},select:{isActive:true,isFrozen:true,accountDomain:true,expiresAt:true}})
   if(!person?.isActive||person.isFrozen||person.expiresAt&&person.expiresAt<=new Date()||!['LEGACY','TRAINING'].includes(person.accountDomain))fail()
   if(!courseId||!await tx.courseStudent.findFirst({where:{studentId:proof.userId,courseId,
    status:{in:['ACTIVE','APPROVED']},course:{courseType:'TRAINING_COURSE',isLibrary:false}}}))fail()
   // Serializes append-only projection writes for this own-view anchor.
   await tx.$queryRaw`SELECT id FROM composite_assessment_attempts WHERE id=${attemptId} FOR UPDATE`
  }
  const baseline=await tx.compositeAssessment.findUnique({where:{id:publication.personalTrackingBaselineId!}})
  const plan=readTrainingTracking(baseline?.personalTracking)?.plan
  if(!plan||baseline?.createdBy!==publication.createdBy||plan.baselineWaveId!==baseline.id)fail()
  const waves=await tx.compositeAssessment.findMany({where:{personalTrackingBaselineId:baseline!.id,
   personalTrackingOrdinal:{lte:publication.personalTrackingOrdinal!},createdBy:publication.createdBy},
   orderBy:{personalTrackingOrdinal:'asc'},take:100,select:{id:true,personalTrackingOrdinal:true}})
  const ids=waves.map(w=>w.id)
  if(!ids.includes(publication.id)||!ids.includes(baseline!.id))fail()
  const latest=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
   SELECT DISTINCT ON (a.composite_assessment_id) a.id FROM composite_assessment_attempts a
   JOIN composite_assessments c ON c.id=a.composite_assessment_id
   WHERE a.composite_assessment_id IN (${Prisma.join(ids)}) AND a.status='COMPLETED' AND a.completed_at IS NOT NULL
    AND a.assignment_ref IS NULL AND (a.subject_user_id IS NULL OR a.subject_user_id=a.user_id)
    AND (a.respondent_user_id IS NULL OR a.respondent_user_id=a.user_id)
    AND ${proof.userId?Prisma.sql`a.user_id=${proof.userId} AND (a.delivery_course_id=${courseId}
      OR (a.delivery_course_id IS NULL AND c.product_kind='ASSESSMENT_BUNDLE' AND c.course_id=${courseId}))`:
      Prisma.sql`a.user_id IS NULL AND a.id IN (${Prisma.join(study!.attemptIds.length?study!.attemptIds:[''])})`}
   ORDER BY a.composite_assessment_id,a.completed_at DESC,a.id DESC`)
  const parents=latest.length?await tx.compositeAssessmentAttempt.findMany({where:{id:{in:latest.map(a=>a.id)}},include:{compositeAssessment:true}}):[]
  const now=new Date()
  const leaves=await readTrainingPersonalLeafs(tx,{scopedSubjectId:proof.userId??study!.scopedSubjectId,plan:plan!,parents})
  // Own credential/membership/current owner checks above run before all cache
  // reads. Frozen per-attempt disclosure and release timing enter the identity.
  const sourceHash=canonicalHash({kind:'TRAINING_PERSONAL_CHANGES_V1',plan:plan!,subject:proof.userId??study!.scopedSubjectId,
   eligibility:leaves.map(leaf=>({waveId:leaf.waveId,sourceHash:leaf.sourceHash,metrics:Object.fromEntries(Object.entries(leaf.metrics).map(([id,m])=>[id,{visible:m.visible,pending:m.pending??false}]))})),
   waves:waves.map(w=>({id:w.id,ordinal:w.personalTrackingOrdinal})),
   parents:parents.map(p=>({id:p.id,epoch:p.attemptEpoch,completedAt:p.completedAt?.toISOString(),result:p.aggregateInputHash,
    binding:p.trainingContentBindingHash,tracking:p.compositeAssessment.personalTracking,
    feedback:evaluateTrainingFeedbackForAttempt(p,{now,reportReady:true})}))})
  // Result-source lifecycle checks belong to the adapter even on cache hits.
  const [cached]=await tx.$queryRaw<Array<{cipher:string|null}>>`SELECT personal_changes_snapshots->>${sourceHash} AS cipher FROM composite_assessment_attempts WHERE id=${attemptId}`
  const saved=cached?.cipher
  if(saved){
   const snapshot=decryptUnifiedRuntimePayload<{sourceHash:string;generatedAt:string;report:PersonalChanges}>(saved)
   if(snapshot.sourceHash!==sourceHash)fail()
   return {...snapshot.report,reportId:sourceHash,generatedAt:snapshot.generatedAt}
  }
  const report=projectPersonalChanges(plan!,waves.map(w=>({id:w.id,ordinal:w.personalTrackingOrdinal!})),leaves)
  if(report.status!=='AVAILABLE')return report
  const generatedAt=now.toISOString(),cipher=encryptUnifiedRuntimePayload({sourceHash,generatedAt,report})
  await tx.$executeRaw`UPDATE composite_assessment_attempts SET personal_changes_snapshots=personal_changes_snapshots||jsonb_build_object(${sourceHash},${cipher}) WHERE id=${attemptId}`
  return {...report,reportId:sourceHash,generatedAt}
 })
}
