import {Prisma} from '@prisma/client'
import {canonicalHash,retainImmutableCanonicalValue} from '../assessment-runtime/canonical'
import {isAssessmentOperationallyPaused} from '../assessment-governance/operational-hold'
import {getContentRelease} from './repository'
import {ContentReleaseError} from './release'
import {compileStandardCombinationReport,describeStandardCombination,selectedStandardReport,type StandardCombinationRecord} from './standard-combination'
import type {Triplet} from '../survey/standard-triplet.model'
import type {StoredRelease} from './repository'
import {importedMeasurementPayload,importedNativeDefinition,databaseContentSource} from '../scale/component-import/native-source'

export class StandardCombinationSourceError extends ContentReleaseError {readonly statusCode=409}
function fail(code:string):never{throw new StandardCombinationSourceError('STANDARD_COMBINATION_'+code)}
export type ExactStandardCombination=StandardCombinationRecord&{snapshot:Triplet}
type Purpose='NEW_REFERENCE'|'COLLECTION'|'HISTORY'
type Measurement=Extract<StoredRelease,{layer:'MEASUREMENT'}>
type Mapping=ReturnType<typeof describeStandardCombination>
type Facts={row:Omit<ExactStandardCombination,'state'|'measurement_release'>;measurement:Omit<Measurement,'status'|'publishedAt'>;
 publishedAt:string;mapping:Omit<Mapping,'approval'|'measurement'>}
// Only a caller-owned transaction can retain facts. No account, grant, policy,
// expiry, lifecycle or emergency decision is stored here. Root-client calls are
// deliberately fresh; the weak transaction key bounds lifetime and DB identity.
const transactionFacts=new WeakMap<object,Map<string,Facts>>()
function readable(status:string,purpose:Purpose){return purpose==='NEW_REFERENCE'?status==='PUBLISHED'
 :purpose==='COLLECTION'?['PUBLISHED','SUPERSEDED','RETIRED'].includes(status):['PUBLISHED','SUPERSEDED','RETIRED','REVOKED'].includes(status)}
function current(row:{id:string;state:string;combination_hash:string;measurement_release:{releaseId:string;contentHash:string}|null},input:{releaseId:string;combinationHash:string},purpose:Purpose){
 if(row.id!==input.releaseId||purpose!=='HISTORY'&&row.state!=='ONLINE'||row.combination_hash!==input.combinationHash)fail('NOT_CURRENT')
 if(!row.measurement_release)fail('MEASUREMENT_REQUIRED')
}
function hold(snapshot:Triplet,purpose:Purpose){
 if(purpose==='NEW_REFERENCE'&&isAssessmentOperationallyPaused({family:'SCALE',key:snapshot.toolKey,version:snapshot.instrumentVersion}))fail('OPERATIONALLY_PAUSED')
}

/** Shared source resolution, not authorization. Every lookup names one stored
 * combination, never latest or a registry replacement. Keep locks in the caller's
 * transaction through its protected write. HISTORY is immutable provenance only,
 * behind the existing report/data ACL, never an admission or authority proof. */
