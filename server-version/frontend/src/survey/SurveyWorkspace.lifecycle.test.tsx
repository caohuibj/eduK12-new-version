import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyBuilder} from './SurveyBuilder'
import {SurveyAnalyticsWorkspace} from './SurveyAnalyticsWorkspace'
import type {ResearchDraft} from './builder.types'

const projectId='11111111-1111-4111-8111-111111111111'
const base='/api/survey/projects/'+projectId
const response=(data:unknown)=>Promise.resolve({ok:true,
  json:async()=>({code:0,data,message:'ok'})} as Response)
const deferred=<T,>()=>{
  let resolve!:(value:T)=>void
  const promise=new Promise<T>(done=>{resolve=done})
  return {promise,resolve}
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('Survey workspace in-flight editing and request scope',()=>{
  it('does not accept editor changes that a pending save acknowledgement would overwrite',async()=>{
    const user=userEvent.setup(),pending=deferred<Response>()
    let draft:ResearchDraft={id:'instrument',projectId,instrumentKey:'form',kind:'FORM',
      title:'原工具',revision:1,status:'DRAFT',createdAt:'2026-01-01T00:00:00Z',
      updatedAt:'2026-01-01T00:00:00Z',definition:{schemaVersion:1,pages:[{
        pageKey:'page',title:'第一页',questions:[{itemKey:'text',type:'SHORT_TEXT',
          prompt:'原始题干',required:true,options:[],rows:[]}],
      }]}}
    let patch:Record<string,unknown>|undefined
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
      if(url==='/api/survey/auth/csrf')return response({csrfToken:'synthetic-csrf'})
      if(url===base+'/assets')return response({assets:[]})
      if(url===base+'/instruments?page=1')return response({list:[draft]})
      if(url===base+'/instruments/instrument'&&init?.method==='PATCH'){
        patch=JSON.parse(String(init.body));return pending.promise
      }
      if(url===base+'/instruments/instrument')return response(draft)
      throw new Error('Unexpected route '+url)
    }))
    render(<SurveyBuilder projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:/原工具.*FORM/}))
    const title=await screen.findByLabelText('研究工具名称')
    const prompt=screen.getByLabelText('题干')
    fireEvent.change(title,{target:{value:'已保存名称'}})
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(patch).toBeDefined())
    await user.type(title,'不应丢失的新内容')
    await user.type(prompt,'不应丢失的新题干')
    const acceptedValues=[(title as HTMLInputElement).value,(prompt as HTMLInputElement).value]
    draft={...draft,title:'已保存名称',revision:2}
    await act(async()=>pending.resolve(await response(draft)))
    await screen.findByText('草稿已保存；发布冻结将在研究波次阶段执行')
    // A successful ACK must never erase any edit the UI allowed while waiting.
    expect([(title as HTMLInputElement).value,(prompt as HTMLInputElement).value]).toEqual(acceptedValues)
    expect(acceptedValues).toEqual(['已保存名称','原始题干'])
    expect(title).toBeEnabled();expect(prompt).toBeEnabled()
    await user.type(title,'后续修改')
    expect(title).toHaveValue('已保存名称后续修改')
    expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  })

  it('preserves an image upload that completes while an earlier draft save is pending',async()=>{
    const user=userEvent.setup(),savePending=deferred<Response>(),uploadPending=deferred<Response>()
    let draft:ResearchDraft={id:'instrument',projectId,instrumentKey:'form',kind:'FORM',
      title:'图片工具',revision:1,status:'DRAFT',createdAt:'2026-01-01T00:00:00Z',
      updatedAt:'2026-01-01T00:00:00Z',definition:{schemaVersion:1,pages:[{
        pageKey:'page',title:'第一页',questions:[{itemKey:'text',type:'SHORT_TEXT',
          prompt:'待配图',required:true,options:[],rows:[]}],
      }]}}
    const patches:Record<string,unknown>[]=[]
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
      if(url==='/api/survey/auth/csrf')return response({csrfToken:'synthetic-csrf'})
      if(url===base+'/assets')return init?.method==='POST'?uploadPending.promise:response({assets:[]})
      if(url===base+'/instruments?page=1')return response({list:[draft]})
      if(url===base+'/instruments/instrument'&&init?.method==='PATCH'){
        const patch=JSON.parse(String(init.body));patches.push(patch)
        if(patches.length===1)return savePending.promise
        draft={...draft,...patch,revision:3};return response(draft)
      }
      if(url===base+'/instruments/instrument')return response(draft)
      throw new Error('Unexpected route '+url)
    }))
    render(<SurveyBuilder projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:/图片工具.*FORM/}))
    fireEvent.change(await screen.findByLabelText('研究工具名称'),{target:{value:'保存中的工具'}})
    await user.upload(screen.getByLabelText('选择图片上传'),new File(['bytes'],'new.png',{type:'image/png'}))
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(patches).toHaveLength(1))
    await act(async()=>uploadPending.resolve(await response({assetId:'new-image',contentHash:'a'.repeat(64),
      mimeType:'image/png',originalName:'new.png',sizeBytes:5})))
    await screen.findByAltText('new')
    draft={...draft,title:'保存中的工具',revision:2}
    await act(async()=>savePending.resolve(await response(draft)))
    await waitFor(()=>expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled())
    expect(screen.getByAltText('new')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(patches).toHaveLength(2))
    expect(patches[1]).toMatchObject({revision:2,definition:{pages:[{questions:[{
      image:{asset:{assetId:'new-image'}},
    }]}]}})
    await screen.findByText('草稿已保存；发布冻结将在研究波次阶段执行')
    expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  })

  it('isolates a pending upload when switching copied Forms with identical page and item keys',async()=>{
    const user=userEvent.setup(),uploadPending=deferred<Response>()
    const draft=(id:string,title:string,prompt:string):ResearchDraft=>({id,projectId,
      instrumentKey:id,kind:'FORM',title,revision:1,status:'DRAFT',
      createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',
      definition:{schemaVersion:1,pages:[{pageKey:'copied-page',title:'同名页',questions:[{
        itemKey:'copied-item',type:'SHORT_TEXT',prompt,required:true,options:[],rows:[],
      }]}]}})
    const first=draft('first','第一份复制问卷','第一份题干')
    const second=draft('second','第二份复制问卷','第二份题干')
    const fetcher=vi.fn((url:string,init?:RequestInit)=>{
      if(url==='/api/survey/auth/csrf')return response({csrfToken:'synthetic-csrf'})
      if(url===base+'/assets')return init?.method==='POST'?uploadPending.promise:response({assets:[]})
      if(url===base+'/instruments?page=1')return response({list:[first,second]})
      if(url===base+'/instruments/first')return response(first)
      if(url===base+'/instruments/second')return response(second)
      throw new Error('Unexpected route '+url)
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyBuilder projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:/第一份复制问卷.*FORM/}))
    await screen.findByDisplayValue('第一份题干')
    await user.upload(screen.getByLabelText('选择图片上传'),new File(['bytes'],'old-image.png',{type:'image/png'}))
    await waitFor(()=>expect(fetcher.mock.calls.some(([url,init])=>url===base+'/assets'&&init?.method==='POST')).toBe(true))
    fireEvent.click(screen.getByRole('button',{name:/第二份复制问卷.*FORM/}))
    await screen.findByDisplayValue('第二份题干')
    await act(async()=>uploadPending.resolve(await response({assetId:'old-image',contentHash:'a'.repeat(64),
      mimeType:'image/png',originalName:'old-image.png',sizeBytes:5})))
    expect(screen.getByLabelText('研究工具名称')).toHaveValue('第二份复制问卷')
    expect(screen.getByLabelText('题干')).toHaveValue('第二份题干')
    expect(screen.queryByAltText('old-image')).toBeNull()
    expect(screen.getByRole('button',{name:'保存草稿'})).toBeDisabled()
  })

  const wave=(id:string,ordinal:number)=>({id,ordinal,title:'波次 '+ordinal,status:'OPEN',starts:1,
    finalCompleted:1,analysisIncluded:1,qualityExcluded:0,uniqueLinkedCodes:null,excluded:0})
  const items={waveId:'wave1',items:[],descriptiveScores:[],note:'仅属于第一波次的统计'}
  const ticket={id:'export1',status:'READY',format:'RAW_WAVE',expiresAt:'2030-01-01T00:00:00Z',
    pageNumber:1,manifest:{rowCount:1,columnCount:5}}
  const setupAnalytics=(readItems:()=>Promise<Response>,exportReply:()=>Promise<Response>)=>{
    const requests:{url:string;body:unknown}[]=[]
    vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
      requests.push({url,body:init?.body?JSON.parse(String(init.body)):undefined})
      if(url==='/api/survey/auth/csrf')return response({csrfToken:'synthetic-csrf'})
      if(url===base+'/analytics/overview')return response({projectId,collectionMode:'SINGLE_UNLINKED',
        source:'FINAL',note:'合成统计',waves:[wave('wave1',1),wave('wave2',2)]})
      if(url===base+'/analytics/quality/attempts?page=1')return response({list:[]})
      if(url===base+'/analytics/waves/wave1/items')return readItems()
      if(url===base+'/exports')return exportReply()
      throw new Error('Unexpected route '+url)
    }))
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    return requests
  }

  it('keeps the selected wave fixed while an item-statistics response is pending',async()=>{
    const pending=deferred<Response>(),user=userEvent.setup()
    setupAnalytics(()=>pending.promise,()=>response(ticket))
    fireEvent.click(await screen.findByRole('button',{name:'查看此波次题目频数与探索性得分'}))
    const select=screen.getAllByLabelText('波次',{exact:true})[0]
    await user.selectOptions(select,'wave2')
    await act(async()=>pending.resolve(await response(items)))
    await screen.findByText(items.note)
    expect(select).toHaveValue('wave1')
    expect(select).toBeEnabled()
    await user.selectOptions(select,'wave2')
    expect(select).toHaveValue('wave2')
    expect(screen.queryByText(items.note)).toBeNull()
  })

  it('keeps export filters bound to the pending ticket and unlocks them after completion',async()=>{
    const pending=deferred<Response>(),user=userEvent.setup()
    const requests=setupAnalytics(()=>response(items),()=>pending.promise)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    await waitFor(()=>expect(requests.some(row=>row.url===base+'/exports')).toBe(true))
    const select=screen.getAllByLabelText('波次',{exact:true})[1]
    const freeText=screen.getByRole('checkbox',{name:/包含自由文本原始回答/})
    await user.selectOptions(select,'wave2');await user.click(freeText)
    await act(async()=>pending.resolve(await response(ticket)))
    await screen.findByRole('button',{name:'下载当前批次 CSV、Codebook 与 Manifest'})
    expect(select).toHaveValue('wave1');expect(freeText).not.toBeChecked()
    expect(requests.find(row=>row.url===base+'/exports')?.body)
      .toEqual({format:'RAW_WAVE',waveId:'wave1',includeFreeText:false})
    await user.selectOptions(select,'wave2')
    expect(screen.queryByRole('button',{name:'下载当前批次 CSV、Codebook 与 Manifest'})).toBeNull()
  })

  it('invalidates a previous-wave export when refresh resets the shared selection',async()=>{
    const user=userEvent.setup()
    setupAnalytics(()=>response(items),()=>response(ticket))
    await screen.findByRole('button',{name:'创建受控导出'})
    await user.selectOptions(screen.getAllByLabelText('波次',{exact:true})[1],'wave2')
    fireEvent.click(screen.getByRole('button',{name:'创建受控导出'}))
    await screen.findByRole('button',{name:'下载当前批次 CSV、Codebook 与 Manifest'})
    fireEvent.click(screen.getByRole('button',{name:'刷新完成进度'}))
    await waitFor(()=>expect(screen.getAllByLabelText('波次',{exact:true})[1]).toHaveValue('wave1'))
    expect(screen.queryByRole('button',{name:'下载当前批次 CSV、Codebook 与 Manifest'})).toBeNull()
  })

  it('clears previous-wave statistics when the shared wave selection changes in the export controls',async()=>{
    const user=userEvent.setup()
    setupAnalytics(()=>response(items),()=>response(ticket))
    fireEvent.click(await screen.findByRole('button',{name:'查看此波次题目频数与探索性得分'}))
    await screen.findByText(items.note)
    await user.selectOptions(screen.getAllByLabelText('波次',{exact:true})[1],'wave2')
    expect(screen.getAllByLabelText('波次',{exact:true})[0]).toHaveValue('wave2')
    expect(screen.queryByText(items.note)).toBeNull()
  })
})
