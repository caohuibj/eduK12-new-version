import { StrictMode } from 'react'
import { act,fireEvent,render,screen,waitFor,within } from '@testing-library/react'
import { afterEach,describe,expect,it,vi } from 'vitest'
import SurveyApp from './SurveyApp'
import { SurveyWaveStudio } from './SurveyWaveStudio'
import type { ResearchDraft } from './builder.types'

vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
vi.mock('./SurveyFlowStudio',()=>({SurveyFlowStudio:({questions}:{questions:{prompt:string}[]})=>
  <output aria-label="flow questions">{questions.map(question=>question.prompt).join(',')}</output>}))
vi.mock('./SurveyStudyPreview',()=>({SurveyStudyPreview:()=>null}))
const response=(data:unknown,ok=true)=>({ok,json:async()=>({code:ok?0:503,message:ok?'ok':'retry list',data})} as Response)
const deferred=()=>{
  let resolve!:(value:Response)=>void
  const promise=new Promise<Response>(done=>{resolve=done})
  return {promise,resolve}
}
const draft=(id='tool1',title='工具一'):ResearchDraft=>({id,projectId:'p1',instrumentKey:id,kind:'FORM',title,
  status:'DRAFT',revision:1,createdAt:'',updatedAt:'',definition:{schemaVersion:1,pages:[{
    pageKey:'page',title:'第一页',questions:[{itemKey:'question',type:'SHORT_TEXT',prompt:'原题干',required:false,options:[],rows:[]}],
  }]}})
const wave=(id='w1',ordinal=1)=>({id,projectId:'p1',title:'波次 '+ordinal,ordinal,status:'DRAFT',revision:1,
  instrumentIds:['tool1'],publicationId:null,consentText:'足够长度的知情同意说明用于测试研究波次保存',generalText:'谢谢',consentVersion:1,
  linkageNoticeConfirmed:false,opensAt:null,closesAt:null,finishUntil:null,quotaStarts:null,startsCount:0,allowNewParticipants:false,hardStopAt:null})
