import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {trainingContentSnapshotSchema} from '../composite/training-content-binding'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentReleaseError} from '../measurement-content/release'
import {decryptAssessmentContext,assessmentContextHashMatches} from '../assessment-context/security'
import type {ReferenceContext} from '../assessment-reference/reference'
import {loadTrainingMetricDisclosure} from '../composite/training-metric-disclosure'

const uuid=z.string().uuid(),digest=z.string().regex(/^[a-f0-9]{64}$/)
export const trainingReinterpretationContextSchema=z.object({actorId:uuid,courseId:uuid,compositeId:uuid,attemptId:uuid,grantId:uuid}).strict()
export type TrainingReinterpretationContext=z.infer<typeof trainingReinterpretationContextSchema>
export class TrainingReinterpretationError extends ContentReleaseError {readonly statusCode=409}
export function interpretationFail(code='SOURCE_IDENTITY_MISMATCH'):never{throw new TrainingReinterpretationError('CONTENT_TRAINING_INTERPRETATION_'+code)}
const deny=():never=>{throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')}
const bindingSchema=trainingContentSnapshotSchema.extend({attemptId:uuid,epoch:z.number().int().positive(),publicationHash:digest}).strict()
export type TrainingInterpretationParent={id:string;compositeAssessmentId:string;attemptEpoch:number;aggregateInputHash:string|null;
 trainingContentBinding:unknown;trainingContentBindingHash:string|null;trainingContentInterpretationEncrypted:string|null;trainingContentInterpretationHash:string|null;
 trainingReferenceBinding?:unknown;trainingReferenceBindingHash?:string|null;
 contextSnapshotEncrypted:string|null;contextSnapshotHash:string|null;assignmentRef:string|null;status:string;deliveryMode:string;runtimeGeneration:string|null;deliveryCourseId:string|null}
/** Current course data scope intersects the separately issued exact-attempt grant.
 * No administrator projection, report edit grant or public link grants data access.
 * Lock order is course -> user -> composite/delivery -> exact FINAL -> grant.
 */
export async function authorizeTrainingReinterpretation(tx:Prisma.TransactionClient,raw:TrainingReinterpretationContext){
 const c=trainingReinterpretationContextSchema.parse(raw)
 const [course]=await tx.$queryRaw<Array<{creator_id:string;course_type:string;is_library:boolean}>>(Prisma.sql`
  SELECT creator_id,course_type,is_library FROM courses WHERE id=${c.courseId} FOR SHARE`)
 if(!course||course.creator_id!==c.actorId||course.course_type!=='TRAINING_COURSE'||course.is_library)deny()
 const [user]=await tx.$queryRaw<Array<{role:string;teacher_approved:boolean;account_domain:string;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
  SELECT role::text,teacher_approved,account_domain,is_active,is_frozen,must_change_password,expires_at FROM users WHERE id=${c.actorId} FOR SHARE`)
 if(!user||user.role!=='TEACHER'||!user.teacher_approved||!['TRAINING','LEGACY'].includes(user.account_domain)||!user.is_active||user.is_frozen||user.must_change_password)deny()
 const [task]=await tx.$queryRaw<Array<{created_by:string;course_id:string|null;product_kind:string;questionnaire_type:string|null}>>(Prisma.sql`
  SELECT created_by,course_id,product_kind,questionnaire_type::text FROM composite_assessments WHERE id=${c.compositeId} FOR SHARE`)
 const delivery=await tx.$queryRaw<Array<{course_id:string}>>(Prisma.sql`
  SELECT course_id FROM questionnaire_course_deliveries WHERE composite_id=${c.compositeId} AND course_id=${c.courseId} FOR SHARE`)
 if(!task||task.created_by!==c.actorId||!['QUESTIONNAIRE','LEGACY_COMPOSITE'].includes(task.product_kind)||
  (task.product_kind==='QUESTIONNAIRE'?(task.questionnaire_type!=='COURSE'||delivery.length!==1):task.course_id!==c.courseId))deny()
 const [parent]=await tx.$queryRaw<TrainingInterpretationParent[]>(Prisma.sql`
  SELECT id,composite_assessment_id AS "compositeAssessmentId",attempt_epoch AS "attemptEpoch",aggregate_input_hash AS "aggregateInputHash",
   training_content_binding AS "trainingContentBinding",training_content_binding_hash AS "trainingContentBindingHash",
   training_reference_binding AS "trainingReferenceBinding",training_reference_binding_hash AS "trainingReferenceBindingHash",
   training_content_interpretation_encrypted AS "trainingContentInterpretationEncrypted",training_content_interpretation_hash AS "trainingContentInterpretationHash",
   context_snapshot_encrypted AS "contextSnapshotEncrypted",context_snapshot_hash AS "contextSnapshotHash",assignment_ref AS "assignmentRef",
   status::text,delivery_mode::text AS "deliveryMode",runtime_generation::text AS "runtimeGeneration",delivery_course_id AS "deliveryCourseId"
  FROM composite_assessment_attempts WHERE id=${c.attemptId} AND composite_assessment_id=${c.compositeId} AND delivery_course_id=${c.courseId} FOR SHARE`)
 if(!parent||parent.id!==c.attemptId||parent.compositeAssessmentId!==c.compositeId||parent.deliveryCourseId!==c.courseId||parent.status!=='COMPLETED'
  ||parent.deliveryMode!=='FINAL_ONLY'||parent.runtimeGeneration!=='UNIFIED_V1'||parent.assignmentRef)deny()
 await recheckTrainingReinterpretationAuthority(tx,c)
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock||user.expires_at&&user.expires_at<=clock.now)deny()
 return parent
}
export function recheckTrainingReinterpretationAuthority(tx:Prisma.TransactionClient,c:TrainingReinterpretationContext){
 return assertContentAuthority(tx,{actorId:c.actorId,grantId:c.grantId,capability:'data.reinterpret',scope:{product:'TRAINING',scopeKind:'COURSE',
  scopeId:c.courseId,resourceKind:'data',resourceKeys:[c.attemptId]}})
}
export function trainingInterpretationSource(parent:TrainingInterpretationParent,itemId:string){
 const receipt=decodeTrainingFinalReceipt(parent)
 if(!receipt)interpretationFail('FINAL_RECEIPT_REQUIRED')
 const binding=bindingSchema.parse(parent.trainingContentBinding),unit=binding.units.find(row=>row.itemId===itemId)
 if(!unit||canonicalHash(binding)!==parent.trainingContentBindingHash)interpretationFail()
 const execution=receipt.interpretation.units.find(row=>row.instrumentKey===itemId),source=receipt.sources.find(row=>row.itemId===itemId)
 if(!execution||(!source&&execution.reason!=='NOT_EXECUTED')||(source&&execution.reason==='NOT_EXECUTED'))interpretationFail()
 let populationContext:ReferenceContext={}
 if(parent.contextSnapshotEncrypted!==null||parent.contextSnapshotHash!==null){
  if(!parent.contextSnapshotEncrypted||!parent.contextSnapshotHash)interpretationFail()
  const context=decryptAssessmentContext(parent.contextSnapshotEncrypted)
  if(!assessmentContextHashMatches(context,parent.contextSnapshotHash))interpretationFail()
  populationContext=context.values
 }
 return {binding,receipt,unit,source,populationContext}
}
/** One exact unit read. Source result hash + provenance are the same FINAL receipt
 * witnesses used by the staff report reader. Never read raw answers or rescore.
 */
async function readTrainingInterpretationRow(tx:Prisma.TransactionClient,parent:TrainingInterpretationParent,source:ReturnType<typeof trainingInterpretationSource>){
 if(!source.source)return null
 const type=source.unit.family==='SJT'?'SITUATIONAL':source.unit.family,slotKey=compositeItemSlotKey(source.unit.itemId,type)
 const rows=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey},select:{
  compositeAttemptId:true,attemptEpoch:true,slotKey:true,unitType:true,terminalState:true,payloadKind:true,canonicalResultEncrypted:true,sourceType:true,sourceAttemptId:true,sourceSubmissionId:true}})
 if(rows.length!==1)interpretationFail()
 const row=rows[0]
 if(row.compositeAttemptId!==parent.id||row.attemptEpoch!==parent.attemptEpoch||row.slotKey!==slotKey||row.unitType!==type
  ||row.terminalState!=='COMPLETED'||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted)interpretationFail()
 return row
}
/** Stored artifact reads recheck current disclosure without reinterpreting,
 * rerendering, or modifying the immutable artifact or source result. */
export async function readTrainingInterpretationDisclosure(tx:Prisma.TransactionClient,parent:TrainingInterpretationParent,
 source:ReturnType<typeof trainingInterpretationSource>,metricKeys:readonly string[]){
 const row=await readTrainingInterpretationRow(tx,parent,source)
 return row?loadTrainingMetricDisclosure(tx,{parent,unit:source.unit,source:row,audience:'teacher',metricKeys}):null
}
export async function readTrainingInterpretationFacts(tx:Prisma.TransactionClient,parent:TrainingInterpretationParent,source:ReturnType<typeof trainingInterpretationSource>){
 const row=await readTrainingInterpretationRow(tx,parent,source)
 if(!row)return {notExecuted:true,quality:undefined,metrics:[],core:null,disclosure:null}
 const type=source.unit.family==='SJT'?'SITUATIONAL':source.unit.family
 const envelopes=await loadStoredCanonicalUnitResults([row.canonicalResultEncrypted!],tx)
 if(envelopes.length!==1)interpretationFail()
 const envelope=envelopes[0],core=envelope.core
 if(envelope.resultHash!==source.source!.resultHash||core.unitType!==type||core.contextHash!==parent.contextSnapshotHash
  ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
  ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null)||new Set(core.metrics.map(m=>m.key)).size!==core.metrics.length)interpretationFail()
 const disclosure=await loadTrainingMetricDisclosure(tx,{parent,unit:source.unit,source:row,audience:'teacher',core})
 return {notExecuted:false,quality:core.quality.status,core,disclosure,metrics:core.metrics.filter(m=>disclosure.metricKeys.has(m.key)).map(m=>({key:m.key,
  value:typeof m.value==='number'&&Number.isFinite(m.value)?m.value:null,status:m.quality===undefined||['calculated','OK','interpretable'].includes(m.quality)?'OK':'UNAVAILABLE'}))}
}
