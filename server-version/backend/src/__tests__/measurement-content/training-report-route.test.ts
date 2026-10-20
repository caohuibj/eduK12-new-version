import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({create:vi.fn(),publish:vi.fn()}))
vi.mock('../../modules/questionnaire-product/content-report.service',()=>({createTrainingReportDraft:m.create,publishTrainingReportDraft:m.publish}))
import {trainingContentReportsRouter} from '../../modules/questionnaire-product/content-report.routes'
import {ReportTemplateBindingError} from '../../modules/measurement-content/report-template'
import {ContentAuthorityError} from '../../modules/measurement-content/content-authority'
import {ContentReleaseError} from '../../modules/measurement-content/release'
const uid='11111111-1111-4111-8111-111111111111',course='22222222-2222-4222-8222-222222222222',grant='33333333-3333-4333-8333-333333333333'
const handler=(path:string)=>(trainingContentReportsRouter as any).stack.find((layer:any)=>layer.route?.path===path&&layer.route.methods.post).route.stack[0].handle
async function invoke(path='/',query:any={grantId:grant},body:any={payload:'fixture'}){
 const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockImplementation(()=>res);res.json.mockImplementation(()=>res)
 const next=vi.fn(()=>res.status(500))
 await handler(path)({params:{id:uid,courseId:course,draftId:uid},user:{userId:'authenticated-teacher'},query,body},res,next)
 return {res,next}
}
beforeEach(()=>vi.resetAllMocks())
describe('Training report route boundary (handler contracts, not HTTP authorization)',()=>{
 it('uses authenticated actor and exact path/query scope',async()=>{
  m.create.mockResolvedValue({id:uid});const {res}=await invoke()
  expect(m.create).toHaveBeenCalledWith({actorId:'authenticated-teacher',compositeId:uid,courseId:course,grantId:grant},{payload:'fixture'})
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store')
 })
 it('requires explicit grant identity before service',async()=>{
  const {res}=await invoke('/',{});expect(res.status).toHaveBeenCalledWith(400);expect(m.create).not.toHaveBeenCalled()
 })
 it.each(['REPORT_TEMPLATE_METRIC_UNKNOWN','REPORT_TEMPLATE_ASSET_UNKNOWN'] as const)('maps %s to 400',async code=>{
  m.create.mockRejectedValue(new ReportTemplateBindingError(code));expect((await invoke()).res.status).toHaveBeenCalledWith(400)
 })
 it('maps real domain denial and lifecycle conflict but forwards unknown failure',async()=>{
  m.publish.mockRejectedValueOnce(new ContentAuthorityError('CONTENT_AUTHORITY_DENIED'))
  expect((await invoke('/:draftId/publish')).res.status).toHaveBeenCalledWith(403)
  m.publish.mockRejectedValueOnce(new ContentReleaseError('CONTENT_TRAINING_RELEASE_REQUIRED'))
  expect((await invoke('/:draftId/publish')).res.status).toHaveBeenCalledWith(409)
  const failure=new Error('database unavailable');m.publish.mockRejectedValueOnce(failure)
  expect((await invoke('/:draftId/publish')).next).toHaveBeenCalledWith(failure)
 })
})
