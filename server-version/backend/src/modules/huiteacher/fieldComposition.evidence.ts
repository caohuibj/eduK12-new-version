import {randomUUID,createHash} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {loadFrozenActiveSlotSet,formSectionSlotKey} from '../assessment-runtime/slot-set'
import {readFormSectionCollectionFacts} from '../assessment-runtime/form-facts'
import {createStoredScaleFactsReader,loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {fieldAssessmentRefSchema,fieldParticipantKey} from './fieldComposition.contract'
import {currentFieldComposition,fieldFail} from './fieldComposition.authority'

type Tx=Prisma.TransactionClient
const hash=z.string().regex(/^[a-f0-9]{64}$/)
const scopeSchema=z.object({organizationId:z.string(),eventId:z.string(),targetId:z.string(),invitationId:z.string(),acceptedAt:z.string().datetime(),
 assessmentRef:fieldAssessmentRefSchema,subjectUserId:z.string().nullable(),respondentUserId:z.string()}).strict()
const receiptSchema=z.object({slotKey:z.string(),unitType:z.enum(['SCALE','FORM_SECTION']),sourceType:z.string(),sourceAttemptId:z.string(),sourceSubmissionId:z.string(),
 sourceDefinitionHash:hash,compiledRuntimeHash:z.string().nullable(),payloadHash:hash}).strict()
const formView=z.object({kind:z.literal('FORM'),unitId:z.string(),items:z.array(z.object({key:z.string(),prompt:z.string(),state:z.string(),value:z.unknown(),rowStates:z.record(z.string(),z.string()).optional(),otherText:z.string().optional()}).strict()).max(500)}).strict()
const scaleView=z.object({kind:z.literal('SCALE'),unitId:z.string(),state:z.enum(['WITHHELD','DESCRIPTIVE']),
 metrics:z.array(z.object({key:z.string(),label:z.string(),value:z.number().finite().nullable()}).strict()).max(100)}).strict()
const payloadSchema=z.object({schemaVersion:z.literal(2),kind:z.literal('FIELD_CANONICAL_OBSERVATION'),recordId:z.string(),scope:scopeSchema,
 attemptId:z.string(),attemptEpoch:z.number().int().positive(),slotsHash:hash,finalHash:hash,receipts:z.array(receiptSchema).min(1).max(1000),units:z.array(z.union([formView,scaleView])).max(1000)}).strict()
const finalDigest=(input:{attemptId:string;attemptEpoch:number;slotsHash:string;receipts:z.infer<typeof receiptSchema>[]})=>canonicalHash({kind:'FIELD_FINAL_RECEIPT_DIGEST_V1',...input})
async function finals(tx:Tx,attemptId:string,attemptEpoch:number){
 const parent=await tx.compositeAssessmentAttempt.findUnique({where:{id:attemptId},select:{id:true,status:true,userId:true,subjectUserId:true,respondentUserId:true,participantKey:true,
  attemptEpoch:true,assignmentRef:true,compositeAssessmentId:true,contextSnapshotHash:true,frozenActiveSlotSetEncrypted:true,frozenActiveSlotSetHash:true}})
 if(!parent||parent.status!=='COMPLETED'||parent.attemptEpoch!==attemptEpoch||!parent.frozenActiveSlotSetEncrypted||!parent.frozenActiveSlotSetHash)fieldFail('HUITEACHER_FIELD_CANONICAL_FINAL_REQUIRED',409)
 const slots=await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted,tx)
 if(slots.snapshotHash!==parent.frozenActiveSlotSetHash||slots.attemptEpoch!==parent.attemptEpoch)fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
 const snapshots=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:attemptId,attemptEpoch},orderBy:{slotKey:'asc'}})
 if(snapshots.length!==slots.slots.length||snapshots.some(row=>row.terminalState!=='COMPLETED'||!['SCALE','FORM_SECTION'].includes(row.unitType)
  ||!row.sourceSubmissionId||!row.sourceDefinitionHash||!slots.slots.some(slot=>slot.slotKey===row.slotKey&&slot.unitType===row.unitType&&slot.sourceDefinitionIdentity.hash===row.sourceDefinitionHash)))
  fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
 const receipts=snapshots.map(row=>receiptSchema.parse({slotKey:row.slotKey,unitType:row.unitType,sourceType:row.sourceType,sourceAttemptId:row.sourceAttemptId,
  sourceSubmissionId:row.sourceSubmissionId,sourceDefinitionHash:row.sourceDefinitionHash,compiledRuntimeHash:row.compiledRuntimeHash,
  payloadHash:createHash('sha256').update(row.unitType==='SCALE'?row.canonicalResultEncrypted??'':row.collectionFactsEncrypted??'').digest('hex')}))
 if(snapshots.some(row=>row.unitType==='SCALE'?!row.canonicalResultEncrypted:!row.collectionFactsEncrypted))fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
 return {parent,snapshots,receipts,slotsHash:slots.snapshotHash,finalHash:finalDigest({attemptId,attemptEpoch,slotsHash:slots.snapshotHash,receipts})}
}
/** The formal purpose permits submitted Form evidence. Scale evidence remains
 * bounded by the fixed observer report declaration; no personal interpretations,
 * normative values or unselected scores are added to a professional note. */
