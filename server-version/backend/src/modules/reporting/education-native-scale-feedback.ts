import type {Prisma,CompositeAssessmentAttempt} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {loadFrozenScaleRuntimeSnapshot} from '../assessment-runtime/runtime-snapshot'
import {loadStoredVersionedUnitAdmission} from '../assessment-runtime/unit-admission'
import {loadFrozenActiveSlotSet,compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {resolveStoredScaleResult,loadStoredCanonicalUnitResults,createStoredScaleFactsReader} from '../assessment-runtime/compact-assessment-storage'
import {scaleProjectionPolicyFromCompiled} from '../scale/projection/policy-resolver'
import {DISCLOSURE_PRESETS} from '../scale/policy/disclosure'
import {privateToolImageReferences} from '../education-tools/private-tool.media-definition'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {buildScaleUnitReport,type ScaleUnitReport} from './scale-unit-report'
import {educationLibraryV1ProjectionPolicy,projectEducationScaleIndividualReport} from './education-scale-report.projector'
import {reportingFail} from './types'

export type NativeEducationFeedbackSource={itemId:string;scaleId:string;title:string;sourceDefinitionHash:string;resultDisclosure:ResultDisclosureContractV1}&(
 {privateVersion:{versionId:string;contentHash:string}}|{approvedLibrary:{approvedSnapshotHash:string}})
type Parent=Pick<CompositeAssessmentAttempt,'id'|'status'|'userId'|'subjectUserId'|'respondentUserId'|'attemptEpoch'|'contextSnapshotHash'|'frozenActiveSlotSetEncrypted'|'frozenActiveSlotSetHash'>
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
/** Already authorized respondent + immutable sources only. Batch canonical
 * facts once and share the reader across native projections. NONE units never
 * load/decrypt child results. This helper does no scoring or source rebuilding. */
export async function readNativeEducationScaleFeedback(tx:Prisma.TransactionClient,input:{actorUserId:string;parent:Parent;
 sources:NativeEducationFeedbackSource[];slotSet?:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>}){
 const {parent}=input,allowed=input.sources.filter(source=>source.resultDisclosure.audiences.RESPONDENT.mode==='INDIVIDUAL_SUMMARY')
 const output=new Map<string,ReturnType<typeof projectEducationScaleIndividualReport>>()
 if(!allowed.length)return output
 if(parent.status!=='COMPLETED'||parent.userId!==input.actorUserId||parent.respondentUserId!==input.actorUserId
  ||parent.subjectUserId!==input.actorUserId||!parent.frozenActiveSlotSetEncrypted||!parent.frozenActiveSlotSetHash)hidden()
 const children=await tx.assessment.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,compositeItemId:{in:allowed.map(source=>source.itemId)}}})
 const finals=await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,
  slotKey:{in:allowed.map(source=>compositeItemSlotKey(source.itemId,'SCALE'))},unitType:'SCALE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT'}})
 if(children.length!==allowed.length||finals.length!==allowed.length||finals.some(row=>!row.canonicalResultEncrypted))hidden()
 const slotSet=input.slotSet??await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted!,tx)
 const reader=await createStoredScaleFactsReader(children,tx)
 const envelopes=await loadStoredCanonicalUnitResults(finals.map(row=>row.canonicalResultEncrypted!),tx,[],reader)
 for(const source of allowed){
  const child=children.find(row=>row.compositeItemId===source.itemId),index=finals.findIndex(row=>row.slotKey===compositeItemSlotKey(source.itemId,'SCALE'))
  if(!child||index<0||child.scaleId!==source.scaleId||child.status!=='COMPLETED'||child.userId!==input.actorUserId
   ||child.respondentUserId!==input.actorUserId||child.subjectUserId!==input.actorUserId||!child.submissionId||!child.runtimeSnapshotEncrypted
   ||!child.compiledRuntimeHash||!child.frozenAdmissionSnapshotHash||!child.compositeAttemptId||!child.compositeItemId)hidden()
  const finalUnit=finals[index],canonical=envelopes[index]
  if(!finalUnit.compositeAttemptId||!finalUnit.sourceSubmissionId||!finalUnit.sourceDefinitionHash||!finalUnit.compiledRuntimeHash)hidden()
  const runtime=await loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!,tx)
  if(runtime.sourceDefinitionHash!==source.sourceDefinitionHash)hidden()
  const admission=await loadStoredVersionedUnitAdmission(child,'Report admission unavailable',tx)
  if(canonical.core.unitType!=='SCALE'||canonical.core.sourceDefinitionHash!==runtime.sourceDefinitionHash
   ||canonical.core.compiledRuntimeHash!==runtime.compiledRuntime.compiledRuntimeHash||canonical.core.contextHash!==(parent.contextSnapshotHash??null)
   ||canonical.persistenceProvenance.sourceType!=='ASSESSMENT'||canonical.persistenceProvenance.sourceAttemptId!==child.id
   ||canonical.persistenceProvenance.sourceSubmissionId!==child.submissionId)hidden()
  const stored=await resolveStoredScaleResult(child.result,{record:child,db:tx,reader})
  const report=buildScaleUnitReport({assessmentId:child.id,itemId:child.compositeItemId,scaleId:child.scaleId,scaleCode:runtime.instrumentKey,
   scaleName:admission?.scale?.name??source.title,result:stored,completedAt:child.completedAt,totalTime:child.totalTime})
  if(!report.result||report.decryptError||canonical.core.metrics.length!==report.result.scores.length
   ||report.result.scores.some(score=>!canonical.core.metrics.some(metric=>metric.key===score.key&&metric.value===score.value&&metric.quality===score.status))
   ||canonical.core.quality.status!==report.result.quality.status
   ||canonical.bundleBridge&&canonicalHash(canonical.bundleBridge.rawScoreFeedback??[])!==canonicalHash(report.result.rawScoreFeedback??[]))hidden()
  const contract=source.resultDisclosure,disclosureHash=canonicalHash(contract),full=DISCLOSURE_PRESETS.FULL_REPORT()
  const projected=projectEducationScaleIndividualReport({report,frozenSnapshot:runtime,resultDisclosure:contract,resultAudience:'RESPONDENT',
   persistedFacts:{actorUserId:input.actorUserId,resultDisclosureHash:disclosureHash,admission,slotSet,
    ...('privateVersion' in source?{privateVersionSource:{...source.privateVersion,sourceDefinitionHash:source.sourceDefinitionHash,resultDisclosureHash:disclosureHash}}
     :{approvedLibrarySource:{...source.approvedLibrary,sourceDefinitionHash:source.sourceDefinitionHash,resultDisclosureHash:disclosureHash}}),
    parent:{id:parent.id,attemptEpoch:parent.attemptEpoch,frozenActiveSlotSetHash:parent.frozenActiveSlotSetHash!},
    assessment:{id:child.id,scaleId:child.scaleId,userId:child.userId,compositeAttemptId:child.compositeAttemptId!,compositeItemId:child.compositeItemId!,
     attemptEpoch:child.attemptEpoch,status:child.status,submissionId:child.submissionId,compiledRuntimeHash:child.compiledRuntimeHash!,frozenAdmissionSnapshotHash:child.frozenAdmissionSnapshotHash!},
    finalUnit:{...finalUnit,compositeAttemptId:finalUnit.compositeAttemptId!,sourceSubmissionId:finalUnit.sourceSubmissionId!,
     sourceDefinitionHash:finalUnit.sourceDefinitionHash!,compiledRuntimeHash:finalUnit.compiledRuntimeHash!}},
   context:{principalId:input.actorUserId,audience:'respondent',purpose:'report',accessDecision:{source:'RESOURCE_AUTHORIZATION',allowed:true,capabilities:full},
    frozenPolicy:runtime.schemaVersion===2?scaleProjectionPolicyFromCompiled(runtime.compiledPolicy):educationLibraryV1ProjectionPolicy(),
    currentRestrictions:full,relationalDisposition:'INDIVIDUAL_ALLOWED'}})
  if(projected.state==='PROJECTED'&&'privateVersion' in source){
   const refs=privateToolImageReferences('SCALE',runtime.definition).reports
   for(const unit of projected.unitReports)if('rawScoreFeedback' in unit&&unit.rawScoreFeedback?.some((feedback:NonNullable<ScaleUnitReport['rawScoreFeedback']>[number])=>
    feedback.images?.some(image=>!refs.some(ref=>ref.assetId===image.asset.assetId&&ref.contentHash===image.asset.contentHash&&ref.mimeType===image.asset.mimeType))))hidden()
  }
  output.set(source.itemId,projected)
 }
 return output
}
