import {beforeEach,describe,it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({query:vi.fn(),authorize:vi.fn(),grant:vi.fn(),load:vi.fn(),manifest:vi.fn(),ready:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(fn:(tx:unknown)=>unknown)=>fn({$queryRaw:mocks.query})}}))
vi.mock('../../modules/survey/tool-library.service',()=>({authorizeToolOwner:mocks.authorize}))
vi.mock('../../modules/scale-library-governance/usage',()=>({assertLibraryUseGrantCurrent:mocks.grant}))
vi.mock('../../modules/scale-library-governance/service',()=>({loadEntry:mocks.load}))
vi.mock('../../modules/scale-library-governance/media',()=>({assertLibraryMediaManifest:mocks.manifest,assertLibraryMediaReady:mocks.ready}))
import {listSurveyMaterials,materialQuery} from '../../modules/survey/material-library.service'
const item={assetId:'asset',contentHash:'a'.repeat(64),mimeType:'image/png'}
beforeEach(()=>{vi.resetAllMocks();mocks.query.mockResolvedValueOnce([{id:'asset',name:'图片',mimeType:'image/png',size:100,source:'granted',entryId:'entry',boundTitle:'精确量表',updatedAt:new Date()}]).mockResolvedValueOnce([{total:1n}]);mocks.load.mockResolvedValue({submission:{snapshot:{mediaManifest:{items:[item]}}}});mocks.manifest.mockReturnValue({items:[item]})})
describe('Survey material listing preserves exact bound media authority',()=>{
 it('checks current SURVEY use, manifest and readiness before returning preview context',async()=>{
  const result=await listSurveyMaterials('researcher',materialQuery.parse({source:'granted'}))
  expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(),'researcher')
  expect(mocks.grant).toHaveBeenCalledWith(expect.anything(),{entryId:'entry',userId:'researcher',product:'SURVEY'})
  expect(mocks.ready).toHaveBeenCalledWith(expect.anything(),'entry',{items:[item]})
  expect(result.list[0]).toMatchObject({source:'granted',bound:{entryId:'entry',title:'精确量表',item}})
 })
 it('does not return a gallery entry after authority revocation or integrity failure',async()=>{
  mocks.grant.mockRejectedValueOnce(new Error('revoked'))
  await expect(listSurveyMaterials('researcher',materialQuery.parse({}))).rejects.toThrow('revoked')
  expect(mocks.load).not.toHaveBeenCalled()
 })
 it('fails closed when approved media readiness no longer matches',async()=>{
  mocks.ready.mockRejectedValueOnce(new Error('identity mismatch'))
  await expect(listSurveyMaterials('researcher',materialQuery.parse({}))).rejects.toThrow('identity mismatch')
 })
})
