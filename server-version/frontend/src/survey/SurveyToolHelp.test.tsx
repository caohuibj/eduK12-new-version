import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyToolTemplateEditor} from './SurveyToolTemplateEditor'
const definition={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'不同意',score:1},{optionKey:'b',label:'同意',score:2}],dimensions:[{dimensionKey:'effort_key',label:'学习投入',direction:'descriptive'}],items:[{itemKey:'q1',prompt:'原题',reverse:false,required:true,dimensionKeys:['effort_key']}]}
const tool={id:'scale-help',kind:'SCALE',title:'测试量表',status:'DRAFT',revision:1,definition}
let published=false
const metadata={title:'测试量表',author:'合成作者',copyright:'原创可共享',applicability:'合成测试',scoringDescription:'均分',reportDescription:'描述性反馈'}
const release={releaseId:'release-1',title:'测试量表',version:'1',contentHash:'a'.repeat(64),eligible:true,defaults:metadata,supportedEntrypoints:['SURVEY'],mediaManifest:{schemaVersion:1,items:[],manifestHash:'b'.repeat(64),releaseIds:['release-1']}}
const reply=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
beforeEach(()=>{published=false;vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
 if(url.includes('/scale-library-governance/sources/'))return reply({sourceId:tool.id,releases:published?[release]:[],defaults:metadata})
 if(url.includes('/scale-library-governance/submissions'))return init?.method==='POST'?reply({id:'submission',status:'SUBMITTED'}):reply({list:[]})
 if(url.endsWith('/measurement-release')){published=true;return reply({releaseId:release.releaseId,revision:1})}
 if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
 if(url.endsWith('/bulk-import/preview'))return reply({ok:true,count:1,revision:1,digest:'preview-digest',issues:[]})
 if(url.endsWith('/bulk-import/apply'))return reply({...tool,revision:2,definition:{...definition,items:[...definition.items,{...definition.items[0],itemKey:'q2',prompt:'导入题'}]}})
 if(url.endsWith('/archive')&&init?.method==='POST')return reply({})
 return reply(tool)
}))})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('Survey tool import and management guidance',()=>{
 it('explains scale CSV and dimension keys, and keeps preview separate from the confirmed write',async()=>{
  render(<SurveyToolTemplateEditor id={tool.id} onReturn={()=>{}}/>);await screen.findByRole('heading',{name:tool.title})
  fireEvent.click(screen.getByText('批量录入题目'))
  expect(screen.getByText(/简单题干可到“题目”分区/)).toBeVisible()
  expect(screen.getByText(/导入会追加题目，不覆盖已有内容/)).toBeVisible()
  expect(within(screen.getByLabelText('输入格式')).getAllByRole('option').map(x=>x.textContent)).toEqual(['CSV'])
  fireEvent.click(screen.getByText('完整 CSV 导入模板与填写说明'));fireEvent.click(screen.getByText('字段与版本细节'))
  expect(within(screen.getByLabelText('CSV 可用维度编码')).getByText('effort_key')).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'将完整模板填入导入框'}))
  fireEvent.click(screen.getByRole('button',{name:'解析并预览'}));await screen.findByText('候选题数：1')
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/bulk-import/apply'))).toBe(false)
  const preview=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/bulk-import/preview'))!
  expect(JSON.parse(String(preview[1]?.body))).toMatchObject({format:'CSV'})
  fireEvent.click(screen.getByRole('button',{name:'确认导入'}));await screen.findByText('题目已整批导入。')
  const apply=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/bulk-import/apply'))!
  expect(JSON.parse(String(apply[1]?.body))).toMatchObject({revision:1,digest:'preview-digest',batch:{format:'CSV'}})
  expect(screen.getByLabelText('待导入内容')).toHaveValue('')
 })
 it('offers two operations, publishes the saved exact revision and submits through existing governance',async()=>{
  render(<SurveyToolTemplateEditor id={tool.id} onReturn={()=>{}}/>);await screen.findByRole('heading',{name:tool.title})
  fireEvent.click(screen.getByText('其他操作'))
  const operations=screen.getByLabelText('工具管理操作')
  expect(within(operations).getAllByRole('button').map(x=>x.textContent)).toEqual(['申请入库','归档工具'])
  expect(screen.queryByText('当前暂无恢复入口。')).toBeNull()
  fireEvent.click(within(operations).getByRole('button',{name:'申请入库'}))
  await screen.findByText('尚无已发布版本，请先在上方发布测量版本。')
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/measurement-release'))).toBe(false)
  fireEvent.click(screen.getByRole('button',{name:'发布当前修订供申请'}))
  await waitFor(()=>expect(screen.getByLabelText('申请的测量发布版本')).toHaveValue('release-1'))
  const publish=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/measurement-release'))!
  expect(JSON.parse(String(publish[1]?.body))).toEqual({revision:1})
  fireEvent.click(screen.getByRole('button',{name:'提交此版本的入库申请'}))
  await screen.findByText(/申请已提交/)
  const submission=vi.mocked(fetch).mock.calls.find(([url,init])=>String(url).endsWith('/scale-library-governance/submissions')&&init?.method==='POST')!
  expect(JSON.parse(String(submission[1]?.body))).toMatchObject({releaseId:'release-1',metadata})
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/projects/'))).toBe(false)
 })
 it('requires saved content before publishing and clearly keeps form review unavailable',async()=>{
  render(<SurveyToolTemplateEditor id={tool.id} onReturn={()=>{}}/>);await screen.findByRole('heading',{name:tool.title})
  fireEvent.click(screen.getByLabelText('编辑名称'));fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'未保存'}})
  fireEvent.click(screen.getByText('其他操作'));fireEvent.click(screen.getByRole('button',{name:'申请入库'}))
  expect(screen.getByRole('button',{name:'发布当前修订供申请'})).toBeDisabled()
 })
 it('explains archive effects and requires an explicit confirmation before the existing archive request',async()=>{
  const onReturn=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
  render(<SurveyToolTemplateEditor id={tool.id} onReturn={onReturn}/>);await screen.findByRole('heading',{name:tool.title});fireEvent.click(screen.getByText('其他操作'));fireEvent.click(screen.getByRole('button',{name:'归档工具'}))
  expect(within(screen.getByRole('region',{name:'归档说明'})).getByText(/当前暂无恢复入口/)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'确认归档'}));expect(confirm).toHaveBeenCalledWith(expect.stringContaining('当前暂无恢复入口'))
  expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith('/archive'))).toBe(false)
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'确认归档'}))
  await waitFor(()=>expect(onReturn).toHaveBeenCalledOnce())
  const archive=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/archive'))!
  expect(JSON.parse(String(archive[1]?.body))).toEqual({revision:1})
 })
})
