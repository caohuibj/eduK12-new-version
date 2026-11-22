import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey,type loadFrozenActiveSlotSet} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {trainingBoundContent,decodeTrainingReferenceBinding} from '../composite/training-reference-binding'
import {decodeTrainingFinalReceipt} from '../composite/training-content-final'
import {getContentReleaseBatch} from '../measurement-content/repository'
import {readSealedCompositionContent} from '../education-tools/private-tool.composition-content'
import type {FrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import {projectEducationDeclaredUnitReports,type EducationAssessmentUnitReport} from './education-assessment-report.projector'
import {reportingFail} from './types'

export type OrdinaryStoredContent=Pick<Parameters<typeof decodeTrainingFinalReceipt>[0],
 'trainingContentBinding'|'trainingContentBindingHash'|'trainingReferenceBinding'|'trainingReferenceBindingHash'|
 'trainingContentInterpretationEncrypted'|'trainingContentInterpretationHash'|'aggregateInputHash'>
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}
/** Author/data ACL and current per-block ceilings have already been resolved.
 * Load allowed declarative facts once, consume saved FINAL interpretation, and
 * reuse the same pure participant projector as other education deliveries. */
export async function readOrdinaryDeclaredFeedback(tx:Prisma.TransactionClient,input:{identity:FrozenCompositionIdentity;
 parent:OrdinaryStoredContent&{id:string;attemptEpoch:number;contextSnapshotHash:string|null};
 slots:Awaited<ReturnType<typeof loadFrozenActiveSlotSet>>;blockIds:ReadonlySet<string>}){
 const output=new Map<string,EducationAssessmentUnitReport>()
 if(!input.blockIds.size)return output
 const {identity}=input,parent={...input.parent,compositeAssessmentId:identity.compositeId}
 const binding=trainingBoundContent(parent),receipt=decodeTrainingFinalReceipt(parent),references=decodeTrainingReferenceBinding(parent)
 if(!binding||!receipt||!binding.educationComposition||binding.publicationHash!==identity.binding.manifestHash
  ||canonicalHash(binding.educationComposition.origin)!==canonicalHash(identity.origin))hidden()
 const sealed=await readSealedCompositionContent(tx,{compositeId:identity.compositeId,ownerId:identity.origin.ownerUserId,anchor:binding.educationComposition})
 const blocks=identity.manifest.filter(block=>input.blockIds.has(block.blockId))
 const bindingUnitsByItemId=new Map(binding.units.map(unit=>[unit.itemId,unit]))
 const expected=blocks.map(block=>{
  const unit=bindingUnitsByItemId.get(block.itemIds[0]),actual=unit&&sealed.units.get(unit.itemId)
  if(!unit?.source.educationStandard||!actual||canonicalHash(unit)!==canonicalHash(actual)||unit.source.educationStandard.releaseId!==block.versionId
   ||unit.source.educationStandard.combinationHash!==block.contentHash)hidden()
  return {block,unit,slotKey:compositeItemSlotKey(unit.itemId,'SCALE')}
 })
 const refUnitsByItemId=new Map((references?.units??[]).map(selected=>[selected.itemId,selected]))
 const releaseIds=[...new Set(expected.flatMap(({unit})=>[unit.measurement.releaseId,...(unit.report?[unit.report.releaseId]:[]),
  ...(refUnitsByItemId.get(unit.itemId)?.references.flatMap(ref=>ref.status==='SELECTED'?[ref.releaseId]:[])??[])]))]
 const slotKeys=expected.map(e=>e.slotKey)
 const [releases,rows]='$transaction' in tx
  ? await Promise.all([
   getContentReleaseBatch(tx,releaseIds),
   tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey:{in:slotKeys}}}),
  ])
  : [
   await getContentReleaseBatch(tx,releaseIds),
   await tx.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey:{in:slotKeys}}}),
  ]
 if(rows.length!==expected.length||new Set(rows.map(row=>row.slotKey)).size!==rows.length)hidden()
 const slotsByKey=new Map(input.slots.slots.map(slot=>[slot.slotKey,slot]))
 for(const row of rows){
  const slot=slotsByKey.get(row.slotKey)
  if(!slot||row.terminalState!=='COMPLETED'||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted||row.unitType!==slot.unitType
   ||row.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash)hidden()
 }
 const envelopes=await loadStoredCanonicalUnitResults(rows.map(row=>row.canonicalResultEncrypted!),tx)
 const expectedBySlotKey=new Map(expected.map(entry=>[entry.slotKey,entry]))
 const facts=new Map<string,typeof envelopes[number]>()
 for(const [index,row] of rows.entries()){
  const envelope=envelopes[index],unit=expectedBySlotKey.get(row.slotKey)!.unit
  if(!envelope||envelope.core.unitType!==row.unitType||envelope.core.sourceDefinitionHash!==row.sourceDefinitionHash
   ||envelope.core.compiledRuntimeHash!==row.compiledRuntimeHash||envelope.core.contextHash!==parent.contextSnapshotHash
   ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
   ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))hidden()
  facts.set(unit.itemId,envelope)
 }
 const ceilingsByBlockId=new Map(identity.binding.unitReports.map(ceiling=>[ceiling.blockId,ceiling]))
 for(const {block,unit} of expected){
  const ceiling=ceilingsByBlockId.get(block.blockId)!
  const reports=projectEducationDeclaredUnitReports({product:identity.origin.entry,binding,receipt,references,releases,facts,
   metricKeys:new Set(ceiling.respondent.metricKeys),disclosureByItem:new Map([[unit.itemId,unit.source.educationStandard!.respondentDisclosure]]),units:[{itemId:unit.itemId,family:unit.family,measurement:unit.measurement,report:unit.report??null,
    references:(unit.referencePolicy?.choices??[]).map(choice=>({releaseId:choice.releaseId,contentHash:choice.contentHash}))}]})
  output.set(unit.itemId,reports[0])
 }
 return output
}