function fixture({many=false,empty=false,waveCount=1}={}){
  const drafts=new Map((empty?[]:Array.from({length:many?26:1},(_,i)=>draft('tool'+(i+1),'工具'+(i+1)))).map(item=>[item.id,item]))
  const projects=['p1','p2'].map(id=>({id,title:'研究 '+id,description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}))
  const waits=new Map<string,Promise<Response>[]>()
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET'
    const pending=waits.get(method+' '+url)?.shift()
    if(pending)return pending
    if(url.endsWith('/auth/me'))return response({id:'researcher',username:'test',mustChangePassword:false})
    if(url.endsWith('/auth/capabilities'))return response({analytics:false,publication:true})
    if(url.endsWith('/auth/csrf'))return response({csrfToken:'synthetic-csrf'})
    if(url==='/api/survey/projects?page=1')return response({list:projects})
    const route=url.match(/^\/api\/survey\/projects\/(p[12])(.*)$/)
    if(!route)throw new Error('Unexpected request '+method+' '+url)
    const [,id,path]=route
    if(path==='')return response(projects.find(project=>project.id===id))
    if(path==='/catalog?page=1')return response({list:[{id:'grant1',title:'授权原版',kind:'FORM',status:'ACTIVE',sourceRef:{kind:'FORM',sourceId:'form',sourceVersion:1}}]})
    if(path==='/assets')return response({assets:[]})
    if(path.startsWith('/waves?page='))return response({list:Array.from({length:Number(path.split('=')[1])===1?waveCount:1},(_,i)=>wave('w'+(i+1),i+1))})
    if(path.startsWith('/instruments?page=')){
      const page=Number(path.split('=')[1])
      return response({list:[...drafts.values()].slice((page-1)*25,page*25)})
    }
    if(path==='/instruments'&&method==='POST'){
      const body=JSON.parse(String(init?.body)),item=draft('created',body.title)
      drafts.set(item.id,item);return response(item)
    }
    if(path==='/catalog/grant1/import'&&method==='POST'){
      const item={...draft('imported','授权原版'),readOnly:true,catalogGrantId:'grant1'}
      drafts.set(item.id,item);return response(item)
    }
    if(path.match(/^\/instruments\/[^/]+$/)){
      const key=path.split('/')[2],item=drafts.get(key)
      if(!item)throw new Error('Unknown instrument '+key)
      if(method==='PATCH'){
        const updated={...item,...JSON.parse(String(init?.body)),revision:item.revision+1}
        drafts.set(key,updated);return response(updated)
      }
      return response(item)
    }
    if(path.match(/^\/waves\/w\d+$/))return response(wave(path.split('/')[2]))
    if(path==='/waves'&&method==='POST')return response({...wave(),...JSON.parse(String(init?.body))})
    throw new Error('Unexpected request '+method+' '+url)
  })
  vi.stubGlobal('fetch',fetcher)
  return {
    drafts,fetcher,
    count(path:string,method='GET'){return fetcher.mock.calls.filter(([url,init])=>String(url)===path&&(init?.method??'GET')===method).length},
    defer(path:string,method='GET'){const pending=deferred();const key=method+' '+path;waits.set(key,[...(waits.get(key)??[]),pending.promise]);return pending},
  }
}
const base='/api/survey/projects/p1'
const builder=()=>within(screen.getByRole('region',{name:'Survey Research Builder'}))
const studio=()=>within(screen.getByRole('region',{name:'研究波次'}))
async function openWorkspace(strict=false){
  window.history.replaceState(null,'','/workspace')
  render(strict?<StrictMode><SurveyApp/></StrictMode>:<SurveyApp/>)
  fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
  await screen.findByRole('region',{name:'研究波次'})
}
afterEach(()=>{vi.unstubAllGlobals();window.history.replaceState(null,'','/')})

