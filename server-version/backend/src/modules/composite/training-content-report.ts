import {decodeTrainingReferenceBinding} from './training-reference-binding'
import {validateTrainingReferenceRelease} from './training-reference-selection'
import {loadTrainingMetricDisclosure,trainingReportDisclosureAllowed} from './training-metric-disclosure'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {compositeItemSlotKey} from '../assessment-runtime/slot-set'
import {loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError} from '../measurement-content/release'
import {renderDeclaredReport,DECLARATIVE_REPORT_GENERATOR,type ReportMetricFact} from '../measurement-content/report-renderer'
import {decodeTrainingFinalReceipt} from './training-content-final'
import {trainingContentSnapshotSchema,trainingMeasurementSourceScopeMatchesForConsumer} from './training-content-binding'
import {validateTrainingReportPointer} from './training-report-selection'

type Parent=Parameters<typeof decodeTrainingFinalReceipt>[0]&{compositeAssessment:{id:string;createdBy:string}}
export interface TrainingContentReport {
 itemId:string;status:'READY'|'REVOKED'|'NOT_SELECTED'|'UNAVAILABLE';reportRelease:{releaseId:string;contentHash:string}|null
 lifecycleNotices:Array<{layer:string;releaseId:string;status:string}>
 rendered:ReturnType<typeof renderDeclaredReport>|null
}
class TrainingContentReportError extends ContentReleaseError {readonly statusCode=409}
function fail():never{throw new TrainingContentReportError('CONTENT_TRAINING_REPORT_IDENTITY_MISMATCH')}
/** Internal read, after current teacher/researcher ownership and data-scope checks.
 * Participants never receive templates through this helper. Uses saved facts and
 * FINAL interpretation only; no selector, scorer or new interpretation runs. */
