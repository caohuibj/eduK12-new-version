import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyAnalyticsWorkspace} from './SurveyAnalyticsWorkspace'

const projectId='abcdef01-1111-4111-8111-111111111111'
const waveId='wave-01'
const ticketId='export01-2222-4222-8222-222222222222'
const base='/api/survey/projects/'+projectId
const baseName='survey_abcdef01_raw_wave_batch007_export01'
const response=(data:unknown)=>Promise.resolve({
  ok:true,json:async()=>({code:0,data,message:'ok'}),
} as Response)

// Synthetic server output: the UI must preserve CSV escaping and spreadsheet
// formula guards, rather than parse and reserialize these researcher-facing bytes.
const csvHeader='"research_code_or_attempt","wave_id","item_key","prompt","item_value"\r\n'
const ordinaryRows='"001230","wave-01","choice","他说：""你好""，世界 🌱\n第二行","0007"\r\n'
  +'"001230","wave-01","guarded_label","公式样式选项","\'=SUM(1,2)"\r\n'
const freeTextRow='"001230","wave-01","free_text","开放回答","\'+中文，""引号""\n下一行"\r\n'
const codebook={version:1,variables:[
  {columnKey:'item_value',label:'答案，含 "引号" 与中文',type:'string'},
]}
const ticket={id:ticketId,status:'READY',format:'RAW_WAVE',
  expiresAt:'2030-01-01T00:00:00.000Z',nextCursor:'synthetic-next-page',pageNumber:7,
  manifest:{rowCount:2,columnCount:5,batch:{phase:'VERIFIED_FINAL'}},
}
type Request={url:string;method:string;body:Record<string,unknown>|undefined}
type Download={filename:string;url:string;attached:boolean}
let responseTicket:typeof ticket
let requests:Request[]
let blobs:Blob[]
let downloads:Download[]
let artifact:{id:string;format:string;csv:string;codebook:unknown;manifest:unknown}
let downloadReply:(()=>Promise<Response>)|undefined

const readBytes=(blob:Blob)=>new Promise<Uint8Array>((resolve,reject)=>{
  const reader=new FileReader()
  reader.onerror=()=>reject(reader.error)
  reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer))
  reader.readAsArrayBuffer(blob)
})

beforeEach(()=>{
  vi.spyOn(window,'confirm').mockReturnValue(true)
  requests=[];blobs=[];downloads=[];responseTicket=structuredClone(ticket);downloadReply=undefined
  artifact={id:ticketId,format:'RAW_WAVE',csv:csvHeader+ordinaryRows,codebook,manifest:ticket.manifest}
  // Keep the real DOM Blob and FileReader; only the browser's URL/download
  // boundary is mocked so the test can inspect actual encoded file contents.
  vi.stubGlobal('URL',class extends URL {
    static createObjectURL(blob:Blob){
      blobs.push(blob)
      return 'blob:survey-download-'+blobs.length
    }
    static revokeObjectURL=vi.fn()
  })
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){
    downloads.push({filename:this.download,url:this.href,attached:this.isConnected})
  })
  vi.spyOn(window,'setTimeout')
  vi.stubGlobal('fetch',vi.fn((url:string,init?:RequestInit)=>{
    const method=init?.method??'GET'
    const body=init?.body===undefined?undefined:JSON.parse(String(init.body)) as Record<string,unknown>
    requests.push({url,method,body})
    if(url==='/api/survey/auth/csrf'&&method==='GET')return response({csrfToken:'synthetic-csrf'})
    if(url===base+'/analytics/overview'&&method==='GET')return response({
      projectId,collectionMode:'SINGLE_UNLINKED',source:'FINAL',note:'合成研究数据',
      waves:[{id:waveId,ordinal:1,title:'测试波次',status:'OPEN',starts:1,
        finalCompleted:1,analysisIncluded:1,qualityExcluded:0,uniqueLinkedCodes:null,excluded:0}],
    })
    if(url===base+'/analytics/quality/attempts?page=1'&&method==='GET')return response({list:[]})
    if(url===base+'/analytics/waves/'+waveId+'/items')return response({waveId,items:[],note:'仅为描述',completedFinals:3,fullCompletionAttempts:2,earlyCompletionAttempts:1,descriptiveScores:[{instrumentKey:'cog',scoreKey:'goMedianRtMs',validN:2,mean:320,sampleSd:20,unit:'ms',qualityCounts:{interpretable:1,limited:1},completionCounts:{COMPLETE:2},provenance:{kind:'COGNITIVE',measurementDigest:'digest-frozen',scoringVersion:'1.0.0',engineVersion:'1.0.0',timingPolicy:'software-frame-v1'}}]})
    if(url===base+'/exports'&&method==='POST')return response(responseTicket)
    if(url===base+'/exports/'+ticketId+'/download'&&method==='GET')return downloadReply?downloadReply():response(artifact)
    throw new Error('Unexpected request '+method+' '+url)
  }))
})
afterEach(()=>{
  for(const result of vi.mocked(window.setTimeout).mock.results){
    if(result.type==='return')window.clearTimeout(result.value)
  }
  vi.restoreAllMocks();vi.unstubAllGlobals()
})