export async function createCanonicalFieldEvidence(tx:Tx,input:{recordId:string;organizationId:string;eventId:string;actorUserId:string;attemptId?:string}){
 const {scope}=await currentFieldComposition(tx,{actorUserId:input.actorUserId,eventId:input.eventId,lock:true})
 if(scope.organizationId!==input.organizationId)fieldFail()
 const parents=await tx.$queryRaw<Array<{id:string;attemptEpoch:number}>>(Prisma.sql`SELECT id,attempt_epoch AS "attemptEpoch" FROM composite_assessment_attempts
  WHERE composite_assessment_id=${scope.assessmentRef.compositeId} AND participant_key=${fieldParticipantKey(scope)} FOR SHARE`)
 if(parents.length!==1||input.attemptId&&parents[0].id!==input.attemptId)fieldFail('HUITEACHER_FIELD_CANONICAL_FINAL_REQUIRED',409)
 const frozen=await finals(tx,parents[0].id,parents[0].attemptEpoch),{parent,snapshots}=frozen
 if(parent.participantKey!==fieldParticipantKey(scope)||parent.subjectUserId!==scope.subjectUserId||parent.respondentUserId!==scope.respondentUserId||parent.userId!==scope.respondentUserId||parent.assignmentRef!==null)
  fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
 const units:z.infer<typeof payloadSchema>['units']=[]
 const sections=await tx.compositeFormSectionAttempt.findMany({where:{attemptId:parent.id,attemptEpoch:parent.attemptEpoch,status:'COMPLETED'},
  select:{id:true,sectionId:true,submissionId:true}})
 for(const row of snapshots.filter(row=>row.unitType==='FORM_SECTION')){
  const facts=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(row.collectionFactsEncrypted!))
  const section=sections.find(section=>section.id===row.sourceAttemptId)
  if(facts.schemaVersion!==3||!section||section.submissionId!==row.sourceSubmissionId||facts.sectionKey!==section.sectionId||formSectionSlotKey(section.sectionId)!==row.slotKey)
   fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
  units.push({kind:'FORM',unitId:row.slotKey,items:facts.items.map(item=>({key:item.key,prompt:item.label,state:item.state,value:item.state==='ANSWERED'?item.value:null,
   ...(item.rowStates?{rowStates:item.rowStates}:{}),...(item.otherText!==undefined?{otherText:item.otherText}:{})}))})
 }
 const scales=snapshots.filter(row=>row.unitType==='SCALE')
 if(scales.length){
  const children=await tx.assessment.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,status:'COMPLETED'}})
  const reader=await createStoredScaleFactsReader(children,tx),canonical=await loadStoredCanonicalUnitResults(scales.map(row=>row.canonicalResultEncrypted!),tx,[],reader)
  const declarations=await tx.$queryRaw<Array<{itemId:string;audience:string|null;respondent:string|null;scores:Array<{key:string;label:string}>;allowed:string[]}>>(Prisma.sql`
   SELECT b->'itemIds'->>0 AS "itemId",v.definition#>>'{report,audienceContract,audience}' AS audience,v.definition#>>'{report,audienceContract,respondent}' AS respondent,
    (SELECT jsonb_agg(jsonb_build_object('key',s->>'key','label',s->>'label')) FROM jsonb_array_elements(v.definition#>'{scoring,scores}') s) AS scores,
    ARRAY(SELECT jsonb_array_elements_text(v.definition#>'{report,scoreOrder}')) AS allowed
   FROM composite_assessments c CROSS JOIN LATERAL jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') b
   JOIN education_private_tool_versions v ON v.id=b->>'versionId' AND v.content_hash=b->>'contentHash' AND v.kind='SCALE'
    AND v.definition->>'respondentType'='expert_report' WHERE c.id=${scope.assessmentRef.compositeId} AND b->>'kind'='SCALE'`)
  for(const [index,row] of scales.entries()){
   const child=children.find(child=>child.id===row.sourceAttemptId),result=canonical[index]
   if(!child||child.subjectUserId!==scope.subjectUserId||child.respondentUserId!==scope.respondentUserId||child.userId!==scope.respondentUserId
    ||child.submissionId!==row.sourceSubmissionId||result.core.unitType!=='SCALE'||result.core.sourceDefinitionHash!==row.sourceDefinitionHash
    ||result.core.compiledRuntimeHash!==row.compiledRuntimeHash||result.core.contextHash!==parent.contextSnapshotHash||result.persistenceProvenance.sourceType!==row.sourceType
    ||result.persistenceProvenance.sourceAttemptId!==child.id||result.persistenceProvenance.sourceSubmissionId!==child.submissionId)fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
   const declaration=declarations.find(declaration=>declaration.itemId===child.compositeItemId)
   if(!declaration)fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
   const visible=declaration.audience==='teacher'&&declaration.respondent==='OBSERVER_REPORT'
   const metrics=visible?declaration.scores.filter(score=>declaration.allowed.includes(score.key)).map(score=>{
    const metric=result.core.metrics.find(metric=>metric.key===score.key)
    if(!metric||metric.value!==null&&(typeof metric.value!=='number'||!Number.isFinite(metric.value)))fieldFail('HUITEACHER_FIELD_FINAL_INTEGRITY',409)
    return {key:score.key,label:score.label,value:result.core.quality.status==='invalid'||metric.quality==='not_calculable'?null:metric.value as number|null}
   }):[]
   units.push({kind:'SCALE',unitId:row.slotKey,state:metrics.length?'DESCRIPTIVE':'WITHHELD',metrics})
  }
 }
 const payload=payloadSchema.parse({schemaVersion:2,kind:'FIELD_CANONICAL_OBSERVATION',recordId:input.recordId,scope,attemptId:parent.id,attemptEpoch:parent.attemptEpoch,
  slotsHash:frozen.slotsHash,finalHash:frozen.finalHash,receipts:frozen.receipts,units})
 await tx.huiteacherFieldFormEvidence.create({data:{id:randomUUID(),organizationId:input.organizationId,eventId:input.eventId,recordId:input.recordId,
  formId:null,definitionDigest:null,attemptId:parent.id,attemptEpoch:parent.attemptEpoch,finalHash:frozen.finalHash,answersCipher:encryptUnifiedRuntimePayload(payload),answersHash:canonicalHash(payload)}})
 return {attemptId:parent.id,attemptEpoch:parent.attemptEpoch,finalHash:frozen.finalHash}
}
/** Audited historic evidence uses its own immutable accepted-generation scope,
 * never today's grant revision or a newly accepted invitation. */
