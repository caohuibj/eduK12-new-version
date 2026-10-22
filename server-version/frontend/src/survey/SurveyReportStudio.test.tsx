import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SurveyReportStudio } from './SurveyReportStudio'
const base='/api/survey/projects/project1/report-drafts'
const response=(data:unknown,ok=true,message='ok')=>({ok,json:async()=>({code:ok?0:-1,message,data})} as Response)
const payload=()=>({measurementReleaseId:'measure1',metricKeys:['effort'],audience:'researcher',language:'zh-CN',
  template:{title:'原报告',blocks:[{type:'TEXT',text:'原始文案'},{type:'METRIC',metricKey:'effort',display:'RAW'}],limitations:[],disclaimer:'仅供研究'},assets:[]})
function fixture({published=false,emptyMeasurements=false,extraBlocks=false,createDisconnect=false}={}){
  const measure={id:'measure1',family:'SCALE',key:'project-scale',version:'1',status:'PUBLISHED',contentHash:'a'.repeat(64),metrics:[{metricKey:'effort',unit:'points'}]}
  const original=payload()
  if(extraBlocks){
    Object.assign(original,{assets:[{assetId:'asset1',sha256:'b'.repeat(64),mediaType:'image/png',rightsStatus:'authorized',rightsNote:'Existing rights'}]})
    original.template.blocks.push({type:'ASSET',assetId:'asset1',alt:'既有图片'} as never,{type:'CHART',metricKeys:['effort'],style:'BAR'} as never)
  }
  const drafts=new Map<string,Record<string,any>>([['draft1',{id:'draft1',report_key:'feedback',version:'1',revision:0,payload:original,state:published?'PUBLISHED':'DRAFT',published_release_id:published?'release1':null}]])
  let measures=emptyMeasurements?[]:[measure],disconnect=createDisconnect
  const writes:{path:string;body:any}[]=[]
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const path=String(input),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined
    if(path==='/api/survey/auth/csrf')return response({csrfToken:'test-token'})
    if(path===base+'/measurements')return response(measures)
    if(path===base+'?page=1')return response([...drafts.values()].map(row=>({id:row.id,reportKey:row.report_key,version:row.version,revision:row.revision,state:row.state,publishedReleaseId:row.published_release_id})))
    if(path==='/api/survey/projects/project1/instruments?page=1')return response({list:[
      {id:'native',title:'自编量表',kind:'SCALE',status:'DRAFT',revision:4},
      {id:'form',title:'表单不可选',kind:'FORM',status:'DRAFT',revision:1},
      {id:'catalog',title:'目录量表',kind:'SCALE',status:'DRAFT',revision:1,catalogGrantId:'grant',readOnly:true},
      {id:'catalog-cog',title:'目录认知不可选',kind:'COGNITIVE',status:'DRAFT',revision:1,catalogGrantId:'grant-cog',readOnly:true},
      {id:'catalog-sjt',title:'目录情境不可选',kind:'SITUATIONAL',status:'DRAFT',revision:1,catalogGrantId:'grant-sjt',readOnly:true},
      {id:'readonly-no-grant',title:'无授权只读不可选',kind:'SCALE',status:'DRAFT',revision:1,readOnly:true},
      {id:'archived-catalog',title:'已归档不可选',kind:'SCALE',status:'ARCHIVED',revision:1,catalogGrantId:'grant-old',readOnly:true},
    ]})
    if(['/api/survey/projects/project1/instruments/native/measurement-release','/api/survey/projects/project1/instruments/catalog/measurement-release'].includes(path)&&method==='POST'){
      writes.push({path,body});measures=[measure];return response({releaseId:'measure1'})
    }
    if(path===base&&method==='POST'){
      writes.push({path,body})
      const existing=drafts.get(body.requestId)
      const row=existing??{id:body.requestId,report_key:body.reportKey,version:body.version,revision:0,payload:body.payload,state:'DRAFT',published_release_id:null}
      drafts.set(row.id,row)
      if(disconnect){disconnect=false;throw new Error('Network response lost')}
      return response(row)
    }
    const match=path.match(/\/report-drafts\/([^/]+)(\/preview|\/publish)?$/)
    if(match){
      const row=drafts.get(match[1]);if(!row)throw new Error('Unknown fixture draft')
      if(method==='GET'&&!match[2])return response(row)
      writes.push({path,body})
      if(method==='PATCH'){
        const updated={...row,payload:body.payload,revision:row.revision+1};drafts.set(row.id,updated);return response(updated)
      }
      if(match[2]==='/preview')return response({synthetic:true,scenario:body.scenario,revision:row.revision,
        report:{title:row.payload.template.title,blocks:[{type:'METRIC',metricKey:'effort',value:body.scenario==='INVALID'?null:1,unit:'points'}],limitations:[],disclaimer:null}})
      if(match[2]==='/publish'){drafts.set(row.id,{...row,state:'PUBLISHED',published_release_id:'release1'});return response({releaseId:'release1'})}
    }
    throw new Error('Unexpected request '+method+' '+path)
  })
  vi.stubGlobal('fetch',fetcher)
  return {fetcher,writes,drafts,original}
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();document.cookie='huisurvey_research_csrf=; Max-Age=0'})
async function openDraft(){fireEvent.click(await screen.findByRole('button',{name:'feedback · 1 · 草稿'}));await screen.findByLabelText('报告标题')}
describe('project private report studio',()=>{
  it('retains the expanded report layout for custom Training transport paths',async()=>{
    fixture();render(<SurveyReportStudio projectId="project1" basePath="/projects/project1/report-drafts"/>);await openDraft()
    expect(screen.getByRole('article',{name:'报告区块 2'}).querySelector('details')).toBeNull()
    expect(screen.getByLabelText('指标显示名称')).toBeVisible()
    expect(screen.getByRole('heading',{name:'项目私有报告'}).closest('header')).not.toHaveClass('is-compact')
  })

  it('retains edits when switching collapsed blocks and opens newly added content',async()=>{
    const f=fixture();render(<SurveyReportStudio projectId="project1"/>);await openDraft()
    const first=screen.getByRole('article',{name:'报告区块 1'}),second=screen.getByRole('article',{name:'报告区块 2'})
    expect(first.querySelector('details')).toHaveAttribute('open')
    expect(second.querySelector('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('段落文字'),{target:{value:'折叠前修改的段落'}})
    fireEvent.click(second.querySelector('summary')!)
    await waitFor(()=>expect(second.querySelector('details')).toHaveAttribute('open'))
    await waitFor(()=>expect(first.querySelector('details')).not.toHaveAttribute('open'))
    fireEvent.change(screen.getByLabelText('指标显示名称'),{target:{value:'学习投入'}})
    fireEvent.click(screen.getByRole('button',{name:'添加参考解释'}))
    const added=screen.getByRole('article',{name:'报告区块 3'})
    expect(added.querySelector('details')).toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('参考分段标识'),{target:{value:'approved-band'}})
    fireEvent.click(first.querySelector('summary')!)
    await waitFor(()=>expect(first.querySelector('details')).toHaveAttribute('open'))
    expect(screen.getByLabelText('段落文字')).toHaveValue('折叠前修改的段落')
    fireEvent.click(screen.getByRole('button',{name:'保存报告草稿'}));await screen.findByText('报告草稿已保存。')
    expect(f.writes.find(w=>w.path===base+'/draft1')!.body.payload.template.blocks).toEqual(expect.arrayContaining([
      {type:'TEXT',text:'折叠前修改的段落'},expect.objectContaining({type:'METRIC',label:'学习投入'}),expect.objectContaining({type:'REFERENCE_BAND',bandKey:'approved-band'}),
    ]))
  })

  it('loads lazily, joins StrictMode initialization and retains edits while hidden',async()=>{
    const f=fixture(),view=render(<StrictMode><SurveyReportStudio projectId="project1" active={false}/></StrictMode>)
    expect(f.fetcher).not.toHaveBeenCalled()
    view.rerender(<StrictMode><SurveyReportStudio projectId="project1" active/></StrictMode>);await openDraft()
    fireEvent.change(screen.getByLabelText('报告标题'),{target:{value:'尚未保存'}})
    view.rerender(<StrictMode><SurveyReportStudio projectId="project1" active={false}/></StrictMode>)
    view.rerender(<StrictMode><SurveyReportStudio projectId="project1" active/></StrictMode>)
    expect(screen.getByLabelText('报告标题')).toHaveValue('尚未保存')
    expect(f.fetcher.mock.calls.filter(([path])=>path===base+'/measurements')).toHaveLength(1)
    expect(f.writes).toHaveLength(0)
  })
  it('uses controlled blocks and explicit revision save, preserving unsupported blocks and assets',async()=>{
    const f=fixture({extraBlocks:true});render(<SurveyReportStudio projectId="project1"/>);await openDraft()
    expect(screen.getByText(/此 ASSET 区块.*只读/)).toBeInTheDocument()
    expect(screen.getByText(/此 CHART 区块.*只读/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('段落文字'),{target:{value:'已修改文案'}})
    fireEvent.click(screen.getByRole('button',{name:'添加参考解释'}))
    fireEvent.change(screen.getByLabelText('参考分段标识'),{target:{value:'approved-band'}})
    fireEvent.change(screen.getByLabelText('匹配时显示的文字'),{target:{value:'仅在已批准匹配结果下显示'}})
    expect(screen.getByRole('button',{name:'预览合成报告'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'发布报告版本'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'保存报告草稿'}))
    await screen.findByText('报告草稿已保存。')
    const patch=f.writes.find(w=>w.path===base+'/draft1')!.body
    expect(patch.revision).toBe(0)
    expect(patch.payload.assets).toEqual(f.original.assets)
    expect(patch.payload.template.blocks).toEqual(expect.arrayContaining([{type:'ASSET',assetId:'asset1',alt:'既有图片'},{type:'CHART',metricKeys:['effort'],style:'BAR'},expect.objectContaining({type:'REFERENCE_BAND',bandKey:'approved-band'})]))
    const request=f.fetcher.mock.calls.find(([path,init])=>path===base+'/draft1'&&init?.method==='PATCH')![1]!
    expect(request.credentials).toBe('same-origin');expect(request.headers).toMatchObject({'X-CSRF-Token':'test-token'})
    expect(screen.getByRole('button',{name:'保存报告草稿'})).toBeDisabled()
  })
  it('previews only an explicitly chosen synthetic scenario without real sample requests',async()=>{
    const f=fixture();render(<SurveyReportStudio projectId="project1"/>);await openDraft()
    expect(f.writes).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('预览情境'),{target:{value:'INVALID'}})
    fireEvent.click(screen.getByRole('button',{name:'预览合成报告'}))
    const preview=await screen.findByRole('region',{name:'合成报告预览'})
    expect(within(preview).getByText(/effort：不可用/)).toBeInTheDocument()
    expect(f.writes).toEqual([{path:base+'/draft1/preview',body:{scenario:'INVALID'}}])
    expect(f.fetcher.mock.calls.every(([url])=>!String(url).match(/analytics|answers|results|facts|samples/))).toBe(true)
  })
  it('publishes only on explicit action with note/revision and makes the accepted version read-only',async()=>{
    const f=fixture();render(<SurveyReportStudio projectId="project1"/>);await openDraft()
    expect(screen.getByRole('button',{name:'发布报告版本'})).toBeDisabled()
    fireEvent.change(screen.getByLabelText('发布说明'),{target:{value:'已复核本项目说明文字'}})
    expect(f.writes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'发布报告版本'}))
    await screen.findByText('报告版本已发布。已有报告与原始分数未被改写。')
    expect(f.writes).toEqual([{path:base+'/draft1/publish',body:{revision:0,publicationNote:'已复核本项目说明文字'}}])
    expect(screen.getByLabelText('报告标题')).toBeDisabled()
    expect(screen.queryByRole('button',{name:'发布报告版本'})).not.toBeInTheDocument()
  })
  it('copies a published report using a new explicit version and preserves original content/assets',async()=>{
    const f=fixture({published:true,extraBlocks:true});render(<SurveyReportStudio projectId="project1"/>)
    fireEvent.click(await screen.findByRole('button',{name:'feedback · 1 · 已发布'}));await screen.findByLabelText('新报告版本号')
    expect(screen.getByLabelText('报告标题')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('新报告版本号'),{target:{value:'1'}})
    expect(screen.getByRole('button',{name:'复制已发布报告为新草稿'})).toBeDisabled()
    fireEvent.change(screen.getByLabelText('新报告版本号'),{target:{value:'2'}})
    fireEvent.click(screen.getByRole('button',{name:'复制已发布报告为新草稿'}))
    await screen.findByText('报告草稿已创建，尚未发布。')
    expect(f.writes[0]).toEqual({path:base,body:{requestId:expect.any(String),reportKey:'feedback',version:'2',payload:f.original}})
    expect(f.drafts.get('draft1')!.state).toBe('PUBLISHED')
    expect(screen.getByLabelText('报告标题')).toBeEnabled()
  })
  it('retries an uncertain creation with the identical request ID and payload',async()=>{
    const f=fixture({createDisconnect:true});render(<SurveyReportStudio projectId="project1"/>)
    await screen.findByRole('option',{name:/project-scale/})
    await waitFor(()=>expect(screen.getByLabelText('报告系列标识')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('报告系列标识'),{target:{value:'new-report'}})
    fireEvent.click(screen.getByRole('button',{name:'创建报告草稿'}))
    await screen.findByText('Network response lost')
    expect(screen.getByLabelText('报告系列标识')).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'重试本次创建'}))
    await screen.findByText('报告草稿已创建，尚未发布。')
    expect(f.writes).toHaveLength(2);expect(f.writes[1]).toEqual(f.writes[0])
    expect(f.drafts.size).toBe(2)
  })
  it('offers native tools and licensed read-only catalog Scale without silently publishing either',async()=>{
    const f=fixture({emptyMeasurements:true});render(<SurveyReportStudio projectId="project1"/>)
    await screen.findByRole('option',{name:'自编量表 · SCALE · 修订 4'})
    expect(screen.queryByRole('option',{name:/表单不可选|目录认知不可选|目录情境不可选|无授权只读不可选|已归档不可选/})).not.toBeInTheDocument()
    expect(screen.getByRole('option',{name:'目录量表 · SCALE · 修订 1 · 授权只读原版'})).toBeInTheDocument()
    expect(f.writes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'发布所选测量版本'}))
    await screen.findByRole('option',{name:/project-scale/})
    expect(f.writes).toEqual([{path:'/api/survey/projects/project1/instruments/native/measurement-release',body:{revision:4}}])
    expect(screen.getByLabelText('测量发布版本')).toHaveValue('measure1')
  })
  it('publishes a catalog Scale by exact draft revision without changing or copying its content',async()=>{
    const f=fixture({emptyMeasurements:true});render(<SurveyReportStudio projectId="project1"/>)
    await screen.findByRole('option',{name:'目录量表 · SCALE · 修订 1 · 授权只读原版'})
    fireEvent.change(screen.getByLabelText('可发布测量'),{target:{value:'catalog'}})
    expect(f.writes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button',{name:'发布所选测量版本'}))
    await screen.findByText('测量版本已发布，可用于编制报告；未开启被试采集。')
    expect(f.writes).toEqual([{path:'/api/survey/projects/project1/instruments/catalog/measurement-release',body:{revision:1}}])
    expect(f.fetcher.mock.calls.some(([,init])=>init?.method==='PATCH')).toBe(false)
    expect(screen.getByLabelText('测量发布版本')).toHaveValue('measure1')
  })
  it.each(['CLOSED','ARCHIVED'])('allows historical report corrections for %s without reopening measurement publication',async projectStatus=>{
    const f=fixture();render(<SurveyReportStudio projectId="project1" projectStatus={projectStatus}/>);await openDraft()
    expect(screen.getByLabelText('报告标题')).toBeEnabled()
    fireEvent.change(screen.getByLabelText('发布说明'),{target:{value:'历史文案修正'}})
    expect(screen.getByRole('button',{name:'发布报告版本'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'发布或更新测量版本'}))
    await screen.findByText('项目采集已关闭或归档，不能发布新的测量；仍可修订历史报告。')
    expect(screen.getByRole('button',{name:'发布所选测量版本'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'发布报告版本'}))
    await screen.findByText('报告版本已发布。已有报告与原始分数未被改写。')
    expect(f.writes).toEqual([{path:base+'/draft1/publish',body:{revision:0,publicationNote:'历史文案修正'}}])
  })
  it('loads native drafts on demand even when a measurement release already exists',async()=>{
    const f=fixture();render(<SurveyReportStudio projectId="project1"/>);await openDraft()
    expect(f.fetcher.mock.calls.some(([url])=>String(url).includes('/instruments'))).toBe(false)
    fireEvent.click(screen.getByRole('button',{name:'发布或更新测量版本'}))
    await screen.findByRole('option',{name:'自编量表 · SCALE · 修订 4'})
    fireEvent.click(screen.getByRole('button',{name:'发布所选测量版本'}))
    await screen.findByText('测量版本已发布，可用于编制报告；未开启被试采集。')
    expect(f.writes).toEqual([{path:'/api/survey/projects/project1/instruments/native/measurement-release',body:{revision:4}}])
  })
})