describe('Survey analytics artifact downloads',()=>{
  it.each(['ATTENDANCE_COMPACT_V1','ATTENDANCE_COMPACT_V2'])('labels and downloads %s as a separate attendance relation',async representation=>{
    responseTicket={...ticket,manifest:{...ticket.manifest,batch:{phase:'NON_FINAL_PARTICIPATION',representation}}} as typeof ticket
    artifact={id:ticketId,format:'RAW_WAVE',csv:'"research_code","wave_id","variant_key"\r\n"R-1","wave-01","a"\r\n',
      codebook:[],manifest:responseTicket.manifest}
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    expect(await screen.findByText(/已生成紧凑参与状态表/)).toBeInTheDocument()
    expect(screen.getByText(/本批为独立参与状态表/)).toBeInTheDocument()
    for(const label of ['CSV','Codebook','Manifest']){
      fireEvent.click(screen.getByRole('button',{name:'下载 '+label}))
      await screen.findByRole('button',{name:'重新发起 '+label})
    }
    expect(downloads).toHaveLength(3)
    expect(downloads.map(d=>d.filename)).toEqual([
      'survey_abcdef01_raw_wave_batch007_attendance_export01.csv',
      'survey_abcdef01_raw_wave_batch007_attendance_export01_codebook.json',
      'survey_abcdef01_raw_wave_batch007_attendance_export01_manifest.json',
    ])
    expect(screen.getByRole('status')).toHaveTextContent('网页无法确认文件已落盘')
    expect(downloads[0].filename).toBe('survey_abcdef01_raw_wave_batch007_attendance_export01.csv')
    const bytes=await readBytes(blobs[0])
    expect([...bytes.slice(3)]).toEqual([...new TextEncoder().encode(artifact.csv)])
  })

  it('renders server units, version identity, quality and full/early completion counts',async()=>{
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'查看此波次题目频数与探索性得分'}))
    expect(await screen.findByText(/单位：ms/)).toBeInTheDocument()
    expect(screen.getByText(/质量状态：interpretable 1；limited 1/)).toBeInTheDocument()
    expect(screen.getByText(/完整完成：2；提前结束：1/)).toBeInTheDocument()
    expect(screen.getByText(/冻结测量：digest-frozen/)).toBeInTheDocument()
  })
  it('uses the bounded cognitive trial export with mandatory wave and no free-text disclosure',async()=>{
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    await screen.findByRole('button',{name:'创建受控导出'})
    fireEvent.change(screen.getByLabelText('数据格式'),{target:{value:'COGNITIVE_TRIAL_LONG'}})
    expect(screen.queryByRole('checkbox',{name:/包含自由文本原始回答/})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'创建受控导出'}))
    await screen.findByRole('button',{name:'下载 CSV'})
    expect(requests.filter(r=>r.url===base+'/exports')[0].body).toEqual({format:'COGNITIVE_TRIAL_LONG',waveId})
    expect(screen.getByText(/认知试次按行与字节预算分批导出/)).toBeInTheDocument()
  })

  it.each([false,true])('preserves native CSV and JSON downloads with includeFreeText=%s',async(includeFreeText)=>{
    const manifest={format:'RAW_WAVE',includeFreeText,rowCount:includeFreeText?3:2,
      columnCount:5,batch:{phase:'VERIFIED_FINAL',pageNumber:7},
      note:'请保留编码与逐批清单',
    }
    artifact={id:ticketId,format:'RAW_WAVE',
      csv:csvHeader+ordinaryRows+(includeFreeText?freeTextRow:''),codebook,manifest,
    }
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    const create=await screen.findByRole('button',{name:'创建受控导出'})
    const freeText=screen.getByRole('checkbox',{name:/包含自由文本原始回答/})
    expect(freeText).not.toBeChecked()
    if(includeFreeText){
      fireEvent.click(freeText)
      expect(freeText).toBeChecked()
    }
    fireEvent.click(create)
    const download=await screen.findByRole('button',{name:'下载 CSV'})
    await waitFor(()=>expect(download).toBeEnabled())
    const nextPage=screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'})
    expect(nextPage).toBeDisabled()
    const exportRequests=()=>requests.filter(r=>r.url===base+'/exports')
    expect(exportRequests()).toEqual([{url:base+'/exports',method:'POST',
      body:{format:'RAW_WAVE',waveId,includeFreeText},
    }])

    fireEvent.click(download)
    await screen.findByRole('button',{name:'重新发起 CSV'})
    expect(downloads).toHaveLength(1)
    expect(nextPage).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('请在浏览器下载列表核对是否保存')
    expect(exportRequests()).toHaveLength(1)
    expect(requests.filter(r=>r.url.endsWith('/download'))).toEqual([{
      url:base+'/exports/'+ticketId+'/download',method:'GET',body:undefined,
    }])
    for(const label of ['Codebook','Manifest']){
      fireEvent.click(screen.getByRole('button',{name:'下载 '+label}))
      await screen.findByRole('button',{name:'重新发起 '+label})
    }
    expect(nextPage).toBeEnabled()
    expect(requests.filter(r=>r.url.endsWith('/download'))).toHaveLength(3)
    expect(downloads).toEqual([
      {filename:baseName+'.csv',url:'blob:survey-download-1',attached:true},
      {filename:baseName+'_codebook.json',url:'blob:survey-download-2',attached:true},
      {filename:baseName+'_manifest.json',url:'blob:survey-download-3',attached:true},
    ])
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    expect(blobs).toHaveLength(3)
    for(const blob of blobs)expect(blob).toBeInstanceOf(Blob)
    expect(blobs.map(blob=>blob.type)).toEqual([
      'text/csv;charset=utf-8','application/json;charset=utf-8','application/json;charset=utf-8',
    ])
    const [csvBytes,codebookBytes,manifestBytes]=await Promise.all(blobs.map(readBytes))
    const encoder=new TextEncoder()
    expect([...csvBytes.slice(0,3)]).toEqual([0xef,0xbb,0xbf])
    // Exact remaining bytes also prove one BOM only, preserved leading zeroes,
    // quoted Unicode/newlines, escaped quotes, and apostrophe formula guards.
    expect([...csvBytes.slice(3)]).toEqual([...encoder.encode(artifact.csv)])
    expect([...codebookBytes]).toEqual([...encoder.encode(JSON.stringify(codebook,null,2))])
    expect([...manifestBytes]).toEqual([...encoder.encode(JSON.stringify(manifest,null,2))])
    expect(JSON.parse(new TextDecoder().decode(codebookBytes))).toEqual(codebook)
    expect(JSON.parse(new TextDecoder().decode(manifestBytes))).toEqual(manifest)
    expect(exportRequests()).toHaveLength(1)
  })

  it('hands the exact signed cursor to the next batch only after three explicit file actions',async()=>{
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    for(const label of ['CSV','Codebook','Manifest']){
      fireEvent.click(await screen.findByRole('button',{name:'下载 '+label}))
      await screen.findByRole('button',{name:'重新发起 '+label})
    }
    const readsBefore=requests.filter(r=>r.url.endsWith('/download')).length
    responseTicket={...ticket,id:'next-export-3333',pageNumber:8,nextCursor:'next-signed-cursor'}
    fireEvent.click(screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'}))
    await screen.findByText(/第 8 批有效 FINAL 已生成/)
    expect(requests.filter(r=>r.method==='POST'&&r.url===base+'/exports').map(r=>r.body)).toEqual([
      {format:'RAW_WAVE',waveId,includeFreeText:false},
      {format:'RAW_WAVE',waveId,includeFreeText:false,cursor:'synthetic-next-page'},
    ])
    expect(requests.filter(r=>r.url.endsWith('/download'))).toHaveLength(readsBefore)
    for(const label of ['CSV','Codebook','Manifest']){
      expect(screen.getByRole('button',{name:'下载 '+label})).toBeEnabled()
      expect(screen.getByText(label+'：尚未发起')).toBeInTheDocument()
    }
    expect(screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeDisabled()
  })

  it.each(['network','non-json','safari-non-json',403,429])('keeps the original ticket after %s read failure and retries only the selected file',async failure=>{
    downloadReply=()=>failure==='network'?Promise.reject(new TypeError('synthetic connection lost')):
      failure==='safari-non-json'?Promise.reject(new DOMException('The string did not match the expected pattern.','SyntaxError')):
      failure==='non-json'?Promise.resolve(new Response('<html>synthetic failure</html>',{status:200})):
      Promise.resolve(new Response(JSON.stringify({code:-1,message:'synthetic rejection '+failure,data:null}),{status:Number(failure)}))
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    fireEvent.click(await screen.findByRole('button',{name:'下载 Codebook'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Codebook 内容获取失败，尚未发起本次文件下载')
    expect(within(screen.getByRole('region',{name:'当前导出批次'})).getByRole('alert')).toHaveTextContent('Codebook 内容获取失败')
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    if(failure==='network'||failure==='non-json'||failure==='safari-non-json')expect(screen.getByRole('alert')).toHaveTextContent('未能读取服务器文件内容，请检查连接后重试此文件')
    expect(downloads).toHaveLength(0)
    expect(screen.getByText('Codebook：尚未发起')).toBeInTheDocument()
    expect(requests.filter(r=>r.method==='POST'&&r.url===base+'/exports')).toHaveLength(1)
    downloadReply=undefined
    fireEvent.click(screen.getByRole('button',{name:'下载 Codebook'}))
    await screen.findByRole('button',{name:'重新发起 Codebook'})
    expect(downloads.map(d=>d.filename)).toEqual([baseName+'_codebook.json'])
    expect(requests.filter(r=>r.url.endsWith('/download'))).toHaveLength(2)
    expect(requests.filter(r=>r.method==='POST'&&r.url===base+'/exports')).toHaveLength(1)
    expect(screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeDisabled()
  })

  it('does not launch a file from a mismatched export receipt',async()=>{
    artifact={...artifact,id:'different-ticket'}
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    fireEvent.click(await screen.findByRole('button',{name:'下载 CSV'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('导出回执与当前批次不一致或内容不完整')
    expect(blobs).toHaveLength(0)
    expect(screen.queryByRole('button',{name:'重新发起 CSV'})).toBeNull()
  })

  it('clears per-file launch status when creating a different format without automatically fetching files',async()=>{
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    fireEvent.click(await screen.findByRole('button',{name:'下载 CSV'}))
    await screen.findByRole('button',{name:'重新发起 CSV'})
    fireEvent.change(screen.getByLabelText('数据格式'),{target:{value:'COGNITIVE_TRIAL_LONG'}})
    expect(screen.queryByRole('button',{name:'重新发起 CSV'})).toBeNull()
    responseTicket={...ticket,format:'COGNITIVE_TRIAL_LONG'}
    fireEvent.click(screen.getByRole('button',{name:'创建受控导出'}))
    await screen.findByRole('button',{name:'下载 CSV'})
    expect(screen.getByText('CSV：尚未发起')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeDisabled()
    expect(downloads).toHaveLength(1)
    expect(requests.filter(r=>r.url.endsWith('/download'))).toHaveLength(1)
  })

  it('cleans a failed browser launch and allows an explicit original-file retry without false saved status',async()=>{
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementationOnce(()=>{throw new Error('synthetic browser launch failure')})
    render(<SurveyAnalyticsWorkspace projectId={projectId}/>)
    fireEvent.click(await screen.findByRole('button',{name:'创建受控导出'}))
    fireEvent.click(await screen.findByRole('button',{name:'下载 CSV'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('下载发起结果未确认')
    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
    expect(vi.mocked(window.setTimeout)).toHaveBeenCalledWith(expect.any(Function),3000)
    expect(screen.queryByRole('button',{name:'重新发起 CSV'})).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'下载 CSV'}))
    await screen.findByRole('button',{name:'重新发起 CSV'})
    expect(downloads).toHaveLength(1)
    expect(requests.filter(r=>r.method==='POST'&&r.url===base+'/exports')).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent('网页无法确认文件已落盘')
  })
})