export async function readTrainingContentReports(db:Prisma.TransactionClient,input:{parent:Parent;audience:'teacher'|'researcher'|'participant'}):Promise<TrainingContentReport[]>{
 if(input.audience==='participant')return []
 if(input.audience!=='teacher'&&input.audience!=='researcher')fail()
 const {parent}=input,receipt=decodeTrainingFinalReceipt(parent)
 if(!receipt)return []
 if(parent.compositeAssessment.id!==parent.compositeAssessmentId)fail()
 const binding=parent.trainingContentBinding as {units:unknown}
 const units=trainingContentSnapshotSchema.shape.units.parse(binding.units)
 const referenceBinding=decodeTrainingReferenceBinding(parent)
 const byItem=new Map(units.map(u=>[u.itemId,u]))
 const ready=receipt.interpretation.units.filter(u=>u.report.status==='READY')
 const expected=ready.map(u=>{
  const bound=byItem.get(u.instrumentKey),source=receipt.sources.find(s=>s.itemId===u.instrumentKey)
  if(!bound?.report||!source)fail()
  return {bound,source,interpreted:u,slotKey:compositeItemSlotKey(bound.itemId,bound.family==='SJT'?'SITUATIONAL':bound.family)}
 })
 const rows=expected.length?await db.assessmentUnitSnapshot.findMany({where:{compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch,slotKey:{in:expected.map(e=>e.slotKey)}},
  select:{compositeAttemptId:true,attemptEpoch:true,slotKey:true,unitType:true,terminalState:true,payloadKind:true,canonicalResultEncrypted:true,sourceType:true,sourceAttemptId:true,sourceSubmissionId:true}}):[]
 if(rows.length!==expected.length||new Set(rows.map(r=>r.slotKey)).size!==rows.length)fail()
 for(const row of rows)if(row.compositeAttemptId!==parent.id||row.attemptEpoch!==parent.attemptEpoch||row.terminalState!=='COMPLETED'
  ||row.payloadKind!=='UNIT_RESULT'||!row.canonicalResultEncrypted||!expected.some(e=>e.slotKey===row.slotKey))fail()
 const envelopes=rows.length?await loadStoredCanonicalUnitResults(rows.map(r=>r.canonicalResultEncrypted!),db):[]
 if(envelopes.length!==rows.length)fail()
 const facts=new Map(rows.map((row,i)=>[row.slotKey,{row,envelope:envelopes[i]}]))
 const cache=new Map<string,StoredRelease>()
 const read=async(pointer:{releaseId:string;contentHash:string})=>{
  let release=cache.get(pointer.releaseId)
  if(!release){release=(await getContentRelease(db,pointer.releaseId,true))??undefined;if(release)cache.set(pointer.releaseId,release)}
  if(!release||release.contentHash!==pointer.contentHash)fail()
  return release
 }
 const renderedByItem=new Map<string,TrainingContentReport>()
 for(const {bound,source,interpreted,slotKey} of expected){
  const stored=facts.get(slotKey);if(!stored)fail()
  const {row,envelope}=stored,core=envelope.core,type=bound.family==='SJT'?'SITUATIONAL':bound.family
  if(envelope.resultHash!==source.resultHash||core.unitType!==type||row.unitType!==type
   ||envelope.persistenceProvenance.sourceType!==row.sourceType||envelope.persistenceProvenance.sourceAttemptId!==row.sourceAttemptId
   ||(envelope.persistenceProvenance.sourceSubmissionId??null)!==(row.sourceSubmissionId??null))fail()
  const measurement=await read(bound.measurement),report=await read(bound.report!)
  if(measurement.layer!=='MEASUREMENT'||report.layer!=='REPORT')fail()
  if(!await trainingMeasurementSourceScopeMatchesForConsumer(db,measurement,bound.source,
    {compositeId:parent.compositeAssessmentId,ownerId:parent.compositeAssessment.createdBy,itemId:bound.itemId}))fail()
  if(bound.source.standardCombination||report.scope.kind==='PLATFORM'||report.scope.kind==='PRIVATE'&&['SCHOOL','TEACHER'].includes(report.scope.product))await validateTrainingReportPointer(db,{unit:bound,compositeId:parent.compositeAssessmentId,ownerId:parent.compositeAssessment.createdBy,
    reportReleaseId:report.releaseId,contentHash:report.contentHash,publication:false,releases:cache})
  else if(report.scope.kind!=='PRIVATE'||report.scope.product!=='TRAINING'||report.scope.ownerId!==parent.compositeAssessment.createdBy||report.scope.resourceId!==parent.compositeAssessmentId)fail()
  if(measurement.family!==bound.family||measurement.content.measurementHash!==bound.measurement.measurementHash||report.family!==bound.family
   ||report.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR||interpreted.report.generatorVersion!==report.content.generatorVersion
   ||report.content.measurements.length!==1||canonicalHash(report.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash}))fail()
  const referenceReleases:StoredRelease[]=[]
  for(const slot of referenceBinding?.units.find(u=>u.itemId===bound.itemId)?.references??[]){
   if(slot.status!=='SELECTED')continue
   const release=await read(slot)
   await validateTrainingReferenceRelease(db,{unit:bound,ownerId:parent.compositeAssessment.createdBy,compositeId:parent.compositeAssessmentId,
    releaseId:slot.releaseId,contentHash:slot.contentHash,purpose:'HISTORY',releases:cache})
   referenceReleases.push(release)
  }
  const lifecycleNotices=[measurement,report,...referenceReleases].filter(r=>r.status!=='PUBLISHED').map(r=>({layer:r.layer,releaseId:r.releaseId,status:r.status}))
  if(report.status==='REVOKED'||measurement.status==='REVOKED'){
   renderedByItem.set(bound.itemId,{itemId:bound.itemId,status:'REVOKED',reportRelease:bound.report!,lifecycleNotices,rendered:null});continue
  }
  // Declared templates cannot promote numeric or individual-reference access.
  // Re-read the accepted child's frozen disclosure on each staff read; the
  // researcher label alone is not a scientific data authorization.
  const disclosure=await loadTrainingMetricDisclosure(db,{parent,unit:bound,source:row,audience:input.audience,core})
  if(!trainingReportDisclosureAllowed(disclosure,report.content)){
   renderedByItem.set(bound.itemId,{itemId:bound.itemId,status:'UNAVAILABLE',reportRelease:bound.report!,lifecycleNotices,rendered:null});continue
  }
  const allowed=new Set(report.content.metricKeys)
  const metrics:ReportMetricFact[]=core.metrics.filter(m=>allowed.has(m.key)&&disclosure.metricKeys.has(m.key)).map(m=>({metricKey:m.key,
   value:typeof m.value==='number'&&Number.isFinite(m.value)?m.value:null,unit:measurement.content.metrics.find(v=>v.metricKey===m.key)?.unit??m.unit??'unknown',
   status:core.quality.status==='interpretable'&&(m.quality===undefined||['calculated','OK','interpretable'].includes(m.quality))?'INTERPRETABLE':core.quality.status==='invalid'?'INVALID':'UNAVAILABLE'}))
  renderedByItem.set(bound.itemId,{itemId:bound.itemId,status:'READY',reportRelease:bound.report!,lifecycleNotices,
   rendered:renderDeclaredReport(report.content.template,metrics,interpreted.references.filter(reference=>disclosure.referenceMetricKeys.has(reference.metricKey)).map(reference=>{
    const selected=referenceBinding?.units.find(u=>u.itemId===bound.itemId)?.references.find(r=>r.metricKey===reference.metricKey&&r.referenceKind===reference.referenceKind)
    const revoked=selected?.status==='SELECTED'&&referenceReleases.some(r=>r.releaseId===selected.releaseId&&r.status==='REVOKED')
    return {metricKey:reference.metricKey,referenceKind:reference.referenceKind,status:reference.status==='AVAILABLE'&&!revoked?'AVAILABLE':'UNAVAILABLE',bandKey:reference.values?.bandKey??null}
   }))})
 }
 return receipt.interpretation.units.map(u=>renderedByItem.get(u.instrumentKey)??{itemId:u.instrumentKey,status:u.report.status,
  reportRelease:byItem.get(u.instrumentKey)?.report??null,lifecycleNotices:[],rendered:null})
}
