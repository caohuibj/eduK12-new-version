import { canonicalHash } from '../assessment-runtime/canonical'
import type { CanonicalUnitResultEnvelopeV1 } from '../assessment-runtime/unit-result'
import type { EducationAssessmentOrigin } from '../education-tools/assessment-resource.contract'
import type { StoredRelease } from '../measurement-content/repository'
import { renderDeclaredReport, DECLARATIVE_REPORT_GENERATOR, type ReportMetricFact } from '../measurement-content/report-renderer'
import type { TrainingFinalReceipt } from '../composite/training-content-final'
import type { TrainingContentSnapshot } from '../composite/training-content-binding'
import type { TrainingReferenceBinding } from '../composite/training-reference-binding'
import { reportingFail } from './types'

export type EducationAssessmentUnitReport = {
  itemId:string;family:'SCALE'|'COGNITIVE'|'SJT'
  status:'READY'|'REVOKED'|'NOT_SELECTED'|'UNAVAILABLE'|'WITHHELD'
  rendered:ReturnType<typeof renderDeclaredReport>|null;message?:string
}
function hidden():never{return reportingFail('REPORT_NOT_FOUND','reporting resource not found',404)}

/** Consume the shared interpreter's saved FINAL receipt and canonical facts.
 * No scoring, reference selection/recalculation, latest-version fallback, or
 * Training staff/private report projection is performed on a participant read. */
export function projectEducationAssessmentReports(input:{
  product:'SCHOOL'|'TEACHER';origin:EducationAssessmentOrigin
  binding:TrainingContentSnapshot;receipt:TrainingFinalReceipt
  references:TrainingReferenceBinding|null;releases:ReadonlyMap<string,StoredRelease>
  facts:ReadonlyMap<string,CanonicalUnitResultEnvelopeV1>;metricKeys:ReadonlySet<string>
}):EducationAssessmentUnitReport[]{
  const {origin}=input
  if(origin.product!==input.product||input.binding.compositeId!==origin.runtimeCompositeId
    ||input.binding.units.length!==origin.units.length)hidden()
  const read=(pointer:{releaseId:string;contentHash:string})=>{
    const release=input.releases.get(pointer.releaseId)
    if(!release||release.releaseId!==pointer.releaseId||release.contentHash!==pointer.contentHash)hidden()
    return release
  }
  return origin.units.map(unit=>{
    const base={itemId:unit.itemId,family:unit.family,rendered:null}
    const bound=input.binding.units.find(candidate=>candidate.itemId===unit.itemId)
    if(!bound||bound.family!==unit.family||canonicalHash(bound.measurement)!==canonicalHash(unit.measurement)
      ||canonicalHash(bound.report??null)!==canonicalHash(unit.report))hidden()
    const selected=input.references?.units.find(candidate=>candidate.itemId===unit.itemId)?.references??[]
    for(const slot of selected)if(slot.status==='SELECTED'&&!unit.references.some(ref=>ref.releaseId===slot.releaseId&&ref.contentHash===slot.contentHash))hidden()
    if(!unit.report)return {...base,status:'NOT_SELECTED'}
    const measurement=read(unit.measurement),report=read(unit.report)
    if(measurement.layer!=='MEASUREMENT'||measurement.family!==unit.family||measurement.content.measurementHash!==unit.measurement.measurementHash
      ||report.layer!=='REPORT'||report.family!==unit.family||report.content.measurements.length!==1
      ||canonicalHash(report.content.measurements[0])!==canonicalHash({releaseId:unit.measurement.releaseId,contentHash:unit.measurement.contentHash}))hidden()
    // A source identity is not permission to copy an adult/Training private report.
    if(report.content.audience!==(input.product==='SCHOOL'?'student':'teacher')
      ||report.scope.kind==='PRIVATE'&&report.scope.product!==input.product
      ||report.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR)return {...base,status:'WITHHELD'}
    if(measurement.status==='REVOKED'||report.status==='REVOKED')return {...base,status:'REVOKED'}
    const interpretation=input.receipt.interpretation.units.find(candidate=>candidate.instrumentKey===unit.itemId)
    const envelope=input.facts.get(unit.itemId)
    if(!interpretation||!envelope||input.receipt.sources.find(source=>source.itemId===unit.itemId)?.resultHash!==envelope.resultHash)hidden()
    if(interpretation.report.status!=='READY'||interpretation.report.generatorVersion!==DECLARATIVE_REPORT_GENERATOR)return {...base,status:'UNAVAILABLE'}
    const core=envelope.core
    if(core.unitType!==(unit.family==='SJT'?'SITUATIONAL':unit.family))hidden()
    if(report.content.metricKeys.some(key=>!input.metricKeys.has(key)))return {...base,status:'WITHHELD'}
    const allowed=new Set(report.content.metricKeys)
    const metrics:ReportMetricFact[]=core.metrics.filter(metric=>allowed.has(metric.key)).map(metric=>({
      metricKey:metric.key,value:typeof metric.value==='number'&&Number.isFinite(metric.value)?metric.value:null,
      unit:measurement.content.metrics.find(def=>def.metricKey===metric.key)?.unit??'unknown',
      status:core.quality.status==='interpretable'&&(metric.quality===undefined||['calculated','OK','interpretable'].includes(metric.quality))?'INTERPRETABLE':core.quality.status==='invalid'?'INVALID':'UNAVAILABLE',
    }))
    const references=interpretation.references.filter(reference=>allowed.has(reference.metricKey)).map(reference=>{
      const slot=selected.find(candidate=>candidate.metricKey===reference.metricKey&&candidate.referenceKind===reference.referenceKind)
      if(!slot)hidden()
      let available=reference.status==='AVAILABLE'&&slot.status==='SELECTED'
      if(slot.status==='SELECTED'){
        const release=read(slot)
        if(release.layer!=='REFERENCE'||release.family!==unit.family||release.content.measurement.releaseId!==measurement.releaseId
          ||release.content.measurement.contentHash!==measurement.contentHash)hidden()
        available=available&&release.status!=='REVOKED'
      }
      return {metricKey:reference.metricKey,referenceKind:reference.referenceKind,
        status:available?'AVAILABLE' as const:'UNAVAILABLE' as const,bandKey:available?reference.values?.bandKey??null:null}
    })
    const needsReference=report.content.template.blocks.some(block=>block.type==='REFERENCE_BAND'||block.type==='METRIC'&&block.display==='REFERENCE_RESULT')
    const missingReference=needsReference&&report.content.template.blocks.some(block=>(block.type==='REFERENCE_BAND'||block.type==='METRIC'&&block.display==='REFERENCE_RESULT')&&!references.some(reference=>reference.metricKey===block.metricKey&&reference.status==='AVAILABLE'&&(block.type!=='REFERENCE_BAND'||reference.referenceKind===block.referenceKind)))
    return {...base,status:'READY',...(missingReference?{message:'当前没有适用且获准的参考或阈值，未作等级与阈值解释。'}:{}),rendered:renderDeclaredReport(report.content.template,metrics,references)}
  })
}
