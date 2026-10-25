import {canonicalHash} from '../assessment-runtime/canonical'
import {prepareRelease} from './release'
import type {StoredRelease} from './repository'
import {scaleMeasurementRelease} from './scale'
import type {ScaleDefinitionV2} from '../scale/scale-definition'

export const STANDARD_AXES=['CONTENT','PARAMETERS','REPORT'] as const
export type StandardAxis=typeof STANDARD_AXES[number]
export type StandardAxisHashes=Record<StandardAxis,string>
type AxisSnapshot={axis:StandardAxis;version:string;hash:string;sourceVersion:string;payload:unknown}
export type StandardCombinationSnapshot={
  toolKey:string;instrumentVersion:string;combinationHash:string;parts:Record<StandardAxis,AxisSnapshot>;definition:ScaleDefinitionV2
}
export type StandardCombinationRecord={
  id:string;tool_key:string;combination_hash:string;state:string;approved_by:string;snapshot:StandardCombinationSnapshot
  measurement_release:{releaseId:string;contentHash:string}|null
}

/** Preserve the existing approved-combination hash scheme byte for byte.
 * Axis hashes identify snapshots; they are never formal release contentHash values. */
export const standardAxisHashes=(parts:Record<StandardAxis,{hash:string}>):StandardAxisHashes=>({
  CONTENT:parts.CONTENT.hash,PARAMETERS:parts.PARAMETERS.hash,REPORT:parts.REPORT.hash,
})
export const standardCombinationHash=(toolKey:string,hashes:StandardAxisHashes)=>canonicalHash({toolKey,
  CONTENT:hashes.CONTENT,PARAMETERS:hashes.PARAMETERS,REPORT:hashes.REPORT})

/** The approved row currently records only its platform MEASUREMENT pointer.
 * Reuse its existing producer contract; no Survey PRIVATE copy is made here. */
export function standardCombinationMeasurementInput(row:StandardCombinationRecord){
  const t=row.snapshot
  return scaleMeasurementRelease({localId:'survey-standard:'+t.toolKey,version:t.parts.CONTENT.hash,
    instrumentVersion:t.instrumentVersion,definition:t.definition,instrumentClass:'STANDARD',
    scope:{kind:'PLATFORM',ownerId:row.approved_by},
    provenance:{surveyStandardContentHash:t.parts.CONTENT.hash,toolKey:t.toolKey}})
}

/** Read-only management mapping of existing facts, shared by both entry views.
 * NOT_EVALUATED never means missing/approved. This view is not a use permission,
 * entry admission, trial, release publisher or frozen-runtime binding. */
export function describeStandardCombination(row:StandardCombinationRecord,measurement:StoredRelease|null){
  const t=row.snapshot,hashes=standardAxisHashes(t.parts),issues:string[]=[]
  if(row.tool_key!==t.toolKey||row.combination_hash!==t.combinationHash
    ||standardCombinationHash(t.toolKey,hashes)!==row.combination_hash)issues.push('COMBINATION_IDENTITY_MISMATCH')
  if(t.instrumentVersion!==t.parts.CONTENT.sourceVersion)issues.push('CONTENT_SOURCE_VERSION_MISMATCH')
  for(const axis of STANDARD_AXES){
    const part=t.parts[axis]
    if(part.axis!==axis||canonicalHash(part.payload)!==part.hash)issues.push(axis+'_SNAPSHOT_MISMATCH')
  }
  if(t.parts.CONTENT.payload===null)issues.push('CONTENT_REQUIRED')

  const pointer=row.measurement_release
  let contentStatus:'NOT_RECORDED'|'MISSING'|'IDENTITY_MISMATCH'|StoredRelease['status']='NOT_RECORDED'
  if(pointer){
    if(!measurement)contentStatus='MISSING'
    else{
      const expected=prepareRelease(standardCombinationMeasurementInput(row))
      const matches=measurement.releaseId===pointer.releaseId&&measurement.layer==='MEASUREMENT'&&measurement.family==='SCALE'
        &&measurement.contentHash===pointer.contentHash&&measurement.contentHash===expected.contentHash
        &&measurement.key===expected.key&&measurement.version===expected.version
        &&canonicalHash(measurement.scope)===canonicalHash(expected.scope)
        &&canonicalHash(measurement.provenance)===canonicalHash(expected.provenance)
        &&measurement.sourceReleaseId===expected.sourceReleaseId&&canonicalHash(measurement.assetRefs)===canonicalHash(expected.assetRefs)
      contentStatus=matches?measurement.status:'IDENTITY_MISMATCH'
    }
  }
  const axes=Object.fromEntries(STANDARD_AXES.map(axis=>{
    const p=t.parts[axis]
    return [axis,{version:p.version,axisHash:p.hash,sourceVersion:p.sourceVersion,
      configuration:p.payload===null?'EXPLICITLY_UNCONFIGURED' as const:'CONFIGURED' as const,
      formalReleaseBinding:axis==='CONTENT'&&pointer?'MEASUREMENT_POINTER' as const:'NOT_RECORDED_IN_COMBINATION' as const}]
  })) as Record<StandardAxis,{version:string;axisHash:string;sourceVersion:string;configuration:'CONFIGURED'|'EXPLICITLY_UNCONFIGURED';formalReleaseBinding:'MEASUREMENT_POINTER'|'NOT_RECORDED_IN_COMBINATION'}>
  return {
    identity:{releaseId:row.id,toolKey:t.toolKey,combinationHash:row.combination_hash},
    axisIdentity:{status:issues.length?'INVALID' as const:'VALID' as const,issues},
    compatibility:'NOT_EVALUATED' as const,
    approval:{state:row.state},axes,
    measurement:{pointer,status:contentStatus},
    consumers:{
      SURVEY:{sourceAdapter:'CONNECTED' as const,sourceRef:{kind:'SCALE' as const,sourceId:'survey-standard:'+row.id,sourceVersion:row.combination_hash},
        parameterReportBinding:'PROJECT_MATERIALIZATION' as const,entryAdmission:'NOT_EVALUATED' as const,targetUseGrant:'NOT_EVALUATED' as const},
      TRAINING:{sourceAdapter:'NOT_CONNECTED' as const,sourceRef:null,parameterReportBinding:'NOT_CONNECTED' as const,
        entryAdmission:'NOT_EVALUATED' as const,targetUseGrant:'NOT_EVALUATED' as const,
        missingContracts:['EXACT_COMBINATION_SOURCE','COMBINATION_ENTRY_ADMISSION','COMBINATION_TARGET_GRANT',
          'FROZEN_COMBINATION_BINDING','PARAMETER_REPORT_BINDING','CURRENT_COMBINATION_STOP_CHECK']},
    },
    runtimeAuthorization:'NOT_EVALUATED' as const,
  }
}
