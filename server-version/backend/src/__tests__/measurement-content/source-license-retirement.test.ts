import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({resolve:vi.fn()}))
vi.mock('../../modules/scale/deployment/service',()=>({resolveScaleStartDeployment:mocks.resolve}))
import {readManagedScaleSourceIdentity} from '../../modules/scale/measurement-source'
import {catalogAdapterForRecheck,recheckCatalogScaleSourceExpiry,type CatalogSourceSnapshot} from '../../modules/survey/catalog.sources'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const identity={basis:'DEPLOYMENT_IDENTITY',runtimePolicyHash:'a'.repeat(64),deploymentPolicyHash:'b'.repeat(64),deploymentRevision:2}
const scale={id:'scale',code:'tool',instrumentVersion:'1',status:'PUBLISHED'}
const db={$queryRaw:vi.fn(async()=>[{now:new Date('2100-01-01')}]),scale:{findFirst:vi.fn(async()=>scale)},instrumentAuthorization:{findMany:vi.fn(()=>{throw new Error('License table access forbidden')})}}
const snapshot=()=>({ref:{kind:'SCALE',sourceId:'scale',sourceVersion:'1'},title:'Source',displayDefinition:{},compiledDefinition:{},definitionDigest:'d',scoringDigest:'e',adapterVersion:'survey-catalog-scale-v2',provenance:{code:'tool',instrumentClass:'STANDARD',sourceDeploymentIdentity:identity}} as CatalogSourceSnapshot)
beforeEach(()=>{vi.clearAllMocks();mocks.resolve.mockResolvedValue({kind:'MANAGED_V2',allowNewStarts:true,runtimePolicy:{runtimePolicyHash:identity.runtimePolicyHash},deployment:{policyHash:identity.deploymentPolicyHash,revision:2}})})
describe('source identity without copyright receipts',()=>{
 it('returns only deployment identity and refuses failed deployment admission',async()=>{
  expect(await readManagedScaleSourceIdentity(db as never,scale as never,new Date())).toEqual(identity)
  expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  mocks.resolve.mockResolvedValue({kind:'MANAGED_V2',allowNewStarts:false})
  await expect(readManagedScaleSourceIdentity(db as never,scale as never,new Date())).rejects.toThrow('MANAGED_SOURCE_DEPLOYMENT_REQUIRED')
 })
 it('retires the late expiry recheck without any identity SQL or iterable traversal',async()=>{
  const current=snapshot();await recheckCatalogScaleSourceExpiry(db as never,[current])
  const legacy=snapshot();delete legacy.provenance.sourceDeploymentIdentity
  legacy.provenance.sourceRights={...identity,basis:'SELF_AUTHORED_SOURCE',sourceHash:'historical',authorization:{authorizationId:'old'},validFrom:'2000-01-01',validTo:'2001-01-01'}
  const hash=canonicalHash(legacy)
  await recheckCatalogScaleSourceExpiry(db as never,[legacy])
  expect(canonicalHash(legacy)).toBe(hash);expect(db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
  current.provenance.sourceDeploymentIdentity={...identity,deploymentRevision:3}
  await expect(recheckCatalogScaleSourceExpiry(db as never,[current])).resolves.toBeUndefined()
  const unreadable={ [Symbol.iterator](){throw new Error('late snapshots must not be traversed')} }
  await expect(recheckCatalogScaleSourceExpiry(db as never,unreadable as any)).resolves.toBeUndefined()
  expect(mocks.resolve).not.toHaveBeenCalled();expect(db.scale.findFirst).not.toHaveBeenCalled();expect(db.$queryRaw).not.toHaveBeenCalled()
 })
 it('compares historical Survey receipt bytes without rewriting stored hashes; identity changes still fail',()=>{
  const current=snapshot(),stored=snapshot();delete stored.provenance.sourceDeploymentIdentity
  stored.provenance.sourceRights={...identity,authorizationStateHash:'historical',validTo:'2001-01-01'}
  const hash=canonicalHash(stored)
  expect(canonicalHash(catalogAdapterForRecheck(current,stored))).toBe(hash)
  expect(canonicalHash(stored)).toBe(hash);expect(current.provenance).not.toHaveProperty('sourceRights')
  current.provenance.sourceDeploymentIdentity={...identity,runtimePolicyHash:'changed'}
  expect(()=>catalogAdapterForRecheck(current,stored)).toThrow('SOURCE_SNAPSHOT_CHANGED')
 })
})
