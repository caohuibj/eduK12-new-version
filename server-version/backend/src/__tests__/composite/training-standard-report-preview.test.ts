import {beforeEach,describe,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({verify:vi.fn(),preview:vi.fn()}))
vi.mock('../../modules/composite/training-standard-combination',()=>({verifyStoredTrainingStandardItem:m.verify}))
vi.mock('../../modules/measurement-content/standard-combination-content',()=>({standardCombinationContentInputs:m.preview}))
import {previewTrainingStandardReportEligibility} from '../../modules/composite/training-standard-report-preview'
import {AdminPermissionError} from '../../modules/admin-permissions/service'
import {ContentReleaseError} from '../../modules/measurement-content/release'
const item={id:'fixed-item',type:'SCALE',standardCombinationSource:{reference:'exact-approved-configuration'}}
const composite={status:'DRAFT',items:[item]},db={} as any
beforeEach(()=>{vi.clearAllMocks();m.verify.mockResolvedValue({resolved:{row:{id:'approved'},measurement:{releaseId:'measurement'}}});m.preview.mockReturnValue({report:{releaseId:'report',contentHash:'hash'}})})
describe('fixed configuration draft participant report preview',()=>{
 it('uses the verified configured report axis without publishing or changing the stored draft',async()=>{
  const before=JSON.stringify(composite),preview=await previewTrainingStandardReportEligibility(db,composite)
  expect(m.verify).toHaveBeenCalledWith(db,composite,item)
  expect(m.preview).toHaveBeenCalledWith({id:'approved'},{releaseId:'measurement'})
  expect(preview.get(item.id)).toMatchObject({eligible:true,source:'STANDARD_TRIPLET_REPORT'})
  expect(JSON.stringify(composite)).toBe(before)
 })
 it('keeps REPORT=none in data collection mode',async()=>{
  m.preview.mockReturnValue({report:null})
  const preview=await previewTrainingStandardReportEligibility(db,composite)
  expect(preview.get(item.id)?.eligible).toBe(false)
 })
 it.each([new ContentReleaseError('CONTENT_USE_GRANT_REQUIRED'),new AdminPermissionError(403,'revoked')])('does not reuse an old report hint when exact use rights have been revoked: %s',async cause=>{
  m.verify.mockRejectedValue(cause)
  const preview=await previewTrainingStandardReportEligibility(db,{...composite,trainingContentSnapshot:{units:[{itemId:item.id,report:{releaseId:'old',contentHash:'old'}}]}})
  expect(preview.get(item.id)).toMatchObject({eligible:false,reason:expect.stringContaining('授权')});expect(m.preview).not.toHaveBeenCalled()
 })
 it('propagates operational failures instead of treating unavailable storage as eligibility',async()=>{
  m.verify.mockRejectedValue(new Error('database unavailable'))
  await expect(previewTrainingStandardReportEligibility(db,composite)).rejects.toThrow('database unavailable')
 })
})
