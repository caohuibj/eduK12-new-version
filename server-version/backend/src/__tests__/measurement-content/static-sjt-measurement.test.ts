import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),publish:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get,publishContentRelease:mocks.publish}))
import {ensureStaticSjtRegistryMapping,validateStaticSjtRegistryMappings,publishStaticSjtMeasurement,readStaticSjtMeasurementForStart,recheckStaticSjtConsumerLicense} from '../../modules/situational/static-measurement-release'
import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES} from '../../modules/situational/onboarding/instruments.generated'
import {createSituationalInstrumentRegistry} from '../../modules/situational/onboarding/instrument-registry'
import {publicationContentDigest} from '../../modules/situational/onboarding/schema'
import {createInstrumentAuthorizationDraft,hashInstrumentAuthorizationRecord} from '../../modules/assessment-authorization/records'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ASSESSMENT_OPERATIONAL_HOLDS,operationalIdentityKey} from '../../modules/assessment-governance/operational-hold'
const source=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES).sources[0],identity=source.content.identity
const id='11111111-1111-4111-8111-111111111111',releaseId='22222222-2222-4222-8222-222222222222'
const deployment={locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL' as const,grantee:'Synthetic deployment'}
const sql=(q:any)=>q.strings.join(' ')
let row:any,records:any[],now:Date,release:any
const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),instrumentAuthorization:{findMany:vi.fn()}}
function authorization(patch:any={}){
 const draft=createInstrumentAuthorizationDraft({...identity,grantor:'Synthetic grantor',grantee:deployment.grantee,
  scope:{electronicAdministration:true,scoring:true,translation:false,display:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL'},
  validFrom:'2026-01-01T00:00:00.000Z',validTo:'2027-01-01T00:00:00.000Z',basis:'Synthetic test only',createdByUserId:'actor',now:'2026-10-01T00:00:00.000Z'})
 return {...draft,status:'APPROVED',approvedByUserId:'actor',approvedAt:draft.createdAt,...patch}
}
function dbRecord(r:any){return {id:r.authorizationId,authorizationKey:r.authorizationId,...r,...r.scope,
 validFrom:new Date(r.validFrom),validTo:new Date(r.validTo),createdAt:new Date(r.createdAt),updatedAt:new Date(r.updatedAt),
 approvedAt:r.approvedAt?new Date(r.approvedAt):null,recordHash:hashInstrumentAuthorizationRecord(r)}}
const publish=()=>publishStaticSjtMeasurement(db as never,{actorId:'actor',mappingId:id,deployment})
const start=()=>readStaticSjtMeasurementForStart(db as never,identity)
beforeEach(()=>{
 vi.resetAllMocks();ASSESSMENT_OPERATIONAL_HOLDS.clear();now=new Date('2026-10-20T00:00:00Z');release=null
 row={id,instrument_key:identity.instrumentKey,instrument_version:identity.instrumentVersion,content_digest:publicationContentDigest(source.content),measurement_release_id:null,deployment:null,deployment_hash:null};records=[authorization()]
 db.$queryRaw.mockImplementation(async q=>sql(q).includes('clock_timestamp')?[{now}]:[row])
 db.$executeRaw.mockImplementation(async q=>{if(sql(q).includes('UPDATE static_sjt'))Object.assign(row,{measurement_release_id:releaseId,deployment,deployment_hash:canonicalHash(deployment)});return 1})
 db.instrumentAuthorization.findMany.mockImplementation(async()=>records.map(dbRecord))
 mocks.publish.mockImplementation(async(_db,input)=>release={...prepareRelease(input),releaseId,status:'PUBLISHED',publishedBy:'actor',publishedAt:now})
 mocks.get.mockImplementation(async()=>release)
})
describe('explicit installed static SJT measurement conversion',()=>{
 it('prepares only installed exact sources and never publishes or creates an authorization',async()=>{
  expect(await ensureStaticSjtRegistryMapping(db as never,identity)).toBe(row)
  expect(mocks.publish).not.toHaveBeenCalled();expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  expect(sql(db.$executeRaw.mock.calls[0][0])).toContain('pg_advisory_xact_lock_shared')
  await expect(ensureStaticSjtRegistryMapping(db as never,{...identity,instrumentVersion:'99.0.0'})).rejects.toThrow('SOURCE_NOT_INSTALLED')
  row.content_digest='f'.repeat(64);await expect(ensureStaticSjtRegistryMapping(db as never,identity)).rejects.toThrow('SOURCE_CHANGED')
 })
 it('uses the real registry/scorer adapter, persists source provenance without inventing an owner, and reuses exact publication',async()=>{
  const result=await publish();expect(result.release).toMatchObject({family:'SJT',layer:'MEASUREMENT',scope:{kind:'PLATFORM'},provenance:{sourceKind:'STATIC_SJT_REGISTRY',mappingId:id,sourceAuthorization:{authorizationId:records[0].authorizationId}}})
  expect(result.release.scope).not.toHaveProperty('ownerId');expect(result.release.content.measurementHash).toMatch(/^[a-f0-9]{64}$/)
  expect((await publish()).release.releaseId).toBe(releaseId);expect(mocks.publish).toHaveBeenCalledTimes(1)
  expect((await start()).release.contentHash).toBe(result.release.contentHash)
  expect(sql(db.$queryRaw.mock.calls.find(([q])=>sql(q).includes('ORDER BY instrument_key'))![0])).toContain('FOR UPDATE')
 })
 it.each(['DRAFT','REVOKED','EXPIRED','SCOPE_MISMATCH'])('rejects ineligible %s license, not trusting self_authored registry text',async status=>{
  records=[authorization({status})];await expect(publish()).rejects.toThrow('SOURCE_LICENSE_DENIED');expect(mocks.publish).not.toHaveBeenCalled()
 })
 it.each([{grantee:'other'},{validTo:'2026-10-19T00:00:00.000Z'},
  {scope:{electronicAdministration:false}},{scope:{scoring:false}},{scope:{display:false}},
  {scope:{territories:['US']}},{scope:{locales:['en']}},{scope:{commercialNature:'UNSPECIFIED'}}])('checks exact deployment and scientific use rights %j',async patch=>{
  const base=authorization();records=[{...base,...patch,scope:{...base.scope,...patch.scope}}]
  await expect(publish()).rejects.toThrow('SOURCE_LICENSE_DENIED');expect(mocks.publish).not.toHaveBeenCalled()
 })
 it('accepts existing approved evidence-pending semantics and refuses commercial use under a noncommercial grant',async()=>{
  records=[authorization({status:'EVIDENCE_PENDING'})];await expect(publish()).resolves.toHaveProperty('release')
  row.measurement_release_id=null;row.deployment=null;row.deployment_hash=null
  await expect(publishStaticSjtMeasurement(db as never,{actorId:'actor',mappingId:id,deployment:{...deployment,commercialNature:'COMMERCIAL'}})).rejects.toThrow('SOURCE_LICENSE_DENIED')
 })
 it('pins source authorization lineage and does not substitute an unrelated license after revocation',async()=>{
  await publish();records=[{...records[0],status:'REVOKED'},authorization()]
  await expect(start()).rejects.toThrow('SOURCE_LICENSE_DENIED')
  await expect(publish()).rejects.toThrow('SOURCE_LICENSE_DENIED')
  await expect(readStaticSjtMeasurementForStart(db as never,identity,'HISTORY')).resolves.toHaveProperty('release')
 })
 it('keeps exact frozen identity across retirement but rejects new publication and revoked releases',async()=>{
  await publish();release.status='RETIRED';await expect(start()).resolves.toHaveProperty('release')
  await expect(publish()).rejects.toThrow('RELEASE_MISMATCH');release.status='REVOKED';await expect(start()).rejects.toThrow('RELEASE_MISMATCH')
 })
 it('rejects forged provenance, content, deployment, source hash and authorization hash',async()=>{
  await publish();release.provenance.mappingId='other';await expect(start()).rejects.toThrow('RELEASE_MISMATCH');release.provenance.mappingId=id
  release.content.measurementHash='e'.repeat(64);await expect(start()).rejects.toThrow('RELEASE_MISMATCH')
  row.deployment_hash='a'.repeat(64);await expect(start()).rejects.toThrow('DEPLOYMENT_INVALID')
  row.deployment_hash=canonicalHash(deployment);row.content_digest='a'.repeat(64);await expect(start()).rejects.toThrow('SOURCE_CHANGED')
  row.content_digest=publicationContentDigest(source.content);db.instrumentAuthorization.findMany.mockResolvedValue([{...dbRecord(records[0]),recordHash:'a'.repeat(64)}])
  row.measurement_release_id=null;await expect(publish()).rejects.toThrow('LICENSE_HASH')
 })
 it('rechecks source license expiry after release lock waits before committing mapping',async()=>{
  mocks.publish.mockImplementation(async(_db,input)=>{now=new Date('2027-01-02T00:00:00Z');return release={...prepareRelease(input),releaseId,status:'PUBLISHED'}})
  await expect(publish()).rejects.toThrow('SOURCE_LICENSE_DENIED')
  expect(db.$executeRaw.mock.calls.some(([q])=>sql(q).includes('UPDATE static_sjt'))).toBe(false)
 })
 it('rejects changed deployment retry and operational hold without modifying mapping',async()=>{
  await publish();await expect(publishStaticSjtMeasurement(db as never,{actorId:'actor',mappingId:id,deployment:{...deployment,territory:'US'}})).rejects.toThrow('DEPLOYMENT_IMMUTABLE')
  const hold={family:'SITUATIONAL' as const,key:identity.instrumentKey,version:identity.instrumentVersion,reasonCode:'test',effectiveAt:now.toISOString()}
  ASSESSMENT_OPERATIONAL_HOLDS.set(operationalIdentityKey(hold),hold);await expect(start()).rejects.toThrow('paused')
 })
 it('validates exact mapping UUID sets and deterministic source locks before row locks',async()=>{
  await expect(validateStaticSjtRegistryMappings(db as never,[id,id])).rejects.toThrow('MAPPING_INVALID')
  await expect(validateStaticSjtRegistryMappings(db as never,['wildcard'])).rejects.toThrow('MAPPING_INVALID')
  await validateStaticSjtRegistryMappings(db as never,[id]);expect(db.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(db.$queryRaw.mock.invocationCallOrder[1])
 })
})

it('final consumer fence rejects elapsed expiry after later report/reference/child waits without recompiling',async()=>{
 await publish();const receipt=await start();mocks.get.mockClear();mocks.publish.mockClear()
 now=new Date('2027-01-02T00:00:00Z')
 await expect(recheckStaticSjtConsumerLicense(db as never,receipt)).rejects.toThrow('SOURCE_LICENSE_DENIED')
 expect(mocks.get).not.toHaveBeenCalled();expect(mocks.publish).not.toHaveBeenCalled()
 await expect(recheckStaticSjtConsumerLicense(db as never,{...receipt})).rejects.toThrow('SOURCE_LICENSE_RECEIPT_INVALID')
 await expect(recheckStaticSjtConsumerLicense({} as never,receipt)).rejects.toThrow('SOURCE_LICENSE_RECEIPT_INVALID')
 const history=await readStaticSjtMeasurementForStart(db as never,identity,'HISTORY')
 await expect(recheckStaticSjtConsumerLicense(db as never,history)).resolves.toBeUndefined()
})
