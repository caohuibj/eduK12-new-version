import {Prisma} from '@prisma/client'
import {canonicalHash} from '../assessment-runtime/canonical'
import {isAssessmentOperationallyPaused} from '../assessment-governance/operational-hold'
import {getContentRelease} from './repository'
import {ContentReleaseError} from './release'
import {describeStandardCombination,type StandardCombinationRecord} from './standard-combination'
import type {Triplet} from '../survey/standard-triplet.model'

export class StandardCombinationSourceError extends ContentReleaseError {readonly statusCode=409}
function fail(code:string):never{throw new StandardCombinationSourceError('STANDARD_COMBINATION_'+code)}
export type ExactStandardCombination=StandardCombinationRecord&{snapshot:Triplet}

/** Shared source resolution, not authorization. Every lookup names one stored
 * combination, never latest or a registry replacement. Keep locks in the caller's
 * transaction through its protected write; old report reads do not call this. */
export async function readCurrentStandardCombination(tx:Prisma.TransactionClient,input:{releaseId:string;combinationHash:string},purpose:'NEW_REFERENCE'|'COLLECTION'='NEW_REFERENCE'){
  const [row]=await tx.$queryRaw<ExactStandardCombination[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE id=${input.releaseId} FOR SHARE`)
  if(!row||row.id!==input.releaseId||row.state!=='ONLINE'||row.combination_hash!==input.combinationHash)fail('NOT_CURRENT')
  if(!row.measurement_release)fail('MEASUREMENT_REQUIRED')
  if(purpose==='NEW_REFERENCE'&&isAssessmentOperationallyPaused({family:'SCALE',key:row.snapshot.toolKey,version:row.snapshot.instrumentVersion}))fail('OPERATIONALLY_PAUSED')
  const measurement=await getContentRelease(tx,row.measurement_release.releaseId,true)
  const mapping=describeStandardCombination(row,measurement)
  const readable=purpose==='NEW_REFERENCE'?mapping.measurement.status==='PUBLISHED'
    :['PUBLISHED','SUPERSEDED','RETIRED'].includes(mapping.measurement.status)
  if(mapping.axisIdentity.status!=='VALID'||!readable)fail('IDENTITY_MISMATCH')
  if(!measurement||measurement.layer!=='MEASUREMENT')return fail('MEASUREMENT_REQUIRED')
  const {report,referencePolicy,source:_,license:__,...content}=row.snapshot.definition
  if(canonicalHash(content)!==row.snapshot.parts.CONTENT.hash)fail('CONTENT_SNAPSHOT_MISMATCH')
  const p=row.snapshot.parts.PARAMETERS.payload as {referencePolicy:unknown;references:unknown[]}|null
  if(canonicalHash(referencePolicy)!==canonicalHash(p?.referencePolicy??{type:'none'})
    ||canonicalHash(row.snapshot.references)!==canonicalHash(p?.references??[]))fail('PARAMETERS_SNAPSHOT_MISMATCH')
  if(row.snapshot.parts.REPORT.payload===null){if(row.snapshot.template!==null)fail('REPORT_SNAPSHOT_MISMATCH')}
  else if(canonicalHash(report)!==row.snapshot.parts.REPORT.hash)fail('REPORT_SNAPSHOT_MISMATCH')
  return {row,measurement,mapping}
}