describe('shared Survey workspace instruments requests',()=>{
  it('loads one instruments page for real Builder and WaveStudio, including StrictMode replay and empty results',async()=>{
    const api=fixture({empty:true});await openWorkspace(true)
    await screen.findByText('暂无工具草稿')
    await waitFor(()=>expect(api.count(base+'/instruments?page=1')).toBe(1))
    expect(studio().getByText('请先通过 Builder 创建研究工具。')).toBeInTheDocument()
  })

  it('refreshes both lists once after create and catalog import, preserving unsaved wave fields',async()=>{
    const api=fixture();await openWorkspace();await builder().findByRole('button',{name:/^工具1 FORM/})
    fireEvent.change(studio().getByLabelText('波次标题'),{target:{value:'未保存波次'}})
    fireEvent.change(builder().getByLabelText('名称',{exact:true}),{target:{value:'新增工具'}})
    fireEvent.click(builder().getByRole('button',{name:'创建草稿'}))
    await studio().findByRole('checkbox',{name:'FORM · 新增工具'})
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    expect(studio().getByLabelText('波次标题')).toHaveValue('未保存波次')
    fireEvent.click(builder().getByRole('button',{name:'导入此版本：授权原版'}))
    await studio().findByRole('checkbox',{name:'FORM · 授权原版'})
    expect(api.count(base+'/instruments?page=1')).toBe(3)
    expect(api.count(base+'/waves?page=1')).toBe(1)
    expect(api.count(base)).toBe(1)
    expect(builder().getByLabelText('研究工具名称')).toHaveAttribute('readonly')
  })

  it('saves once, shares the refreshed summary, and reloads selected question details',async()=>{
    const api=fixture();await openWorkspace()
    fireEvent.click(await studio().findByRole('checkbox',{name:'FORM · 工具1'}))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('原题干'))
    fireEvent.click(builder().getByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('研究工具名称'),{target:{value:'新工具名'}})
    fireEvent.change(builder().getByLabelText('题干'),{target:{value:'保存后的新题干'}})
    fireEvent.change(studio().getByLabelText('波次标题'),{target:{value:'保留波次草稿'}})
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await studio().findByRole('checkbox',{name:'FORM · 新工具名'})
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('保存后的新题干'))
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    expect(api.count(base+'/instruments/tool1')).toBe(3)
    expect(api.count(base+'/waves?page=1')).toBe(1)
    expect(api.count(base)).toBe(1)
    expect(studio().getByLabelText('波次标题')).toHaveValue('保留波次草稿')
  })

  it('fetches only the requested list on paging and refreshes each active instruments page once after a write',async()=>{
    const api=fixture({many:true,waveCount:25});await openWorkspace()
    await studio().findByRole('checkbox',{name:'FORM · 工具1'})
    fireEvent.click(studio().getByRole('button',{name:'工具下一页'}))
    await studio().findByRole('checkbox',{name:'FORM · 工具26'})
    expect(api.count(base+'/instruments?page=2')).toBe(1)
    expect(api.count(base+'/waves?page=1')).toBe(1);expect(api.count(base)).toBe(1)
    const list=within(builder().getByRole('navigation',{name:'当前项目研究工具'}))
    fireEvent.click(list.getByRole('button',{name:'下一页'}))
    await list.findByRole('button',{name:/工具26.*FORM/})
    expect(api.count(base+'/instruments?page=2')).toBe(1)
    fireEvent.click(list.getByRole('button',{name:'上一页'}))
    await list.findByRole('button',{name:/^工具1 FORM/})
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    fireEvent.click(list.getByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('研究工具名称'),{target:{value:'跨页保存'}})
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await builder().findByText('草稿已保存；发布冻结将在研究波次阶段执行')
    expect(api.count(base+'/instruments?page=1')).toBe(3)
    expect(api.count(base+'/instruments?page=2')).toBe(2)
    fireEvent.click(within(studio().getByRole('navigation',{name:'研究波次列表'})).getByRole('button',{name:'下一页'}))
    await studio().findByText('波次第 2 页')
    expect(api.count(base+'/waves?page=2')).toBe(1)
    expect(api.count(base+'/instruments?page=2')).toBe(2);expect(api.count(base)).toBe(1)
  })

  it('retries a shared initial failure and updates both consumers with one retry',async()=>{
    const api=fixture(),pending=api.defer(base+'/instruments?page=1');await openWorkspace()
    await act(async()=>pending.resolve(response(null,false)))
    expect(await builder().findByRole('button',{name:'重试研究工具列表'})).toBeEnabled()
    fireEvent.click(builder().getByRole('button',{name:'重试研究工具列表'}))
    await studio().findByRole('checkbox',{name:'FORM · 工具1'})
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    expect(builder().queryByText('retry list')).toBeNull();expect(studio().queryByText('retry list')).toBeNull()
  })

  it('ignores an older list response that finishes after a successful mutation refresh',async()=>{
    const api=fixture({empty:true}),pending=api.defer(base+'/instruments?page=1');await openWorkspace()
    fireEvent.change(builder().getByLabelText('名称',{exact:true}),{target:{value:'最新工具'}})
    fireEvent.click(builder().getByRole('button',{name:'创建草稿'}))
    await studio().findByRole('checkbox',{name:'FORM · 最新工具'})
    await act(async()=>pending.resolve(response({list:[draft('old','过期工具')]})))
    expect(studio().getByRole('checkbox',{name:'FORM · 最新工具'})).toBeInTheDocument()
    expect(builder().queryByRole('button',{name:/过期工具/})).toBeNull()
    expect(api.count(base+'/instruments?page=1')).toBe(2)
  })

  it('does not apply an old project list after selecting another project',async()=>{
    const api=fixture(),pending=api.defer(base+'/instruments?page=1');await openWorkspace()
    fireEvent.click(screen.getAllByRole('button',{name:'查看/编辑'})[1])
    await studio().findByRole('checkbox',{name:'FORM · 工具1'})
    await act(async()=>pending.resolve(response({list:[draft('old','旧项目工具')]})))
    expect(studio().queryByRole('checkbox',{name:'FORM · 旧项目工具'})).toBeNull()
    expect(api.count('/api/survey/projects/p2/instruments?page=1')).toBe(1)
  })

  it('does not restore an old wave selection or its details after New wave',async()=>{
    const api=fixture();render(<SurveyWaveStudio projectId="p1"/>)
    const pending=api.defer(base+'/instruments/tool1')
    fireEvent.click(await screen.findByRole('button',{name:/T1 · 波次 1/}))
    await waitFor(()=>expect(api.count(base+'/instruments/tool1')).toBe(1))
    fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    await act(async()=>pending.resolve(response(draft('tool1','旧波次详情'))))
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
    expect(screen.getByLabelText('flow questions')).toBeEmptyDOMElement()
  })

  it('rejects old project wave/project responses even when the component is reused without a key',async()=>{
    const api=fixture(),oldWaves=api.defer(base+'/waves?page=1'),oldProject=api.defer(base)
    const view=render(<SurveyWaveStudio projectId="p1"/>)
    view.rerender(<SurveyWaveStudio projectId="p2"/>)
    await screen.findByRole('button',{name:/T1 · 波次 1/})
    await act(async()=>{
      oldWaves.resolve(response({list:[{...wave(),title:'旧项目波次'}]}))
      oldProject.resolve(response({id:'p1',collectionMode:'LINKED_WAVES',status:'CLOSED',revision:9}))
    })
    expect(screen.queryByRole('button',{name:/旧项目波次/})).toBeNull()
    expect(screen.queryByText('CLOSED',{exact:true})).toBeNull()
  })

  it('retries selected-details refresh failure without repeating a successful instruments list request',async()=>{
    const api=fixture();await openWorkspace()
    fireEvent.click(await studio().findByRole('checkbox',{name:'FORM · 工具1'}))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('原题干'))
    fireEvent.click(builder().getByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('研究工具名称'),{target:{value:'详情重试'}})
    const pending=api.defer(base+'/instruments/tool1')
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await studio().findByRole('checkbox',{name:'FORM · 详情重试'})
    await act(async()=>pending.resolve(response(null,false)))
    fireEvent.click(await studio().findByRole('button',{name:'重试已选工具详情'}))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('原题干'))
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    expect(api.count(base+'/instruments/tool1')).toBe(4)
  })

  it('does not overwrite refreshed question details with an older checkbox request',async()=>{
    const api=fixture();await openWorkspace()
    const pending=api.defer(base+'/instruments/tool1')
    fireEvent.click(await studio().findByRole('checkbox',{name:'FORM · 工具1'}))
    await waitFor(()=>expect(api.count(base+'/instruments/tool1')).toBe(1))
    fireEvent.click(builder().getByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('题干'),{target:{value:'最新题干'}})
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('最新题干'))
    await act(async()=>pending.resolve(response(draft())))
    expect(studio().getByLabelText('flow questions')).toHaveTextContent('最新题干')
  })

  it('refreshes only waves after saving a draft and ignores a save selection interrupted by New wave',async()=>{
    const api=fixture();render(<SurveyWaveStudio projectId="p1"/>)
    await screen.findByRole('button',{name:/T1 · 波次 1/})
    fireEvent.change(screen.getByLabelText('波次标题'),{target:{value:'新波次'}})
    fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:wave().consentText}})
    const pending=api.defer(base+'/waves','POST')
    fireEvent.click(screen.getByRole('button',{name:'创建波次'}))
    await waitFor(()=>expect(api.count(base+'/waves','POST')).toBe(1))
    fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    await act(async()=>pending.resolve(response({...wave(),title:'刚保存的旧草稿'})))
    await waitFor(()=>expect(api.count(base+'/waves?page=1')).toBe(2))
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
    expect(screen.queryByRole('button',{name:'保存波次草稿'})).toBeNull()
    expect(api.count(base+'/instruments?page=1')).toBe(1);expect(api.count(base)).toBe(1)
  })


  it('keeps a successful Builder create successful when another active page refresh fails',async()=>{
    const api=fixture({many:true});await openWorkspace()
    fireEvent.click(await studio().findByRole('button',{name:'工具下一页'}))
    await studio().findByRole('checkbox',{name:'FORM · 工具26'})
    const pending=api.defer(base+'/instruments?page=2')
    fireEvent.change(builder().getByLabelText('名称',{exact:true}),{target:{value:'已创建不要重复'}})
    fireEvent.click(builder().getByRole('button',{name:'创建草稿'}))
    await builder().findByText('已创建研究专用草稿，尚未进入正式测评目录')
    expect(builder().getByLabelText('研究工具名称')).toHaveValue('已创建不要重复')
    await act(async()=>pending.resolve(response(null,false)))
    fireEvent.click(await studio().findByRole('button',{name:'重试波次工具列表'}))
    await studio().findByRole('checkbox',{name:'FORM · 已创建不要重复'})
    expect(api.count(base+'/instruments','POST')).toBe(1)
    expect(api.count(base+'/instruments?page=1')).toBe(2)
    expect(api.count(base+'/instruments?page=2')).toBe(3)
  })

  it('loads the newly selected wave details when a Builder save invalidates a pending wave selection',async()=>{
    const api=fixture();await openWorkspace()
    fireEvent.click(await builder().findByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('题干'),{target:{value:'选择期间更新题干'}})
    const pending=api.defer(base+'/waves/w1')
    fireEvent.click(studio().getByRole('button',{name:/T1 · 波次 1/}))
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await builder().findByText('草稿已保存；发布冻结将在研究波次阶段执行')
    await act(async()=>pending.resolve(response(wave())))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('选择期间更新题干'))
    expect(api.count(base+'/instruments/tool1')).toBe(2)
  })

  it('keeps both selected tool details when a new checkbox is added during mutation revalidation',async()=>{
    const api=fixture(),second=draft('tool2','工具2')
    second.definition={schemaVersion:1,pages:[{pageKey:'second',title:'第二页',questions:[{
      itemKey:'second',type:'SHORT_TEXT',prompt:'工具二的题干',required:false,options:[],rows:[],
    }]}]}
    api.drafts.set(second.id,second);await openWorkspace()
    fireEvent.click(await studio().findByRole('checkbox',{name:'FORM · 工具1'}))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('原题干'))
    fireEvent.click(builder().getByRole('button',{name:/^工具1 FORM/}))
    fireEvent.change(await builder().findByLabelText('题干'),{target:{value:'工具一的新题干'}})
    const pending=api.defer(base+'/instruments/tool1')
    fireEvent.click(builder().getByRole('button',{name:'保存草稿'}))
    await builder().findByText('草稿已保存；发布冻结将在研究波次阶段执行')
    fireEvent.click(studio().getByRole('checkbox',{name:'FORM · 工具2'}))
    await waitFor(()=>expect(api.count(base+'/instruments/tool2')).toBe(1))
    await act(async()=>pending.resolve(response(api.drafts.get('tool1'))))
    await waitFor(()=>expect(studio().getByLabelText('flow questions')).toHaveTextContent('工具一的新题干,工具二的题干'))
    expect(api.count(base+'/instruments/tool1')).toBe(3)
    expect(api.count(base+'/instruments/tool2')).toBe(1)
  })


  it('retains the created instrument ACK when its own list refresh fails and retries only the read',async()=>{
    const api=fixture();await openWorkspace();await builder().findByRole('button',{name:/^工具1 FORM/})
    const pending=api.defer(base+'/instruments?page=1')
    fireEvent.change(builder().getByLabelText('名称',{exact:true}),{target:{value:'已持久创建'}})
    fireEvent.click(builder().getByRole('button',{name:'创建草稿'}))
    await act(async()=>pending.resolve(response(null,false)))
    await builder().findByRole('button',{name:'重试研究工具列表'})
    expect(builder().getByLabelText('研究工具名称')).toHaveValue('已持久创建')
    expect(builder().getByLabelText('名称',{exact:true})).toHaveValue('')
    expect(builder().getByText('已创建研究专用草稿，尚未进入正式测评目录')).toBeInTheDocument()
    fireEvent.click(builder().getByRole('button',{name:'重试研究工具列表'}))
    await studio().findByRole('checkbox',{name:'FORM · 已持久创建'})
    expect(api.count(base+'/instruments','POST')).toBe(1)
    expect(api.count(base+'/instruments?page=1')).toBe(3)
  })

  it('retains a saved wave identity when its list refresh fails and retries only the list',async()=>{
    const api=fixture();render(<SurveyWaveStudio projectId="p1"/>)
    await screen.findByRole('button',{name:/T1 · 波次 1/})
    fireEvent.change(screen.getByLabelText('波次标题'),{target:{value:'已保存的波次'}})
    fireEvent.change(screen.getByLabelText('参与说明与知情同意'),{target:{value:wave().consentText}})
    const pending=api.defer(base+'/waves?page=1')
    fireEvent.click(screen.getByRole('button',{name:'创建波次'}))
    await act(async()=>pending.resolve(response(null,false)))
    await screen.findByRole('button',{name:'重试波次列表'})
    expect(screen.getByRole('button',{name:'保存波次草稿'})).toBeEnabled()
    expect(screen.getByText('波次草稿已保存；冻结定义和正式开放需要分别确认')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试波次列表'}))
    await waitFor(()=>expect(screen.queryByRole('button',{name:'重试波次列表'})).toBeNull())
    expect(api.count(base+'/waves','POST')).toBe(1)
    expect(api.count(base+'/waves?page=1')).toBe(3)
  })

  it.each(['preflight','open','rotate'] as const)('does not attach an old %s response to a New wave',async operation=>{
    const api=fixture(),initial=api.defer(base+'/waves/w1')
    render(<SurveyWaveStudio projectId="p1"/>)
    fireEvent.click(await screen.findByRole('button',{name:/T1 · 波次 1/}))
    const selected={...wave(),status:operation==='rotate'?'OPEN':'DRAFT',publicationId:operation==='preflight'?null:'publication'}
    await act(async()=>initial.resolve(response(selected)))
    const endpoint=operation==='rotate'?'/entry-token/rotate':'/'+operation
    const pending=api.defer(base+'/waves/w1'+endpoint,'POST')
    const label=operation==='preflight'?'检查知情同意与所有工具':operation==='open'?'正式开放本轮':'轮换招募链接'
    fireEvent.click(await screen.findByRole('button',{name:label}))
    await waitFor(()=>expect(api.count(base+'/waves/w1'+endpoint,'POST')).toBe(1))
    fireEvent.click(screen.getByRole('button',{name:'新建波次'}))
    await act(async()=>pending.resolve(response(operation==='preflight'
      ?{ok:true,publicationReady:true,reason:'ok',checks:[]}
      :{researchUrl:'https://survey.example.test/old-wave-link'})))
    expect(screen.getByLabelText('波次标题')).toHaveValue('')
    expect(screen.queryByText('https://survey.example.test/old-wave-link')).toBeNull()
    expect(screen.queryByText('研究内容预检通过；发布阶段仍须通过运行时和权限门禁')).toBeNull()
    expect(api.count(base+'/waves/w1')).toBe(1)
    expect(api.count(base+'/waves?page=1')).toBe(operation==='preflight'?1:2)
    expect(api.count(base)).toBe(operation==='preflight'?1:2)
  })

})
