import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({authority:vi.fn(),store:vi.fn(),attach:vi.fn(),lock:vi.fn(),ready:vi.fn(),query:vi.fn(),tool:vi.fn(),assets:vi.fn(),transaction:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
vi.mock('../../modules/education-tools/access',()=>({resolveEducationToolAuthoringContext:mocks.authority}))
vi.mock('../../services/assetStorage',()=>({storeAsset:mocks.store,attachAssetReferences:mocks.attach,lockStoredAssetRows:mocks.lock,syncAssetReferences:vi.fn()}))
vi.mock('../../modules/assessment-media/assessment-asset',()=>({assertAssessmentAssetReferencesReady:mocks.ready,retainAssessmentAssetReferences:vi.fn()}))
import {uploadPrivateToolImage,privateToolMediaScope,privateToolMediaLibrary} from '../../modules/education-tools/private-tool.media'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'
const c:PrivateToolContext={principal:{userId:'00000000-0000-4000-8000-000000000001',accountDomain:'SCHOOL'},entry:'TEACHER',organizationId:'00000000-0000-4000-8000-000000000002'}
const tool='00000000-0000-4000-8000-000000000003',asset='00000000-0000-4000-8000-000000000004'
const row={id:asset,sha256:'a'.repeat(64),mimeType:'image/png'}
const file={buffer:Buffer.from('synthetic already validated bytes'),originalname:'synthetic.png',detectedMimeType:'image/png'}
const tx={$queryRaw:mocks.query,educationPrivateTool:{findFirst:mocks.tool},storedAsset:{findMany:mocks.assets}}
describe('Education image upload staged finalization (mocked storage only)',()=>{
 beforeEach(()=>{
  vi.clearAllMocks()
  mocks.transaction.mockImplementation(async(run:(db:typeof tx)=>Promise<unknown>)=>run(tx))
  mocks.authority.mockResolvedValue({ownerUserId:c.principal.userId})
  mocks.tool.mockResolvedValue({id:tool})
  mocks.store.mockResolvedValue(row)
  mocks.assets.mockResolvedValue([row])
  mocks.query.mockResolvedValue([])
  mocks.ready.mockResolvedValue(undefined)
  mocks.attach.mockResolvedValue(undefined)
 })
 it('stores privately without a usable reference, then registers only after reauthorization',async()=>{
  expect(await uploadPrivateToolImage(c,tool,file)).toEqual({assetId:asset,contentHash:row.sha256,mimeType:'image/png'})
  expect(mocks.store).toHaveBeenCalledWith({buffer:file.buffer,originalName:file.originalname,mimeType:'image/png',ownerId:c.principal.userId,accessScope:'PRIVATE',scopeId:privateToolMediaScope(c,tool)})
  expect(mocks.authority).toHaveBeenCalledTimes(2)
  expect(mocks.store.mock.invocationCallOrder[0]).toBeLessThan(mocks.authority.mock.invocationCallOrder[1])
  expect(mocks.authority.mock.invocationCallOrder[1]).toBeLessThan(mocks.attach.mock.invocationCallOrder[0])
  expect(mocks.attach).toHaveBeenCalledWith([{assetId:asset,...privateToolMediaLibrary(tool)}],tx)
 })
 it('rejects a revoke during storage and does not pin or retry the external write',async()=>{
  mocks.authority.mockResolvedValueOnce({ownerUserId:c.principal.userId}).mockResolvedValueOnce(null)
  await expect(uploadPrivateToolImage(c,tool,file)).rejects.toThrow('AUTHOR_REQUIRED')
  expect(mocks.store).toHaveBeenCalledTimes(1)
  expect(mocks.attach).not.toHaveBeenCalled()
 })
 it('rejects invalid byte limits/type before storing and rejects storage failure without a registration',async()=>{
  for(const patch of [{buffer:Buffer.alloc(0)},{buffer:Buffer.alloc(2*1024*1024+1)},{detectedMimeType:'image/gif'}])
   await expect(uploadPrivateToolImage(c,tool,{...file,...patch})).rejects.toThrow('IMAGE_INVALID')
  expect(mocks.store).not.toHaveBeenCalled()
  mocks.store.mockRejectedValueOnce(new Error('storage unavailable'))
  await expect(uploadPrivateToolImage(c,tool,file)).rejects.toThrow('storage unavailable')
  expect(mocks.attach).not.toHaveBeenCalled()
 })
})
