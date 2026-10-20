import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({create:vi.fn()}))
vi.mock('../../middleware/auth',()=>({authenticateSurvey:(req:any,_res:any,next:any)=>{req.user={userId:'owner'};next()}}))
vi.mock('../../modules/survey/report-drafts.service',()=>({createSurveyReportDraft:m.create}))
vi.mock('../../modules/survey/builder.service',()=>({SurveyBuilderError:class extends Error{constructor(readonly statusCode:number,message:string){super(message)}}}))
import {surveyReportDraftsRouter} from '../../modules/survey/report-drafts.routes'
import {ReportTemplateBindingError} from '../../modules/measurement-content/report-template'
const createHandler=(surveyReportDraftsRouter as any).stack.find((layer:any)=>layer.route?.path==='/:pid/report-drafts'&&layer.route.methods.post).route.stack[0].handle
async function invoke(){
 const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockImplementation(()=>res);res.json.mockImplementation(()=>res)
 await createHandler({params:{pid:'11111111-1111-4111-8111-111111111111'},user:{userId:'owner'},body:{}},res,()=>res.status(500))
 return res.status.mock.calls[0][0]
}
beforeEach(()=>vi.resetAllMocks())
describe('report input errors stay distinct from server failures',()=>{
 it.each(['REPORT_TEMPLATE_METRIC_UNKNOWN','REPORT_TEMPLATE_ASSET_UNKNOWN'] as const)('maps %s to controlled 400',async code=>{
  m.create.mockRejectedValue(new ReportTemplateBindingError(code))
  expect(await invoke()).toBe(400)
 })
 it('does not swallow unknown service errors',async()=>{
  m.create.mockRejectedValue(new Error('database unavailable'))
  expect(await invoke()).toBe(500)
 })
})
