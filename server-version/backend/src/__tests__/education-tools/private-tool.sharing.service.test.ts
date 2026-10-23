import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({transaction:vi.fn(),actor:vi.fn(),authorize:vi.fn(),identity:vi.fn(),input:vi.fn(),publish:vi.fn(),source:vi.fn(),submit:vi.fn(),manifest:vi.fn(),guard:vi.fn(),event:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/scale-library-governance/authority',()=>({libraryActor:m.actor}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize,privateToolScope:(c:any)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})}))
vi.mock('../../modules/education-tools/private-tool.runtime-source',()=>({readPrivateScaleVersionIdentity:m.identity,privateScaleMeasurementInput:m.input}))
vi.mock('../../modules/measurement-content/repository',()=>({publishContentRelease:m.publish}))
vi.mock('../../modules/scale-library-governance/source',()=>({submissionSource:m.source}))
vi.mock('../../modules/scale-library-governance/service',()=>({submitInTransaction:m.submit,sourceMetadataDefaults:()=>({title:'Synthetic'}),submissionView:(row:any)=>row,event:m.event}))
vi.mock('../../modules/scale-library-governance/media',()=>({buildLibraryMediaManifest:m.manifest,assertLibraryMediaManifest:(value:any)=>value}))
vi.mock('../../modules/scale-library-governance/catalog-adapter',()=>({libraryCompatibility:()=>({supportedEntrypoints:[]})}))
vi.mock('../../modules/scale-library-governance/collection-guard',()=>({assertScaleLibraryCollectionAllowed:m.guard}))
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {preparePrivateScaleSharing,submitPrivateScaleSharing,withdrawPrivateScaleSharing,readPrivateScaleSharingMedia,sharingSubmissionInput} from '../../modules/education-tools/private-tool.sharing.service'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
const owner=randomUUID(),toolId=randomUUID(),versionId=randomUUID(),organizationId=randomUUID(),releaseId=randomUUID(),requestId=randomUUID()
const context:PrivateToolContext={principal:{userId:owner,accountDomain:'SCHOOL'},entry:'SCHOOL',organizationId}
const contentHash='a'.repeat(64),version={id:versionId,toolId,organizationId,ownerUserId:owner,entry:'SCHOOL',kind:'SCALE',contentHash,sourceRevision:2,title:'Synthetic'}
const snapshot={educationSource:{toolId,versionId,organizationId,entry:'SCHOOL',contentHash}}
const metadata={title:'Synthetic',author:'Author',copyright:'Self authored',applicability:'Synthetic use',scoringDescription:'Sum',reportDescription:'Descriptive'}
let tx:any
beforeEach(()=>{
 vi.clearAllMocks()
 tx={$queryRaw:vi.fn(),$executeRaw:vi.fn(),educationPrivateTool:{findFirst:vi.fn().mockResolvedValue({id:toolId})},educationPrivateToolVersion:{findFirst:vi.fn().mockResolvedValue(version)}}
 m.transaction.mockImplementation(async(fn:any)=>fn(tx));m.actor.mockResolvedValue({account_domain:'SCHOOL'});m.authorize.mockResolvedValue(undefined)
 m.identity.mockResolvedValue({version,definition:{fixed:true}});m.input.mockReturnValue({exact:true})
 m.publish.mockResolvedValue({releaseId,status:'PUBLISHED',version:'1.0.0',contentHash:'b'.repeat(64),publishedAt:new Date()})
 m.source.mockResolvedValue({sourceId:toolId,snapshot,release:{releaseId}})
 m.manifest.mockResolvedValue({manifestHash:'c'.repeat(64),items:[],releaseIds:[releaseId]});m.guard.mockResolvedValue(undefined)
 m.submit.mockResolvedValue({id:requestId,status:'SUBMITTED'})
})
describe('Scoped private SCALE sharing transaction boundary',()=>{
 it('prepares an unadministered version with only its original private release input',async()=>{
  const result=await preparePrivateScaleSharing(context,toolId,versionId,{contentHash})
  expect(result).toMatchObject({sourceId:toolId,versionId,privateContentHash:contentHash,releaseId,canRequestLibraryShare:true,canShare:false,canPublish:false})
  expect(m.input).toHaveBeenCalledWith(version,{fixed:true})
  expect(m.publish).toHaveBeenCalledWith(tx,{exact:true},owner)
  expect(m.actor).toHaveBeenCalledWith(tx,owner)
  expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.authorize.mock.invocationCallOrder[0])
  expect(m.authorize).toHaveBeenCalledWith(tx,context,true)
  expect(m.transaction).toHaveBeenCalledTimes(1)
  expect(m.submit).not.toHaveBeenCalled()
  // This transaction has no scale/composite/run creation API at all.
  expect(Object.keys(tx)).not.toContain('scale')
 })
 it('does not revive a retired or revoked exact release',async()=>{
  for(const status of ['RETIRED','REVOKED']){
   m.publish.mockResolvedValue({releaseId,status})
   await expect(preparePrivateScaleSharing(context,toolId,versionId,{contentHash})).rejects.toThrow('EDUCATION_LIBRARY_SOURCE_NOT_AVAILABLE')
  }
  expect(m.source).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled()
 })
 it('runs current-author, scoped source and shared submission core in the same transaction',async()=>{
  const raw={contentHash,releaseId,requestId,metadata,dependencyReleaseIds:[]}
  expect(await submitPrivateScaleSharing(context,toolId,versionId,raw)).toMatchObject({id:requestId,status:'SUBMITTED',versionId,privateContentHash:contentHash})
  expect(m.transaction).toHaveBeenCalledTimes(1)
  expect(m.actor).toHaveBeenCalledWith(tx,owner)
  expect(m.actor.mock.invocationCallOrder[0]).toBeLessThan(m.authorize.mock.invocationCallOrder[0])
  expect(m.authorize).toHaveBeenCalledWith(tx,context,true)
  expect(m.source).toHaveBeenCalledWith(tx,owner,'SCHOOL',releaseId)
  expect(m.submit).toHaveBeenCalledWith(tx,owner,'SCHOOL',{releaseId,requestId,metadata,dependencyReleaseIds:[]})
  expect(m.publish).not.toHaveBeenCalled()
 })
 it('rejects missing scoped SCALE, stale content and revoked author before publishing/submitting',async()=>{
  tx.educationPrivateToolVersion.findFirst.mockResolvedValue(null)
  await expect(preparePrivateScaleSharing(context,toolId,versionId,{contentHash})).rejects.toMatchObject({code:'PRIVATE_TOOL_VERSION_NOT_FOUND'})
  tx.educationPrivateToolVersion.findFirst.mockResolvedValue({...version,contentHash:'d'.repeat(64)})
  await expect(submitPrivateScaleSharing(context,toolId,versionId,{contentHash,releaseId,requestId,metadata})).rejects.toMatchObject({code:'PRIVATE_TOOL_VERSION_NOT_FOUND'})
  m.authorize.mockRejectedValue(new Error('revoked'))
  await expect(preparePrivateScaleSharing(context,toolId,versionId,{contentHash})).rejects.toThrow('revoked')
  expect(m.publish).not.toHaveBeenCalled();expect(m.submit).not.toHaveBeenCalled()
 })
 it('cannot substitute another tool, organization or version release',async()=>{
  for(const patch of [{toolId:randomUUID()},{versionId:randomUUID()},{organizationId:randomUUID()},{contentHash:'d'.repeat(64)}]){
   m.source.mockResolvedValue({sourceId:patch.toolId??toolId,snapshot:{educationSource:{...snapshot.educationSource,...patch}}})
   await expect(submitPrivateScaleSharing(context,toolId,versionId,{contentHash,releaseId,requestId,metadata})).rejects.toThrow('EDUCATION_LIBRARY_SOURCE_IDENTITY_MISMATCH')
  }
  expect(m.submit).not.toHaveBeenCalled()
 })
 it('rejects dependency injection into the bounded education submission',()=>{
  expect(sharingSubmissionInput.safeParse({contentHash,releaseId,requestId,metadata,dependencyReleaseIds:[randomUUID()]}).success).toBe(false)
 })
 it('does not permit an author to withdraw an already approved application',async()=>{
  tx.$queryRaw.mockResolvedValue([{id:requestId,snapshot,snapshot_hash:canonicalHash(snapshot),status:'APPROVED',version:1}])
  await expect(withdrawPrivateScaleSharing(context,toolId,requestId,{expectedVersion:1,reason:'Changed mind'})).rejects.toThrow('申请已处理或版本已变化')
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1);expect(m.event).not.toHaveBeenCalled()
 })
 it('source media lookup does not publish a release or expose arbitrary assets',async()=>{
  await readPrivateScaleSharingMedia(context,toolId,versionId,releaseId)
  expect(m.publish).not.toHaveBeenCalled();expect(m.manifest).toHaveBeenCalledWith(tx,owner,snapshot,{releaseId})
  m.source.mockResolvedValue({sourceId:toolId,snapshot:{educationSource:{...snapshot.educationSource,organizationId:randomUUID()}}})
  await expect(readPrivateScaleSharingMedia(context,toolId,versionId,releaseId)).rejects.toThrow('EDUCATION_LIBRARY_SOURCE_IDENTITY_MISMATCH')
 })
})