export async function readCurrentStandardCombination(tx:Prisma.TransactionClient,input:{releaseId:string;combinationHash:string},purpose:Purpose='NEW_REFERENCE',reuseImmutableFacts=true){
  const eligible=reuseImmutableFacts&&!('$transaction'in tx)
  const facts=eligible?transactionFacts.get(tx)?.get(input.releaseId):undefined
  if(facts){
    const [header]=await tx.$queryRaw<Array<{id:string;state:string;combination_hash:string;measurement_release:{releaseId:string;contentHash:string}|null}>>(Prisma.sql`
      SELECT id,state,combination_hash,measurement_release FROM survey_standard_releases WHERE id=${input.releaseId} FOR SHARE`)
    if(!header)fail('NOT_CURRENT')
    current(header,input,purpose);hold(facts.row.snapshot,purpose)
    if(header.measurement_release!.releaseId===facts.measurement.releaseId&&header.measurement_release!.contentHash===facts.measurement.contentHash){
      const [m]=await tx.$queryRaw<Array<{id:string;status:Measurement['status'];content_hash:string;hash_scheme:string}>>(Prisma.sql`
        SELECT id,status,content_hash,hash_scheme FROM measurement_content_releases WHERE id=${header.measurement_release!.releaseId} FOR SHARE`)
      if(!m||m.id!==facts.measurement.releaseId||m.content_hash!==facts.measurement.contentHash||m.hash_scheme!==facts.measurement.hashScheme||!readable(m.status,purpose))fail('IDENTITY_MISMATCH')
      const measurement:Measurement={...facts.measurement,status:m.status,publishedAt:new Date(facts.publishedAt)}
      const row:ExactStandardCombination={...facts.row,state:header.state,measurement_release:header.measurement_release}
      const mapping:Mapping={...facts.mapping,approval:{state:header.state},measurement:{pointer:header.measurement_release,status:m.status}}
      return {row,measurement,mapping}
    }
    transactionFacts.get(tx)!.delete(input.releaseId)
  }
  const [row]=await tx.$queryRaw<ExactStandardCombination[]>(Prisma.sql`SELECT * FROM survey_standard_releases WHERE id=${input.releaseId} FOR SHARE`)
  if(!row)fail('NOT_CURRENT')
  current(row,input,purpose);hold(row.snapshot,purpose)
  const measurement=await getContentRelease(tx,row.measurement_release!.releaseId,true)
  const mapping=assertExactStandardCombinationFacts(row,measurement,purpose)
  if(!measurement||measurement.layer!=='MEASUREMENT')return fail('MEASUREMENT_REQUIRED')
  if(eligible){
    let cache=transactionFacts.get(tx);if(!cache){cache=new Map();transactionFacts.set(tx,cache)}
    if(cache.size<128){
      const {status:_,publishedAt,...measurementFacts}=measurement
      const {approval:__,measurement:___,...mappingFacts}=mapping
      const body=retainImmutableCanonicalValue({row:{id:row.id,tool_key:row.tool_key,combination_hash:row.combination_hash,approved_by:row.approved_by,snapshot:row.snapshot},
        measurement:measurementFacts,publishedAt:publishedAt.toISOString(),mapping:mappingFacts})
      cache.set(row.id,body)
    }
  }
  return {row,measurement,mapping}
}

/** Pure exact-source validation shared by bounded family loaders. Authorization,
 * current source state and emergency admission remain at their consuming layer. */
export function assertExactStandardCombinationFacts(row:ExactStandardCombination,measurement:StoredRelease|null|undefined,purpose:Purpose='NEW_REFERENCE'){
  const mapping=describeStandardCombination(row,measurement??null)
  if(mapping.axisIdentity.status!=='VALID'||!readable(mapping.measurement.status,purpose))fail('IDENTITY_MISMATCH')
  if(!measurement||measurement.layer!=='MEASUREMENT')return fail('MEASUREMENT_REQUIRED')
  const {report,referencePolicy,source:_,license:__,...content}=row.snapshot.definition
  if(canonicalHash(content)!==canonicalHash(importedMeasurementPayload(row.snapshot.parts.CONTENT)))fail('CONTENT_SNAPSHOT_MISMATCH')
  if(databaseContentSource(row.snapshot.parts.CONTENT))importedNativeDefinition(row.snapshot.parts.CONTENT)
  const p=row.snapshot.parts.PARAMETERS.payload as {referencePolicy:unknown;references:unknown[]}|null
  if(canonicalHash(referencePolicy)!==canonicalHash(p?.referencePolicy??{type:'none'})
    ||canonicalHash(row.snapshot.references)!==canonicalHash(p?.references??[]))fail('PARAMETERS_SNAPSHOT_MISMATCH')
  if(row.snapshot.parts.REPORT.payload===null){if(row.snapshot.template!==null)fail('REPORT_SNAPSHOT_MISMATCH')}
  else if(canonicalHash(report)!==canonicalHash(selectedStandardReport(row.snapshot.parts.REPORT.payload).definition))fail('REPORT_SNAPSHOT_MISMATCH')
  const compiled=compileStandardCombinationReport(row.snapshot.title,row.snapshot.definition,row.snapshot.parts.REPORT.payload!==null)
  const template=selectedStandardReport(row.snapshot.parts.REPORT.payload).template??compiled.template
  if(compiled.blockers.length||canonicalHash(template)!==canonicalHash(row.snapshot.template))fail('REPORT_TEMPLATE_MISMATCH')
  return mapping
}
