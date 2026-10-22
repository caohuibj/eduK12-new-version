import {useState} from 'react'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyCompositionEditor} from './SurveyCompositionEditor'
import {SurveyToolTemplateEditor} from './SurveyToolTemplateEditor'
import type {ToolRef} from './tool-library-api'

const scale={id:'scale-a',title:'学习投入量表',kind:'SCALE',revision:3,status:'DRAFT'}
const form={id:'form-a',title:'学习背景表单',kind:'FORM',revision:5,status:'DRAFT'}
const cognitive={id:'grant-c',title:'注意力任务',kind:'COGNITIVE',status:'ACTIVE',sourceRef:{kind:'COGNITIVE',sourceId:'original-c',sourceVersion:'2'}}
const sjt={id:'grant-s',title:'课堂情境判断',kind:'SJT',status:'ACTIVE',sourceRef:{kind:'SJT',sourceId:'original-s',sourceVersion:'4'}}
const reply=(data:unknown)=>Promise.resolve({ok:true,json:async()=>({code:0,data})} as Response)
function Host({seed=[],disabled=false}:{seed?:ToolRef[];disabled?:boolean}){const [items,onChange]=useState(seed);return <><fieldset disabled={disabled}><SurveyCompositionEditor items={items} onChange={onChange}/></fieldset><output data-testid="items">{JSON.stringify(items)}</output></>}
const items=()=>JSON.parse(screen.getByTestId('items').textContent!) as ToolRef[]
beforeEach(()=>vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('/catalog?')?reply({list:[cognitive,sjt]}):reply({list:[scale,form,{...form,id:'nested',kind:'COMPOSITION'}],total:3}))))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('Survey composition content and order',()=>{
 it('keeps source/revision identity through adding, duplicate prevention, sorting and removal',async()=>{
  render(<Host/>);fireEvent.click(await screen.findByRole('button',{name:'添加到问卷：学习投入量表'}))
  expect(items()).toEqual([{source:'owned',id:scale.id,title:scale.title,revision:3}])
  expect(screen.getByRole('button',{name:'已添加：学习投入量表'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'表单'}));fireEvent.click(await screen.findByRole('button',{name:'添加到问卷：学习背景表单'}))
  fireEvent.click(screen.getByRole('button',{name:'上移工具 2'}));expect(items().map(item=>item.id)).toEqual([form.id,scale.id])
  expect(items()[0].revision).toBe(5)
  fireEvent.click(screen.getByRole('button',{name:'移除工具 1'}));expect(items().map(item=>item.id)).toEqual([scale.id])
  expect(screen.queryByText('nested')).toBeNull()
 })
 it('automatically uses granted fixed versions for cognitive and SJT without adding revision fields',async()=>{
  render(<Host/>);fireEvent.click(screen.getByRole('button',{name:'认知测验'}))
  expect(screen.getByRole('button',{name:'我编制的'})).toBeDisabled()
  fireEvent.click(await screen.findByRole('button',{name:'添加到问卷：注意力任务'}))
  expect(items()[0]).toEqual({source:'granted',id:cognitive.id,title:cognitive.title})
  fireEvent.click(screen.getByRole('button',{name:'情境判断'}));fireEvent.click(await screen.findByRole('button',{name:'添加到问卷：课堂情境判断'}))
  expect(items()[1]).toEqual({source:'granted',id:sjt.id,title:sjt.title})
  expect(screen.queryByRole('button',{name:/添加到问卷：学习背景/})).toBeNull()
 })
 it('keeps grant pagination available when a full raw page has no tools of the selected type',async()=>{
  vi.mocked(fetch).mockImplementation((url)=>String(url).includes('/catalog?')?reply({list:String(url).endsWith('page=1')?Array.from({length:25},(_,i)=>({...form,id:'g'+i,sourceRef:{sourceVersion:1}})):[cognitive]}):reply({list:[],total:0}))
  render(<Host/>);fireEvent.click(screen.getByRole('button',{name:'认知测验'}))
  expect(await screen.findByRole('heading',{name:'暂无可选认知测验'})).toBeVisible()
  expect(screen.getByRole('button',{name:'下一页'})).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'下一页'}))
  expect(await screen.findByRole('button',{name:'添加到问卷：注意力任务'})).toBeEnabled()
  expect(screen.getByText(/第 2 页/)).toBeVisible()
 })
 it('searches owned tools on the server and resets pagination to page one',async()=>{
  vi.mocked(fetch).mockImplementation(()=>reply({list:[scale],total:13}))
  render(<Host/>);await screen.findByRole('button',{name:'添加到问卷：学习投入量表'})
  fireEvent.click(screen.getByRole('button',{name:'下一页'}));await waitFor(()=>expect(vi.mocked(fetch).mock.lastCall?.[0]).toContain('page=2'))
  fireEvent.change(screen.getByLabelText('搜索自建工具'),{target:{value:'投入'}});fireEvent.submit(screen.getByRole('search'))
  await waitFor(()=>expect(vi.mocked(fetch).mock.lastCall?.[0]).toContain('page=1&kind=SCALE&query='+encodeURIComponent('投入')))
 })
 it('ignores stale owned-list responses after switching source and retains selected tools on a read failure',async()=>{
  let resolveOwned!:(response:Response)=>void
  const owned=new Promise<Response>(resolve=>{resolveOwned=resolve})
  vi.mocked(fetch).mockImplementation((url)=>String(url).includes('/catalog?')?reply({list:[cognitive]}):owned)
  render(<Host seed={[{source:'owned',id:form.id,title:form.title,revision:5}]}/>);fireEvent.click(screen.getByRole('button',{name:'认知测验'}))
  await screen.findByRole('button',{name:'添加到问卷：注意力任务'})
  await act(async()=>resolveOwned(await reply({list:[scale],total:1})))
  expect(screen.getByRole('button',{name:'添加到问卷：注意力任务'})).toBeEnabled()
  vi.mocked(fetch).mockRejectedValueOnce(new Error('目录暂时不可用'));fireEvent.click(screen.getByRole('button',{name:'重新读取'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('目录暂时不可用')
  expect(items()).toHaveLength(1);expect(within(screen.getByRole('complementary',{name:'作答顺序'})).getByText(form.title)).toBeVisible()
  fireEvent.click(screen.getByRole('button',{name:'重新读取工具'}));expect(await screen.findByRole('button',{name:'添加到问卷：注意力任务'})).toBeEnabled()
 })
 it('enforces the twenty-tool limit and respects the parent read-only fieldset',async()=>{
  const seed=Array.from({length:20},(_,i)=>({source:'owned' as const,id:'item-'+i,title:'工具 '+i,revision:1}))
  const {unmount}=render(<Host seed={seed}/>);expect(await screen.findByRole('button',{name:'添加到问卷：学习投入量表'})).toBeDisabled()
  expect(screen.getByText('已达到 20 项上限，移除一项后可继续添加。')).toHaveAttribute('role','status')
  fireEvent.click(screen.getByRole('button',{name:'移除工具 1'}));expect(screen.getByRole('button',{name:'添加到问卷：学习投入量表'})).toBeEnabled()
  unmount();render(<Host disabled seed={seed.slice(0,1)}/>);expect(await screen.findByRole('button',{name:'添加到问卷：学习投入量表'})).toBeDisabled()
  expect(screen.getByRole('button',{name:'移除工具 1'})).toBeDisabled()
 })
 it('saves exact composition references through the existing API, keeps failed edits, and closes explicit renaming after success',async()=>{
  let fail=true
  const definition={schemaVersion:1,items:[]}
  vi.mocked(fetch).mockImplementation((url,init)=>{
    if(String(url).endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-test'})
    if(String(url).endsWith('/tool-library/composition')&&init?.method==='PATCH'){
      if(fail)return Promise.reject(new Error('所选工具已更新，请重新选择当前修订'))
      return reply({id:'composition',kind:'COMPOSITION',status:'DRAFT',...JSON.parse(String(init.body)),revision:2})
    }
    if(String(url).endsWith('/validate'))return reply({ok:true,issues:[],unitCount:1})
    if(String(url).endsWith('/tool-library/composition'))return reply({id:'composition',title:'新生问卷',kind:'COMPOSITION',status:'DRAFT',revision:1,definition})
    return reply({list:[scale],total:1})
  })
  render(<SurveyToolTemplateEditor id="composition" onReturn={()=>{}}/>);await screen.findByRole('heading',{name:'新生问卷'})
  expect(screen.getByLabelText('工具名称')).not.toBeVisible()
  fireEvent.click(await screen.findByRole('button',{name:'添加到问卷：学习投入量表'}));expect(screen.getByRole('button',{name:'检查组合'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'保存组合问卷'}));expect(await screen.findByRole('alert')).toHaveTextContent('所选工具已更新')
  expect(within(screen.getByRole('complementary',{name:'作答顺序'})).getByText(scale.title)).toBeVisible()
  fail=false;fireEvent.click(screen.getByRole('button',{name:'编辑名称'}));fireEvent.change(screen.getByLabelText('工具名称'),{target:{value:'课堂学习问卷'}})
  fireEvent.click(screen.getByRole('button',{name:'保存组合信息'}));await waitFor(()=>expect(screen.getByLabelText('工具名称')).not.toBeVisible())
  const writes=vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==='PATCH')
  expect(JSON.parse(String(writes[1][1]?.body))).toEqual({revision:1,title:'课堂学习问卷',definition:{schemaVersion:1,items:[{source:'owned',id:scale.id,title:scale.title,revision:3}]}})
  fireEvent.click(screen.getByRole('button',{name:'检查组合'}));expect(await screen.findByText('组合结构通过，共 1 个工具。')).toBeVisible()
 })
})
