import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
import type {FlowDraft} from './flow.client'
// Exercise the real parent state and package callbacks; only the unrelated
// Flow authoring widget is replaced by one valid controlled change.
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:({onChange,tools,selectedIds}:{onChange:(flow:FlowDraft)=>void;tools:{id:string;instrumentKey:string}[];selectedIds:string[]})=><button type="button" onClick={()=>onChange({schemaVersion:1,embeddedData:[],blocks:selectedIds.map((id,i)=>({blockKey:'b'+i,kind:'INSTRUMENT',instrumentKey:tools.find(t=>t.id===id)!.instrumentKey})),experiment:{experimentKey:'useredit',linkedPolicy:'RERANDOMIZE',groups:[{groupKey:'group',weight:1,materialTitle:'Synthetic',materialBody:'Synthetic'}]}})}>修改合成流程</button>}))
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})} as Response)
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('retries only the failed read after import/selection and preserves subsequent order, Flow and quota edits',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true)
 let imported=false,refreshFailed=false,saved:any
 const tools=['a','b'].map(id=>({id,projectId:'p',kind:'FORM',title:'Fixed '+id,instrumentKey:'tool_'+id,status:'DRAFT',revision:1,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[]}]}}))
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input)
  if(path.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
  if(path==='/api/survey/projects/p')return reply({id:'p',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1})
  if(path.includes('/waves?page='))return reply({list:[]})
  if(path.includes('/instruments?page=')){
   if(imported&&!refreshFailed){refreshFailed=true;throw Error('synthetic refresh failure')}
   return reply({list:imported?tools:[]})
  }
  if(path.includes('/package-grants?'))return reply({list:[{id:'grant',title:'Package',hash:'a'.repeat(64),family:'BUNDLE',status:'ACTIVE',expiresAt:null,versions:{content:'c1',parameters:null,report:'r1'}}],hasMore:false})
  if(path.endsWith('/package-grants/grant/import')){imported=true;return reply({bindings:tools.map(t=>({draftId:t.id,slotKey:t.id,instrumentKey:t.instrumentKey}))})}
  if(path.endsWith('/waves')&&init?.method==='POST'){saved=JSON.parse(String(init.body));return reply({...saved,id:'w',projectId:'p',ordinal:1,status:'DRAFT',revision:1,publicationId:null})}
  const tool=tools.find(t=>path.endsWith('/instruments/'+t.id));if(tool)return reply(tool)
  throw Error('Unexpected '+path)
 })
 vi.stubGlobal('fetch',fetcher)
 render(<SurveyWaveStudio projectId="p" onNavigateLibrary={()=>{}}/>);fireEvent.click(await screen.findByRole('button',{name:'新建波次'}))
 fireEvent.click(screen.getByRole('button',{name:'从授权整包添加'}));fireEvent.click(await screen.findByRole('button',{name:'查看我的整包授权'}));await screen.findByText('Package')
 fireEvent.click(screen.getByRole('button',{name:'整包导入：Package'}));await screen.findByText(/导入与选择已完成，只需重新读取工具列表/)
 fireEvent.click(screen.getByRole('button',{name:'上移 Fixed b'}))
 fireEvent.click(screen.getByText('实验与流程'));fireEvent.click(screen.getByRole('button',{name:'修改合成流程'}))
 fireEvent.click(screen.getByText('采集策略'));fireEvent.click(screen.getByLabelText('首次准入时按实验组原子占用名额'))
 fireEvent.change(screen.getByLabelText('组别 group 最大入场数（1–10000）'),{target:{value:'7'}})
 fireEvent.click(screen.getByRole('button',{name:'重新读取工具列表：Package'}));await screen.findByText(/整包已加入本研究/)
 fireEvent.change(screen.getByLabelText('波次标题'),{target:{value:'保留编辑'}})
 fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:'这是合成测试的知情同意材料，没有真实被试或者真实作答。'}})
 fireEvent.click(screen.getByRole('button',{name:'创建波次'}))
 await waitFor(()=>expect(saved).toMatchObject({instrumentIds:['b','a'],flowDefinition:{experiment:{experimentKey:'useredit'},blocks:[{instrumentKey:'tool_b'},{instrumentKey:'tool_a'}]},quotaPolicy:{groupLimits:{group:7}}}))
 expect(fetcher.mock.calls.filter(([p])=>String(p).endsWith('/package-grants/grant/import'))).toHaveLength(1)
})
