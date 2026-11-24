import type {Prisma,CompositeAssessmentAttempt} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {loadFrozenScaleRuntimeSnapshot,type VersionedFrozenScaleRuntimeSnapshot} from '../assessment-runtime/runtime-snapshot'
import {loadStoredVersionedUnitAdmission} from '../assessment-runtime/unit-admission'
import {loadFrozenActiveSlotSet,compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {withSharedControlContext} from '../assessment-runtime/shared-control-records'
import {resolveStoredScaleResult,loadStoredCanonicalUnitResults,createStoredScaleFactsReader} from '../assessment-runtime/compact-assessment-storage'
import {readCompositeFinalUnitSnapshots} from '../assessment-runtime/composite-final.bridge'
import {loadCompositePublicationPlan,type CompositePublicationScaleSlot} from '../assessment-runtime/composite-publication-plan'
import {publicTemplatesForDatabase} from '../assessment-runtime/public-templates'
import type {CanonicalUnitResultEnvelopeV1} from '../assessment-runtime/unit-result'
import {scaleProjectionPolicyFromCompiled} from '../scale/projection/policy-resolver'
import {DISCLOSURE_PRESETS} from '../scale/policy/disclosure'
import {privateToolImageReferences} from '../education-tools/private-tool.media-definition'
import type {ResultDisclosureContractV1} from '../assessment-policy/result-disclosure'
import {buildScaleUnitReport,type ScaleUnitReport} from './scale-unit-report'
import {educationLibraryV1ProjectionPolicy,narrowAndProjectEducationScaleReport,projectEducationScaleIndividualReport} from './education-scale-report.projector'
import {reportingFail} from './types'

export type NativeEducationFeedbackSource={itemId:string;scaleId:string;title:string;sourceDefinitionHash:string;resultDisclosure:ResultDisclosureContractV1}&(
 {privateVersion:{versionId:string;contentHash:string}}|{approvedLibrary:{approvedSnapshotHash:string}})
export type PreloadedNativeEducationScaleData={
 children?:readonly any[]
 committedUnits?:readonly {canonical:CanonicalUnitResultEnvelopeV1;snapshot:any}[]
 runtimes?:ReadonlyMap<string,{attemptEpoch:number;runtimeSnapshotEncrypted:string;runtime:VersionedFrozenScaleRuntimeSnapshot}>
}
type Parent=Pick<CompositeAssessmentAttempt,'id'|'status'|'userId'|'subjectUserId'|'respondentUserId'|'attemptEpoch'|'contextSnapshotHash'|'frozenActiveSlotSetEncrypted'|'frozenActiveSlotSetHash'>&{publicationHash?:string|null}
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
/** Already authorized respondent + immutable sources only. Batch canonical
 * facts once and share the reader across native projections. NONE units never
 * load/decrypt child results. This helper does no scoring or source rebuilding. */
export async function readNativeEducationScaleFeedback(tx:Prisma.TransactionClient,input:{actorUserId:string;parent:Parent;
 sources:NativeEducationFeedbackSource[];slotSet?:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;preloaded?:PreloadedNativeEducationScaleData}){
 return withSharedControlContext(async()=>{
  const {parent,preloaded}=input,allowed=input.sources.filter(source=>source.resultDisclosure.audiences.RESPONDENT.mode==='INDIVIDUAL_SUMMARY')
  const output=new Map<string,ReturnType<typeof projectEducationScaleIndividualReport>>()
  if(!allowed.length)return output
  const isWholeV2 = Boolean((parent as { publicationHash?: string | null }).publicationHash)
  if(parent.status!=='COMPLETED'||parent.userId!==input.actorUserId||parent.respondentUserId!==input.actorUserId
   ||parent.subjectUserId!==input.actorUserId||(!isWholeV2&&(!parent.frozenActiveSlotSetEncrypted||!parent.frozenActiveSlotSetHash)))hidden()
  const allowedItemIds=new Set(allowed.map(source=>source.itemId))
  const allowedSlotKeys=new Set(allowed.map(source=>compositeItemSlotKey(source.itemId,'SCALE')))
  // Phase 2 single-row FINAL fast path: read Scale results directly from composite_attempt_finals.facts_cipher
  const v2ScaleRead = isWholeV2
    ? await readCompositeFinalUnitSnapshots(
        tx,
        [{ attemptId: parent.id, attemptEpoch: parent.attemptEpoch }],
        { slotKeys: [...allowedSlotKeys], unitTypes: ['SCALE'] },
      )
    : { loadedFactsByKey: new Map(), byAttemptKey: new Map(), snapshots: [] }
  if (v2ScaleRead.loadedFactsByKey.has(`${parent.id}:${parent.attemptEpoch}`)) {
    const plan = await loadCompositePublicationPlan(parent.publicationHash!, publicTemplatesForDatabase(tx))
    const slotByKey = new Map(
      plan.slots
        .filter((s): s is CompositePublicationScaleSlot => s.unitType === 'SCALE')
        .map(s => [s.slotKey, s]),
    )
    const bySlot = new Map(v2ScaleRead.snapshots.map(snap => [snap.slotKey, snap]))
    const full = DISCLOSURE_PRESETS.FULL_REPORT()
    for (const source of allowed) {
      const slotKey = compositeItemSlotKey(source.itemId, 'SCALE')
      const snap = bySlot.get(slotKey)
      const slot = slotByKey.get(slotKey)
      if (!snap || !snap.scaleResult || !snap.canonicalEnvelope || !slot) hidden()
      const core = snap.canonicalEnvelope.core
      if (
        slot.scaleId !== source.scaleId
        || slot.definitionHash !== source.sourceDefinitionHash
        || core.unitType !== 'SCALE'
        || core.sourceDefinitionHash !== source.sourceDefinitionHash
        || core.compiledRuntimeHash !== slot.compiledRuntime.compiledRuntimeHash
        || core.contextHash !== (parent.contextSnapshotHash ?? null)
      ) hidden()
      const contentAudience = slot.definition.report.audienceContract?.audience
      if (
        !(contentAudience === 'student' || contentAudience === 'teacher')
        || snap.scaleResult.method.reportAudience !== contentAudience
        || snap.scaleResult.method.reportVersion !== slot.definition.report.reportVersion
      ) hidden()
      const report = buildScaleUnitReport({
        assessmentId: snap.sourceAttemptId,
        itemId: source.itemId,
        scaleId: source.scaleId,
        scaleCode: snap.scaleResult.instrument.code,
        scaleName: snap.scaleResult.instrument.name || source.title,
        result: snap.scaleResult,
        completedAt: snap.completedAt,
        totalTime: null,
      })
      if (
        !report.result
        || report.decryptError
        || core.metrics.length !== report.result.scores.length
        || report.result.scores.some(score => !core.metrics.some(metric => metric.key === score.key && metric.value === score.value && metric.quality === score.status))
        || core.quality.status !== report.result.quality.status
      ) hidden()
      const projected = narrowAndProjectEducationScaleReport({
        report,
        resultDisclosure: source.resultDisclosure,
        resultAudience: 'RESPONDENT',
        contentAudience,
        context: {
          principalId: input.actorUserId,
          audience: 'respondent',
          purpose: 'report',
          accessDecision: { source: 'RESOURCE_AUTHORIZATION', allowed: true, capabilities: full },
          frozenPolicy: slot.compiledPolicy
            ? scaleProjectionPolicyFromCompiled(slot.compiledPolicy)
            : educationLibraryV1ProjectionPolicy(),
          currentRestrictions: full,
          relationalDisposition: 'INDIVIDUAL_ALLOWED',
        },
      })
      if (projected.state === 'PROJECTED' && 'privateVersion' in source) {
        const refs = privateToolImageReferences('SCALE', slot.definition).reports
        for (const unit of projected.unitReports) {
          if ('rawScoreFeedback' in unit && unit.rawScoreFeedback?.some((feedback: NonNullable<ScaleUnitReport['rawScoreFeedback']>[number]) =>
            feedback.images?.some(image => !refs.some(ref => ref.assetId === image.asset.assetId && ref.contentHash === image.asset.contentHash && ref.mimeType === image.asset.mimeType)))) {
            hidden()
          }
        }
      }
      output.set(source.itemId, projected)
    }
    return output
  }
  const preloadedChildren=preloaded?.children?.filter(row=>row.compositeAttemptId===parent.id&&row.attemptEpoch===parent.attemptEpoch&&allowedItemIds.has(row.compositeItemId))
  const children=preloadedChildren&&preloadedChildren.length===allowed.length
   ? preloadedChildren
   : await tx.assessment.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,compositeItemId:{in:[...allowedItemIds]}}})
  const preloadedUnits=preloaded?.committedUnits?.filter(unit=>unit.snapshot?.compositeAttemptId===parent.id&&unit.snapshot?.attemptEpoch===parent.attemptEpoch
   &&unit.snapshot?.unitType==='SCALE'&&unit.snapshot?.terminalState==='COMPLETED'&&unit.snapshot?.payloadKind==='UNIT_RESULT'
   &&allowedSlotKeys.has(unit.snapshot?.slotKey))
  const usePreloadedUnits=Boolean(preloadedUnits&&preloadedUnits.length===allowed.length)
  const finals=usePreloadedUnits
   ? preloadedUnits!.map(unit=>unit.snapshot)
   : await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,
      slotKey:{in:[...allowedSlotKeys]},unitType:'SCALE',terminalState:'COMPLETED',payloadKind:'UNIT_RESULT'}})
  if(children.length!==allowed.length||finals.length!==allowed.length||finals.some(row=>!row.canonicalResultEncrypted))hidden()
  const slotSet=input.slotSet??await loadFrozenActiveSlotSet(parent.frozenActiveSlotSetEncrypted!,tx)
  const reader=await createStoredScaleFactsReader(children as any[],tx)
  const envelopes=usePreloadedUnits
   ? preloadedUnits!.map(unit=>unit.canonical)
   : await loadStoredCanonicalUnitResults(finals.map(row=>row.canonicalResultEncrypted!),tx,[],reader)
  const childByItemId=new Map((children as any[]).map(row=>[row.compositeItemId as string,row]))
  const finalBySlotKey=new Map(finals.map((row,i)=>[row.slotKey as string,{finalUnit:row,canonical:envelopes[i]}]))
  const projectedEntries=await Promise.all(allowed.map(async source=>{
   const child=childByItemId.get(source.itemId)
   const finalEntry=finalBySlotKey.get(compositeItemSlotKey(source.itemId,'SCALE'))
   if(!child||!finalEntry||child.scaleId!==source.scaleId||child.status!=='COMPLETED'||child.userId!==input.actorUserId
    ||child.respondentUserId!==input.actorUserId||child.subjectUserId!==input.actorUserId||!child.submissionId||!child.runtimeSnapshotEncrypted
    ||!child.compiledRuntimeHash||!child.frozenAdmissionSnapshotHash||!child.compositeAttemptId||!child.compositeItemId)hidden()
   const {finalUnit,canonical}=finalEntry
   if(!finalUnit.compositeAttemptId||!finalUnit.sourceSubmissionId||!finalUnit.sourceDefinitionHash||!finalUnit.compiledRuntimeHash)hidden()
   const preloadedRuntime=preloaded?.runtimes?.get(child.id)
   const [runtime,admission,stored]=await Promise.all([
    preloadedRuntime&&preloadedRuntime.attemptEpoch===child.attemptEpoch&&preloadedRuntime.runtimeSnapshotEncrypted===child.runtimeSnapshotEncrypted
     ? Promise.resolve(preloadedRuntime.runtime)
     : loadFrozenScaleRuntimeSnapshot(child.runtimeSnapshotEncrypted!,tx),
    loadStoredVersionedUnitAdmission(child,'Report admission unavailable',tx),
    resolveStoredScaleResult(child.result,{record:child,db:tx,reader}),
   ])
   if(runtime.sourceDefinitionHash!==source.sourceDefinitionHash)hidden()
   if(canonical.core.unitType!=='SCALE'||canonical.core.sourceDefinitionHash!==runtime.sourceDefinitionHash
    ||canonical.core.compiledRuntimeHash!==runtime.compiledRuntime.compiledRuntimeHash||canonical.core.contextHash!==(parent.contextSnapshotHash??null)
    ||canonical.persistenceProvenance.sourceType!=='ASSESSMENT'||canonical.persistenceProvenance.sourceAttemptId!==child.id
    ||canonical.persistenceProvenance.sourceSubmissionId!==child.submissionId)hidden()
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
   return [source.itemId,projected] as const
  }))
  for(const [itemId,projected] of projectedEntries)output.set(itemId,projected)
  return output
 })
}
