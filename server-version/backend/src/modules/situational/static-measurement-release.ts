import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES} from './onboarding/instruments.generated'
import {createSituationalInstrumentRegistry} from './onboarding/instrument-registry'
import {publicationContentDigest} from './onboarding/schema'
import {assertAssessmentOperationallyActive} from '../assessment-governance/operational-hold'
import {lockInstrumentSourceIdentity} from '../assessment-authorization/source-identity-lock'
import {mapAuthorizationRowToDomain} from '../assessment-authorization/repository'
import {resolveEffectiveAuthorization,assertLocaleTerritoryMatch,evaluateAuthorizationOverlayStatus} from '../assessment-authorization/publish-gates'
import {hashInstrumentAuthorizationRecord} from '../assessment-authorization/records'
import {sjtMeasurementRelease} from '../measurement-content/sjt'
import {getContentRelease,publishContentRelease,type StoredRelease} from '../measurement-content/repository'
import {ContentReleaseError,prepareRelease} from '../measurement-content/release'
import {canonicalHash} from '../assessment-runtime/canonical'
const registry=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES)
export type StaticSjtRegistryMapping={id:string;instrument_key:string;instrument_version:string;content_digest:string;measurement_release_id:string|null;deployment:unknown|null;deployment_hash:string|null}
export const staticSjtDeploymentSchema=z.object({locale:z.string().trim().min(1).max(240),territory:z.string().trim().min(1).max(240),commercialNature:z.enum(['NON_COMMERCIAL','COMMERCIAL']),grantee:z.string().trim().min(1).max(240)}).strict()
export type StaticSjtDeployment=z.infer<typeof staticSjtDeploymentSchema>
class StaticSjtError extends ContentReleaseError {readonly statusCode=409}
function fail(code:string):never{throw new StaticSjtError('CONTENT_STATIC_SJT_'+code)}
function actual(identity:{instrumentKey:string;instrumentVersion:string}){
 const source=registry.sources.find(s=>s.content.identity.instrumentKey===identity.instrumentKey&&s.content.identity.instrumentVersion===identity.instrumentVersion)
 if(!source)fail('SOURCE_NOT_INSTALLED')
 return source
}
function check(row:StaticSjtRegistryMapping){
 const source=actual({instrumentKey:row.instrument_key,instrumentVersion:row.instrument_version})
 if(publicationContentDigest(source.content)!==row.content_digest)fail('SOURCE_CHANGED')
 return source
}
/** Explicit system preparation only: installing a mapping never grants a license,
 * entry role, content capability or publication. It includes generated sources
 * exclusively, never development fixtures from listSituationPackages(). */
