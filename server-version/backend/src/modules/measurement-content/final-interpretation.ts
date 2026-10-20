import {canonicalHash} from '../assessment-runtime/canonical'
import {resolveAssessmentReference,type AssessmentReferenceEntry,type ReferenceKind,type ReferenceContext} from '../assessment-reference/reference'
import type {StoredRelease} from './repository'
import {referenceEntryKey} from './reference-candidate'
import {DECLARATIVE_REPORT_GENERATOR} from './report-renderer'

export interface ReferenceInterpretation {
  metricKey:string;referenceKind:ReferenceKind
  status:'AVAILABLE'|'UNAVAILABLE'|'REVOKED'
  reason?:string
  values?:{z:number|null;t:number|null;percentile:{value:number;estimated:boolean}|null;meanDifference:number|null;bandKey:string|null}
}
export interface FinalInterpretation {
  schemaVersion:1;contentBindingHash:string
  units:Array<{instrumentKey:string;status:'INTERPRETED'|'UNAVAILABLE'|'REVOKED'|'NOT_SELECTED';reason?:string;
    references:ReferenceInterpretation[];report:{status:'READY'|'REVOKED'|'NOT_SELECTED'|'UNAVAILABLE';generatorVersion?:string}}>
}
export interface FinalInterpretationUnit {
  instrumentKey:string
  measurement:{releaseId:string;contentHash:string;measurementHash:string}
  references:Array<{metricKey:string;referenceKind:ReferenceKind}&(
    {status:'SELECTED';releaseId:string;contentHash:string;entryKey:string}|
    {status:'UNAVAILABLE';reason:'REVOKED'|'RETIRED'|'MISSING_CONTEXT'|'NO_MATCH'|'AMBIGUOUS'})>
  report?:{releaseId:string;contentHash:string}
}
export interface InterpretationFacts {
  notExecuted:boolean;quality:string|undefined
  metrics:Array<{key:string;value:number|null;status:string}>
}
export class FinalInterpretationIdentityError extends Error {
  constructor(){super('Frozen interpretation identity mismatch');this.name='FinalInterpretationIdentityError'}
}
function fail():never{throw new FinalInterpretationIdentityError()}
/** Internal numeric interpretation of already verified, stored facts. Each entry
 * wrapper must authorize and scope-check locked releases; this core never selects
 * versions, runs an assessment, or accepts an HTTP payload. */
export async function interpretContentBinding<Unit extends FinalInterpretationUnit>(input:{
  binding:{units:Unit[];populationContext:ReferenceContext};contentBindingHash:string
  readRelease:(id:string,hash:string)=>Promise<StoredRelease>
  readFacts:(unit:Unit,measurement:Extract<StoredRelease,{layer:'MEASUREMENT'}>)=>InterpretationFacts
}):Promise<FinalInterpretation>{
  const {binding}=input
  const units:FinalInterpretation['units']=[]
  for(const unit of binding.units){
    const measurement=await input.readRelease(unit.measurement.releaseId,unit.measurement.contentHash)
    if(measurement.layer!=='MEASUREMENT'||measurement.content.measurementHash!==unit.measurement.measurementHash)return fail()
    const facts=input.readFacts(unit,measurement)
    const reason=measurement.status==='REVOKED'?'MEASUREMENT_REVOKED':facts.notExecuted?'NOT_EXECUTED':
      facts.quality!=='interpretable'?'QUALITY_UNAVAILABLE':undefined
    const references:ReferenceInterpretation[]=[]
    for(const slot of unit.references){
      if(reason){references.push({metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:reason==='MEASUREMENT_REVOKED'?'REVOKED':'UNAVAILABLE',reason});continue}
      if(slot.status==='UNAVAILABLE'){references.push({metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:slot.reason==='REVOKED'?'REVOKED':'UNAVAILABLE',reason:slot.reason});continue}
      const release=await input.readRelease(slot.releaseId,slot.contentHash)
      if(release.layer!=='REFERENCE')return fail()
      if(release.family!==measurement.family||release.content.measurement.releaseId!==measurement.releaseId
        ||release.content.measurement.contentHash!==measurement.contentHash)fail()
      const matching=release.content.entries.filter(e=>referenceEntryKey(e.definition as unknown as AssessmentReferenceEntry)===slot.entryKey)
      if(matching.length!==1||matching[0].metricKey!==slot.metricKey||matching[0].referenceKind!==slot.referenceKind)fail()
      if(release.status==='REVOKED'){references.push({metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:'REVOKED',reason:'REFERENCE_REVOKED'});continue}
      const metric=facts!.metrics.find(m=>m.key===slot.metricKey)
      const entry=matching[0].definition as unknown as AssessmentReferenceEntry
      const resolved=resolveAssessmentReference({instrumentType:measurement.family==='SCALE'?'scale':measurement.family==='SJT'?'sjt':'cognitive',
        instrumentKey:unit.instrumentKey,instrumentVersion:measurement.content.instrumentVersion,scoringVersion:measurement.content.scoringVersion,
        measurementHash:measurement.content.measurementHash,context:binding.populationContext,
        selections:[{scoreKey:slot.metricKey,referenceKind:slot.referenceKind,referenceVersion:release.version}],
        references:[{schemaVersion:1,instrumentType:measurement.family==='SCALE'?'scale':measurement.family==='SJT'?'sjt':'cognitive',
          instrumentKey:unit.instrumentKey,referenceVersion:release.version,status:'ACTIVE',entries:[entry]}],
        score:{key:slot.metricKey,value:metric?.status==='OK'&&typeof metric.value==='number'&&Number.isFinite(metric.value)?metric.value:null,status:metric?.status==='OK'?'calculated':'not_calculable'}})[0]
      const values={z:resolved.z,t:resolved.t,percentile:resolved.percentile,meanDifference:resolved.meanDifference,bandKey:resolved.criterionBand?.key??null}
      const finite=[values.z,values.t,values.meanDifference,values.percentile?.value??null].every(n=>n===null||Number.isFinite(n))
      references.push(resolved.status==='available'&&finite?{metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:'AVAILABLE',values}:
        {metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:'UNAVAILABLE',reason:finite?resolved.unavailableReason??'UNAVAILABLE':'NOT_COMPUTABLE'})
    }
    let report:FinalInterpretation['units'][number]['report']={status:'NOT_SELECTED'}
    if(unit.report){
      const release=await input.readRelease(unit.report.releaseId,unit.report.contentHash)
      if(release.layer!=='REPORT')return fail()
      if(release.family!==measurement.family||release.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR
        ||release.content.measurements.length!==1||canonicalHash(release.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash}))fail()
      report={status:release.status==='REVOKED'||reason==='MEASUREMENT_REVOKED'?'REVOKED':facts.notExecuted?'UNAVAILABLE':'READY',generatorVersion:release.content.generatorVersion}
    }
    units.push({instrumentKey:unit.instrumentKey,status:reason==='MEASUREMENT_REVOKED'?'REVOKED':reason?'UNAVAILABLE':references.some(r=>r.status==='AVAILABLE')||report.status==='READY'?'INTERPRETED':references.some(r=>r.status==='REVOKED')||report.status==='REVOKED'?'REVOKED':unit.references.length||unit.report?'UNAVAILABLE':'NOT_SELECTED',
      ...(reason?{reason}:{}),references,report})
  }
  return {schemaVersion:1,contentBindingHash:input.contentBindingHash,units}
}
