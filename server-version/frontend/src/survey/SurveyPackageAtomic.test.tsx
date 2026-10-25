import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {SurveyWaveStudio} from './SurveyWaveStudio'
import type {PackageMembership} from './package-arrangement'
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})} as Response)
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
it('repairs two damaged instances explicitly, keeps expired authority blocked and preserves atomic moves and ambiguous material',async()=>{
 const p=(id:string,ids:string[],ready=true):PackageMembership=>({id,title:'Same version package',family:'BUNDLE',hash:'a'.repeat(64),status:'ACTIVE',version:1,expiresAt:null,bindings:ids.map(draftId=>({draftId,slotKey:draftId,instrumentKey:draftId})),availability:{ready,reasons:ready?[]:['此授权已失效'],requiresFreshCheck:true}})
 const packages=[p('instance-26',['a','b'],false),p('instance-27',['x','y'])]
 const tools=['a','b','c','x','y'].map(id=>({id,projectId:'p',instrumentKey:id,title:'Tool '+id,kind:'FORM',status:'DRAFT',revision:1,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[]}]}}))
 const wave={id:'w',projectId:'p',title:'损坏草稿',ordinal:1,status:'DRAFT',revision:1,instrumentIds:['b','c','x'],publicationId:null,consentText:'这是合成测试使用的完整知情同意说明，没有任何真实研究资料。',generalText:'Synthetic',consentVersion:1,linkageNoticeConfirmed:false,opensAt:null,closesAt:null,finishUntil:null,quotaStarts:9,startsCount:0,allowNewParticipants:true,hardStopAt:null}
 let saved:any
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input)
  if(path.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
  if(path.endsWith('/projects/p'))return reply({id:'p',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1})
  if(path.includes('/waves?page='))return reply({list:[wave]})
  if(path.includes('/instruments?page='))return reply({list:tools})
  if(path.includes('/package-memberships?'))return reply({list:packages})
  if(path.endsWith('/waves/w')){if(init?.method&&init.method!=='GET'){saved=JSON.parse(String(init.body));return reply({...wave,...saved,revision:2})}return reply(wave)}
  const tool=tools.find(t=>path.endsWith('/instruments/'+t.id));if(tool)return reply(tool)
  throw Error('Unexpected '+path)
 })
 vi.stubGlobal('fetch',fetcher);render(<SurveyWaveStudio projectId="p" onNavigateLibrary={()=>{}}/>)
 fireEvent.click(await screen.findByRole('button',{name:/T1 · 损坏草稿/}))
 expect(await screen.findAllByText('整包不完整')).toHaveLength(2);expect(screen.getByText(/原序列：Tool b → Tool c → Tool x/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'上移 Tool b'})).toBeNull()
 fireEvent.click(screen.getAllByRole('button',{name:'恢复完整整包及批准顺序'})[0])
 await waitFor(()=>expect(screen.getAllByText('整包不完整')).toHaveLength(1))
 fireEvent.click(screen.getByRole('button',{name:'恢复完整整包及批准顺序'}))
 await waitFor(()=>expect(screen.queryByText('整包不完整')).toBeNull())
 expect(screen.getByText(/此授权已失效；修复顺序不恢复使用授权/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'下移 Tool c'}))
 fireEvent.click(screen.getByText('实验与流程'));fireEvent.click(screen.getByRole('button',{name:'启用 Flow V1'}))
 expect(screen.getAllByText(/只读组件顺序/)).toHaveLength(2)
 expect(screen.getAllByRole('combobox',{name:'研究工具'})).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'添加研究实验分组'}))
 expect(screen.getByText(/不能加入条件跳过或实验分支/)).toBeInTheDocument()
 fireEvent.click(screen.getAllByRole('button',{name:'下移整包'})[0])
 fireEvent.click(screen.getByRole('button',{name:'增加研究材料'}))
 fireEvent.change(screen.getByLabelText('素材正文'),{target:{value:'Legal unconditional synthetic material'}})
 for(let i=0;i<2;i++)fireEvent.click(within(screen.getByLabelText('素材正文').closest('div.rounded-lg') as HTMLElement).getByRole('button',{name:'上移'}))
 fireEvent.click(screen.getAllByRole('button',{name:'下移整包'})[1])
 expect(screen.getByText(/整包组件之间含材料或结束块/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'保存波次草稿'}))
 await waitFor(()=>expect(saved?.instrumentIds).toEqual(['x','y','a','b','c']))
 expect(saved.flowDefinition.blocks.map((b:any)=>b.kind==='INSTRUMENT'?b.instrumentKey:b.kind)).toEqual(['x','y','a','MATERIAL','b','c'])
 expect(saved.flowDefinition.blocks.find((b:any)=>b.kind==='MATERIAL').body).toBe('Legal unconditional synthetic material')
 expect(saved.quotaStarts).toBe(9)
 expect(fetcher.mock.calls.filter(([path])=>String(path).includes('/package-memberships?')).some(([path])=>String(path).includes('draftIds=a%2Cb%2Cc%2Cx%2Cy'))).toBe(true)
})
