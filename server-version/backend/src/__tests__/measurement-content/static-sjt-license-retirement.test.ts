import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),publish:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get,publishContentRelease:mocks.publish}))
import {publishStaticSjtMeasurement,readStaticSjtMeasurementForStart,recheckStaticSjtConsumerLicense,staticSjtDeploymentSchema} from '../../modules/situational/static-measurement-release'
import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES} from '../../modules/situational/onboarding/instruments.generated'
import {createSituationalInstrumentRegistry} from '../../modules/situational/onboarding/instrument-registry'
import {publicationContentDigest} from '../../modules/situational/onboarding/schema'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ASSESSMENT_OPERATIONAL_HOLDS,operationalIdentityKey} from '../../modules/assessment-governance/operational-hold'
const source=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES).sources[0],identity=source.content.identity
const id='11111111-1111-4111-8111-111111111111',releaseId='22222222-2222-4222-8222-222222222222'
const deployment={locale:'zh-CN',territory:'CN'}
let row:any,release:any
const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),instrumentAuthorization:{findMany:vi.fn(()=>{throw new Error('License table access forbidden')})}}
const publish=()=>publishStaticSjtMeasurement(db as never,{actorId:'actor',mappingId:id,deployment})
const start=()=>readStaticSjtMeasurementForStart(db as never,identity)
beforeEach(()=>{
 vi.clearAllMocks();ASSESSMENT_OPERATIONAL_HOLDS.clear();release=null
 row={id,instrument_key:identity.instrumentKey,instrument_version:identity.instrumentVersion,content_digest:publicationContentDigest(source.content),measurement_release_id:null,deployment:null,deployment_hash:null}
 db.$queryRaw.mockImplementation(async()=>[row])
 db.$executeRaw.mockImplementation(async q=>{if(q.strings.join(' ').includes('UPDATE static_sjt'))Object.assign(row,{measurement_release_id:releaseId,deployment,deployment_hash:canonicalHash(deployment)});return 1})
 mocks.publish.mockImplementation(async(_db,input)=>release={...prepareRelease(input),releaseId,status:'PUBLISHED',publishedBy:'actor',publishedAt:new Date('2026-10-20')})
 mocks.get.mockImplementation(async()=>release)
})
describe('static SJT copyright gate retirement',()=>{
 it('publishes and starts without reading a license or writing license provenance',async()=>{
  const result=await publish()
  expect(result.release.provenance).not.toHaveProperty('sourceAuthorization')
  expect(result.mapping.deployment).toEqual(deployment)
  expect((await publish()).release).toBe(result.release)
  const receipt=await start();await recheckStaticSjtConsumerLicense(db as never,receipt)
  expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  expect(mocks.publish).toHaveBeenCalledTimes(1)
 })
 it('does not accept new grantee or commercial license fields',()=>{
  expect(staticSjtDeploymentSchema.safeParse({...deployment,grantee:'old',commercialNature:'NON_COMMERCIAL'}).success).toBe(false)
 })
 it('reads and republishes old immutable rows with exact legacy hashes and provenance, without license checks',async()=>{
  await publish()
  row.deployment={...deployment,grantee:'Historical recipient',commercialNature:'NON_COMMERCIAL'}
  row.deployment_hash=canonicalHash(row.deployment)
  release.provenance.sourceAuthorization={authorizationId:id,authorizationVersion:1,recordHash:'a'.repeat(64)}
  const before=JSON.stringify({row,release}),hash=canonicalHash(JSON.parse(JSON.stringify({row,release})))
  expect((await start()).release).toBe(release)
  expect((await readStaticSjtMeasurementForStart(db as never,identity,'HISTORY')).release).toBe(release)
  expect((await publish()).release).toBe(release)
  expect(JSON.stringify({row,release})).toBe(before);expect(canonicalHash(JSON.parse(JSON.stringify({row,release})))).toBe(hash)
  expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
 })
 it('retains source, deployment, release and transaction-bound receipt checks',async()=>{
  await publish();const receipt=await start()
  await expect(recheckStaticSjtConsumerLicense(db as never,{...receipt})).rejects.toThrow('SOURCE_RECEIPT_INVALID')
  await expect(recheckStaticSjtConsumerLicense({} as never,receipt)).rejects.toThrow('SOURCE_RECEIPT_INVALID')
  row.deployment_hash='b'.repeat(64);await expect(start()).rejects.toThrow('DEPLOYMENT_INVALID')
  row.deployment_hash=canonicalHash(deployment);release.provenance.mappingId='other';await expect(start()).rejects.toThrow('RELEASE_MISMATCH')
  release.provenance.mappingId=id;row.content_digest='c'.repeat(64);await expect(start()).rejects.toThrow('SOURCE_CHANGED')
 })
 it('retains operational holds, retirement and revocation guards',async()=>{
  await publish();const receipt=await start()
  const hold={family:'SITUATIONAL' as const,key:identity.instrumentKey,version:identity.instrumentVersion,reasonCode:'test',effectiveAt:new Date().toISOString()}
  ASSESSMENT_OPERATIONAL_HOLDS.set(operationalIdentityKey(hold),hold)
  await expect(recheckStaticSjtConsumerLicense(db as never,receipt)).rejects.toThrow('paused')
  ASSESSMENT_OPERATIONAL_HOLDS.clear();release.status='RETIRED';await expect(start()).resolves.toHaveProperty('release')
  await expect(publish()).rejects.toThrow('RELEASE_MISMATCH');release.status='REVOKED';await expect(start()).rejects.toThrow('RELEASE_MISMATCH')
 })
})
