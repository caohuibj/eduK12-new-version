import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import SurveyApp from './SurveyApp'
const reply=(data:unknown)=>({ok:true,status:200,json:async()=>({code:0,data})} as Response)
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
it('reaches whole-package import through the actual workspace route and hands ordered exact bindings to wave saving',async()=>{
 window.history.replaceState(null,'','/workspace?project=p1&section=publish')
 vi.spyOn(window,'confirm').mockReturnValue(true)
 const project={id:'p1',title:'实际研究工作台',description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}
 const grant={id:'grant',title:'Exact approved package',hash:'a'.repeat(64),family:'BUNDLE',status:'ACTIVE',version:1,expiresAt:null,versions:{content:'c1',parameters:null,report:'r1'},components:[{slotKey:'a',title:'固定表单 A',kind:'FORM',versions:{content:'a1',parameters:null,report:null}}],availability:{ready:true,reasons:[],requiresFreshCheck:true}}
 const bindings=['a','b'].map(id=>({draftId:id,slotKey:id,instrumentKey:'tool_'+id}))
 const tools=bindings.map(b=>({id:b.draftId,projectId:'p1',instrumentKey:b.instrumentKey,kind:'FORM',title:'固定表单 '+b.draftId.toUpperCase(),status:'DRAFT',revision:1,readOnly:true,catalogGrantId:'internal-'+b.draftId,definition:{schemaVersion:2,pages:[{pageKey:'p',title:'Synthetic',questions:[]}]}}))
 let imported=false,saved:Record<string,unknown>|undefined
 const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const path=String(input)
  if(path.endsWith('/auth/me'))return reply({id:'researcher',username:'Synthetic',mustChangePassword:false})
  if(path.endsWith('/auth/capabilities'))return reply({analytics:false,publication:true})
  if(path.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic'})
  if(path==='/api/survey/projects?page=1')return reply({list:[project]})
  if(path==='/api/survey/projects/p1')return reply(project)
  if(path.includes('/waves?page='))return reply({list:[]})
  if(path.includes('/instruments?page='))return reply({list:imported?tools:[]})
  if(path.includes('/governed-projects/p1/package-grants?'))return reply({list:[grant],hasMore:false})
  if(path==='/api/survey/governed-projects/p1/package-grants/grant/import'){
   expect(init?.method).toBe('POST');expect(init?.headers).toMatchObject({'X-CSRF-Token':'synthetic'})
   expect(JSON.parse(String(init?.body)).requestId).toEqual(expect.any(String));imported=true;return reply({importId:'instance',bindings})
  }
  if(path==='/api/survey/projects/p1/waves'&&init?.method==='POST'){
   saved=JSON.parse(String(init.body));return reply({...saved,id:'w1',projectId:'p1',status:'DRAFT',revision:1,ordinal:1,publicationId:null,hardStopAt:null,startsCount:0})
  }
  const tool=tools.find(t=>path.endsWith('/instruments/'+t.id));if(tool)return reply(tool)
  throw new Error('Unexpected workspace request '+path)
 })
 vi.stubGlobal('fetch',fetcher)
 render(<SurveyApp/>)
 fireEvent.click(await screen.findByRole('button',{name:'新建波次'}))
 fireEvent.click(await screen.findByRole('button',{name:'从授权整包添加'}))
 expect(screen.queryByRole('region',{name:'Survey Research Builder'})).toBeNull()
 fireEvent.click(await screen.findByRole('button',{name:'查看我的整包授权'}));await screen.findByText('Exact approved package')
 fireEvent.click(screen.getByRole('button',{name:'整包导入：Exact approved package'}))
 await screen.findByText(/整包已加入本研究/)
 await waitFor(()=>expect(document.querySelector('.survey-selected-tools')?.textContent).toMatch(/固定表单 A.*固定表单 B/))
 fireEvent.change(screen.getByLabelText('波次标题'),{target:{value:'整包闭环波次'}})
 fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:'这是隔离合成测试的研究说明，没有任何真实参与者数据。'}})
 fireEvent.click(screen.getByRole('button',{name:'创建波次'}))
 await waitFor(()=>expect(saved?.instrumentIds).toEqual(['a','b']))
 expect(fetcher.mock.calls.filter(([path])=>String(path).endsWith('/package-grants/grant/import'))).toHaveLength(1)
 expect(fetcher.mock.calls.some(([path])=>String(path).includes('/tool-library?'))).toBe(false)
})