export async function ensureStaticSjtRegistryMapping(tx:Prisma.TransactionClient,identity:{instrumentKey:string;instrumentVersion:string}){
 const source=actual(identity)
 await lockInstrumentSourceIdentity(tx,identity,'READ')
 await tx.$executeRaw(Prisma.sql`INSERT INTO static_sjt_measurement_mappings(id,instrument_key,instrument_version,content_digest)
  VALUES(${randomUUID()},${identity.instrumentKey},${identity.instrumentVersion},${publicationContentDigest(source.content)}) ON CONFLICT(instrument_key,instrument_version) DO NOTHING`)
 const rows=await tx.$queryRaw<StaticSjtRegistryMapping[]>(Prisma.sql`SELECT * FROM static_sjt_measurement_mappings WHERE instrument_key=${identity.instrumentKey} AND instrument_version=${identity.instrumentVersion} FOR SHARE`)
 if(rows.length!==1)fail('MAPPING_MISSING');check(rows[0]);return rows[0]
}
/** Batch root resource validation: source locks precede row/User/grant locks. */
export async function validateStaticSjtRegistryMappings(tx:Prisma.TransactionClient,ids:string[],mode:'READ'|'PUBLISH'='READ'){
 if(!ids.length||ids.length>128||new Set(ids).size!==ids.length||ids.some(id=>!z.string().guid().safeParse(id).success))fail('MAPPING_INVALID')
 const before=await tx.$queryRaw<StaticSjtRegistryMapping[]>(Prisma.sql`SELECT * FROM static_sjt_measurement_mappings WHERE id IN (${Prisma.join(ids)})`)
 if(before.length!==ids.length)fail('MAPPING_MISSING')
 for(const row of [...before].sort((a,b)=>a.instrument_key.localeCompare(b.instrument_key)||a.instrument_version.localeCompare(b.instrument_version)))
  await lockInstrumentSourceIdentity(tx,{instrumentKey:row.instrument_key,instrumentVersion:row.instrument_version},'READ')
 const rows=await tx.$queryRaw<StaticSjtRegistryMapping[]>(Prisma.sql`SELECT * FROM static_sjt_measurement_mappings WHERE id IN (${Prisma.join(ids)}) ORDER BY instrument_key,instrument_version ${mode==='PUBLISH'?Prisma.sql`FOR UPDATE`:Prisma.sql`FOR SHARE`}`)
 if(rows.length!==ids.length||rows.some(row=>!before.some(b=>b.id===row.id&&b.instrument_key===row.instrument_key&&b.instrument_version===row.instrument_version)))fail('MAPPING_CHANGED')
 rows.forEach(check);return rows
}
export async function validateStaticSjtRegistryMapping(tx:Prisma.TransactionClient,id:string,mode:'READ'|'PUBLISH'='READ'){return (await validateStaticSjtRegistryMappings(tx,[id],mode))[0]}
async function rights(tx:Prisma.TransactionClient,row:StaticSjtRegistryMapping,raw:StaticSjtDeployment,authorizationId?:string){
 const deployment=staticSjtDeploymentSchema.parse(raw)
 // Source READ lock held by caller prevents fresh lineages and amendments until
 // transaction end. All writers share source-identity-lock.ts's EXCLUSIVE lock.
 const rows=await tx.instrumentAuthorization.findMany({where:{instrumentKey:row.instrument_key,instrumentVersion:row.instrument_version},orderBy:[{authorizationKey:'asc'},{version:'desc'}]})
 const records=rows.map(r=>{const record=mapAuthorizationRowToDomain(r);if(hashInstrumentAuthorizationRecord(record)!==r.recordHash)fail('LICENSE_HASH');return record})
 const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
 if(!clock)fail('CLOCK_MISSING')
 for(const id of [...new Set(records.map(r=>r.authorizationId))].filter(id=>!authorizationId||id===authorizationId)){
  const record=resolveEffectiveAuthorization({authorizations:records.filter(r=>r.authorizationId===id),instrumentKey:row.instrument_key,instrumentVersion:row.instrument_version,nowIso:clock.now.toISOString()})
  if(!record||!['APPROVED','EVIDENCE_PENDING'].includes(evaluateAuthorizationOverlayStatus(record,clock.now.toISOString()))||record.grantee!==deployment.grantee
   ||!record.scope.electronicAdministration||!record.scope.scoring||!record.scope.display
   ||!assertLocaleTerritoryMatch({record,locale:deployment.locale,territory:deployment.territory}).ok
   ||record.scope.commercialNature==='UNSPECIFIED'||record.scope.commercialNature==='NON_COMMERCIAL'&&deployment.commercialNature!=='NON_COMMERCIAL')continue
  return {authorizationId:record.authorizationId,authorizationVersion:record.version,recordHash:hashInstrumentAuthorizationRecord(record)}
 }
 fail('SOURCE_LICENSE_DENIED')
}
function active(row:StaticSjtRegistryMapping,purpose:'PUBLISH'|'START'='PUBLISH'){
 const source=check(row)
 if(source.publication.releaseStatus==='DRAFT'||purpose==='PUBLISH'&&source.publication.releaseStatus!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
 assertAssessmentOperationallyActive({family:'SITUATIONAL',key:row.instrument_key,version:row.instrument_version})
 return source
}
function projection(row:StaticSjtRegistryMapping){
 const source=check(row)
 const input=sjtMeasurementRelease({localId:row.instrument_key,version:'registry-v1',instrumentVersion:row.instrument_version,definition:source.content.definition,scope:{kind:'PLATFORM'},
  provenance:{sourceKind:'STATIC_SJT_REGISTRY',mappingId:row.id,contentDigest:row.content_digest,instrumentKey:row.instrument_key,instrumentVersion:row.instrument_version}})
 if(input.layer!=='MEASUREMENT')fail('LAYER')
 input.version='registry-v1:'+input.content.measurementHash
 return input
}
function verify(release:StoredRelease|null,row:StaticSjtRegistryMapping,purpose:'PUBLISH'|'START'|'HISTORY'='PUBLISH'){
 if(!release)fail('RELEASE_MISSING')
 const expected=prepareRelease(projection(row))
 if(release.layer!=='MEASUREMENT'||release.family!=='SJT'||release.scope.kind!=='PLATFORM'||release.scope.ownerId!==undefined||(release.status==='REVOKED'||purpose==='PUBLISH'&&release.status!=='PUBLISHED')
  ||release.contentHash!==expected.contentHash||release.key!==expected.key||release.version!==expected.version
  ||canonicalHash(release.content)!==canonicalHash(expected.content)||canonicalHash(release.assetRefs)!==canonicalHash(expected.assetRefs)
  ||release.provenance.sourceKind!=='STATIC_SJT_REGISTRY'||release.provenance.mappingId!==row.id
  ||release.provenance.contentDigest!==row.content_digest||release.provenance.instrumentKey!==row.instrument_key
  ||release.provenance.instrumentVersion!==row.instrument_version)fail('RELEASE_MISMATCH')
 return release
}
/** Caller must authenticate the real system actor and assert exact independent
 * measurement.publish capability in this transaction, after source/mapping locks
 * and before invoking this function. Deployment is explicitly declared by the strongly authenticated publisher and matched against one actual source license. */
export async function publishStaticSjtMeasurement(tx:Prisma.TransactionClient,input:{actorId:string;mappingId:string;deployment:StaticSjtDeployment}){
 if(!input.actorId)fail('ACTOR_REQUIRED')
 const row=await validateStaticSjtRegistryMapping(tx,input.mappingId,'PUBLISH');active(row)
 const deployment=staticSjtDeploymentSchema.parse(input.deployment)
 if(row.measurement_release_id&&(row.deployment_hash!==canonicalHash(deployment)||canonicalHash(row.deployment)!==row.deployment_hash))fail('DEPLOYMENT_IMMUTABLE')
 if(row.measurement_release_id){
  const release=verify(await getContentRelease(tx,row.measurement_release_id,true),row)
  await rights(tx,row,deployment,sourceAuthorization(release).authorizationId)
  return {mapping:row,release}
 }
 const authorization=await rights(tx,row,deployment)
 const projected=projection(row)
 projected.provenance={...projected.provenance,sourceAuthorization:authorization}
 const release=verify(await publishContentRelease(tx,projected,input.actorId),row)
 // Recheck validity after release/advisory lock waits, before committing the mapping.
 await rights(tx,row,deployment,authorization.authorizationId)
 const count=await tx.$executeRaw(Prisma.sql`UPDATE static_sjt_measurement_mappings SET measurement_release_id=${release.releaseId},deployment=${JSON.stringify(deployment)}::jsonb,deployment_hash=${canonicalHash(deployment)}
  WHERE id=${row.id} AND (measurement_release_id IS NULL OR measurement_release_id=${release.releaseId})`)
 if(count!==1)fail('MAPPING_CHANGED')
 return {mapping:{...row,measurement_release_id:release.releaseId,deployment,deployment_hash:canonicalHash(deployment)},release}
}
/** Exact source read for new publication/START or historical report authoring.
 * HISTORY does not reacquire source rights; frozen FINAL/report reads do not call
 * this registry resolver at all and retain their immutable source provenance. */
const validatedConsumerReads=new WeakMap<object,{tx:Prisma.TransactionClient;mapping:StaticSjtRegistryMapping;release:StoredRelease;purpose:'PUBLISH'|'START'|'HISTORY'}>()
export async function readStaticSjtMeasurementForStart(tx:Prisma.TransactionClient,input:{instrumentKey:string;instrumentVersion:string},purpose:'PUBLISH'|'START'|'HISTORY'='START'){
 await lockInstrumentSourceIdentity(tx,input,'READ')
 const rows=await tx.$queryRaw<StaticSjtRegistryMapping[]>(Prisma.sql`SELECT * FROM static_sjt_measurement_mappings WHERE instrument_key=${input.instrumentKey} AND instrument_version=${input.instrumentVersion} FOR SHARE`)
 if(rows.length!==1)fail('MAPPING_MISSING')
 const mapping=rows[0];if(purpose!=='HISTORY')active(mapping,purpose);else check(mapping)
 const deployment=staticSjtDeploymentSchema.parse(mapping.deployment)
 if(!mapping.deployment_hash||canonicalHash(deployment)!==mapping.deployment_hash)fail('DEPLOYMENT_INVALID')
 if(!mapping.measurement_release_id)fail('RELEASE_MISSING')
 const release=verify(await getContentRelease(tx,mapping.measurement_release_id,true),mapping,purpose)
 if(purpose!=='HISTORY')await rights(tx,mapping,deployment,sourceAuthorization(release).authorizationId)
 const result={mapping,release};validatedConsumerReads.set(result,{tx,mapping,release,purpose});return result
}

/** Final clock fence for a source already validated and locked in this exact
 * transaction. It does not recompile or silently switch authorization lineage. */
export async function recheckStaticSjtConsumerLicense(tx:Prisma.TransactionClient,receipt:Awaited<ReturnType<typeof readStaticSjtMeasurementForStart>>){
 const validated=validatedConsumerReads.get(receipt)
 if(!validated||validated.tx!==tx)fail('SOURCE_LICENSE_RECEIPT_INVALID')
 if(validated.purpose==='HISTORY')return
 const {mapping,release}=validated,deployment=staticSjtDeploymentSchema.parse(mapping.deployment)
 if(mapping.measurement_release_id!==release.releaseId||canonicalHash(deployment)!==mapping.deployment_hash)fail('DEPLOYMENT_INVALID')
 await rights(tx,mapping,deployment,sourceAuthorization(release).authorizationId)
}

function sourceAuthorization(release:StoredRelease){
 const parsed=z.object({authorizationId:z.string().guid(),authorizationVersion:z.number().int().positive(),recordHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().safeParse(release.provenance.sourceAuthorization)
 if(!parsed.success)fail('SOURCE_LICENSE_IDENTITY_INVALID')
 return parsed.data
}
