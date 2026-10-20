import {projectStoredMeasurement} from '../assessment-runtime/measurement-result'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {resolveAssessmentReference,type AssessmentReferenceEntry,type ReferenceKind} from '../assessment-reference/reference'
import {getContentRelease,type StoredRelease} from '../measurement-content/repository'
import {referenceEntryKey} from '../measurement-content/reference-candidate'
import {DECLARATIVE_REPORT_GENERATOR} from '../measurement-content/report-renderer'
import {decodeSurveyAttemptContentBinding} from './content-binding.service'
import type {ResearchFrozenPublication} from './publication.service'
import type {SurveyComputedFinal} from './final.compute'
import {SurveyWaveError} from './waves.service'

export interface SurveyReferenceInterpretation {
  metricKey:string;referenceKind:ReferenceKind
  status:'AVAILABLE'|'UNAVAILABLE'|'REVOKED'
  reason?:string
  values?:{z:number|null;t:number|null;percentile:{value:number;estimated:boolean}|null;meanDifference:number|null;bandKey:string|null}
}
export interface SurveyFinalInterpretation {
  schemaVersion:1;contentBindingHash:string
  units:Array<{instrumentKey:string;status:'INTERPRETED'|'UNAVAILABLE'|'REVOKED'|'NOT_SELECTED';reason?:string;
    references:SurveyReferenceInterpretation[];report:{status:'READY'|'REVOKED'|'NOT_SELECTED'|'UNAVAILABLE';generatorVersion?:string}}>
}
const fail=():never=>{throw new SurveyWaveError(409,'研究解释的冻结版本身份不一致')}
/** Called only in the authorized FINAL transaction, after the one authoritative
 * score computation. Stores personal numeric outcomes, not reference definitions
 * or report prose. Historical reads use this result and never call the selector.
 */
export async function interpretSurveyFinal(tx:Prisma.TransactionClient,input:{projectId:string;waveId:string;attemptId:string;
  publicationId:string;definitionDigest:string;selectedSnapshot:ResearchFrozenPublication;calculated:SurveyComputedFinal}):Promise<SurveyFinalInterpretation|undefined>{
  if(!input.selectedSnapshot.units.some(unit=>unit.measurementRelease))return undefined
  const rows=await tx.$queryRaw<Array<{cipher:string|null;hash:string|null;owner_id:string}>>(Prisma.sql`
    SELECT a.content_binding_cipher AS cipher,a.content_binding_hash AS hash,p.owner_user_id AS owner_id
    FROM survey_wave_attempts a JOIN survey_projects p ON p.id=a.project_id
    WHERE a.id=${input.attemptId} AND a.project_id=${input.projectId} AND a.wave_id=${input.waveId} FOR SHARE OF a,p`)
  if(rows.length!==1)fail()
  const row=rows[0],binding=decodeSurveyAttemptContentBinding({...input,contentBindingCipher:row.cipher,contentBindingHash:row.hash})
  if(!binding)return undefined // Explicit legacy behavior; never infer new interpretation identity.
  const cache=new Map<string,StoredRelease>()
  const read=async(id:string,hash:string)=>{
    let release=cache.get(id)
    if(!release){release=(await getContentRelease(tx,id,true))??undefined;if(release)cache.set(id,release)}
    if(!release||release.contentHash!==hash||release.scope.kind!=='PRIVATE'||release.scope.product!=='SURVEY'
      ||release.scope.ownerId!==row.owner_id||release.scope.resourceId!==input.projectId)fail()
    return release!
  }
  const units:SurveyFinalInterpretation['units']=[]
  for(const unit of binding.units){
    const result=input.calculated.units.find(r=>r.instrumentKey===unit.instrumentKey)
    const frozen=input.selectedSnapshot.units.find(r=>r.instrumentKey===unit.instrumentKey)
    if(!result||!frozen||result.sourceDigest!==frozen.sourceDigest||result.scoringDigest!==frozen.scoringDigest)fail()
    const measurement=await read(unit.measurement.releaseId,unit.measurement.contentHash)
    if(!result||measurement.layer!=='MEASUREMENT'||measurement.family!==result.kind
      ||measurement.content.measurementHash!==unit.measurement.measurementHash)fail()
    if(measurement.layer!=='MEASUREMENT')return fail()
    // Scale and SJT v1 retain authoritative privateScoring rather than a
    // duplicated measurement field. Project that stored output once in memory.
    const facts=result!.measurement??(result!.privateScoring?projectStoredMeasurement({
      identity:{schemaVersion:1,kind:measurement.family,sourceDigest:result!.sourceDigest,scoringDigest:result!.scoringDigest,
        engineVersion:measurement.content.runnerVersion,scoringVersion:measurement.content.scoringVersion,protocolDigest:null},
      storedResult:result!.privateScoring,metricUnits:Object.fromEntries(measurement.content.metrics.map(m=>[m.metricKey,m.unit]))}):undefined)
    const reason=measurement.status==='REVOKED'?'MEASUREMENT_REVOKED':result!.notExecuted?'NOT_EXECUTED':
      facts?.quality.status!=='interpretable'?'QUALITY_UNAVAILABLE':undefined
    const references:SurveyReferenceInterpretation[]=[]
    for(const slot of unit.references){
      if(reason){references.push({metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:reason==='MEASUREMENT_REVOKED'?'REVOKED':'UNAVAILABLE',reason});continue}
      if(slot.status==='UNAVAILABLE'){references.push({metricKey:slot.metricKey,referenceKind:slot.referenceKind,status:slot.reason==='REVOKED'?'REVOKED':'UNAVAILABLE',reason:slot.reason});continue}
      const release=await read(slot.releaseId,slot.contentHash)
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
    let report:SurveyFinalInterpretation['units'][number]['report']={status:'NOT_SELECTED'}
    if(unit.report){
      const release=await read(unit.report.releaseId,unit.report.contentHash)
      if(release.layer!=='REPORT')return fail()
      if(release.family!==measurement.family||release.content.generatorVersion!==DECLARATIVE_REPORT_GENERATOR
        ||release.content.measurements.length!==1||canonicalHash(release.content.measurements[0])!==canonicalHash({releaseId:measurement.releaseId,contentHash:measurement.contentHash}))fail()
      report={status:release.status==='REVOKED'||reason==='MEASUREMENT_REVOKED'?'REVOKED':result!.notExecuted?'UNAVAILABLE':'READY',generatorVersion:release.content.generatorVersion}
    }
    units.push({instrumentKey:unit.instrumentKey,status:reason==='MEASUREMENT_REVOKED'?'REVOKED':reason?'UNAVAILABLE':references.some(r=>r.status==='AVAILABLE')||report.status==='READY'?'INTERPRETED':references.some(r=>r.status==='REVOKED')||report.status==='REVOKED'?'REVOKED':unit.references.length||unit.report?'UNAVAILABLE':'NOT_SELECTED',
      ...(reason?{reason}:{}),references,report})
  }
  return {schemaVersion:1,contentBindingHash:row.hash!,units}
}