export async function readCanonicalFieldEvidence(tx:Tx,row:{recordId:string;organizationId:string;eventId:string;attemptId:string|null;attemptEpoch:number|null;finalHash:string|null;answersCipher:string;answersHash:string}){
 const payload=payloadSchema.parse(decryptUnifiedRuntimePayload(row.answersCipher))
 if(canonicalHash(payload)!==row.answersHash||payload.recordId!==row.recordId||payload.scope.organizationId!==row.organizationId||payload.scope.eventId!==row.eventId
  ||payload.attemptId!==row.attemptId||payload.attemptEpoch!==row.attemptEpoch||payload.finalHash!==row.finalHash)fieldFail('HUITEACHER_FIELD_EVIDENCE_INTEGRITY',409)
 const actual=await finals(tx,payload.attemptId,payload.attemptEpoch)
 if(actual.finalHash!==payload.finalHash||actual.parent.participantKey!==fieldParticipantKey(payload.scope)||actual.parent.userId!==payload.scope.respondentUserId
  ||actual.parent.subjectUserId!==payload.scope.subjectUserId||actual.parent.respondentUserId!==payload.scope.respondentUserId||actual.parent.compositeAssessmentId!==payload.scope.assessmentRef.compositeId)
  fieldFail('HUITEACHER_FIELD_EVIDENCE_INTEGRITY',409)
 return {recordId:row.recordId,assessmentRef:payload.scope.assessmentRef,attemptId:payload.attemptId,attemptEpoch:payload.attemptEpoch,finalHash:payload.finalHash,units:payload.units}
}
