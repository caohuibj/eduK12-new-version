import {fireEvent,render,screen,waitFor} from '@testing-library/react'
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
let requests:Request[]
let blobs:Blob[]
let downloads:Download[]
let artifact:{id:string;format:string;csv:string;codebook:unknown;manifest:unknown}

const readBytes=(blob:Blob)=>new Promise<Uint8Array>((resolve,reject)=>{
  const reader=new FileReader()
  reader.onerror=()=>reject(reader.error)
  reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer))
  reader.readAsArrayBuffer(blob)
})

beforeEach(()=>{
  requests=[];blobs=[];downloads=[]
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
    if(url===base+'/exports'&&method==='POST')return response(ticket)
    if(url===base+'/exports/'+ticketId+'/download'&&method==='GET')return response(artifact)
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
    const download=await screen.findByRole('button',{name:'下载当前批次 CSV、Codebook 与 Manifest'})
    await waitFor(()=>expect(download).toBeEnabled())
    const nextPage=screen.getByRole('button',{name:'当前批次已下载，生成下一批'})
    expect(nextPage).toBeDisabled()
    const exportRequests=()=>requests.filter(r=>r.url===base+'/exports')
    expect(exportRequests()).toEqual([{url:base+'/exports',method:'POST',
      body:{format:'RAW_WAVE',waveId,includeFreeText},
    }])

    fireEvent.click(download)
    await screen.findByText('已下载当前批次 CSV、变量编码字典和 Manifest，请保管敏感数据。')
    expect(nextPage).toBeEnabled()
    expect(exportRequests()).toHaveLength(1)
    expect(requests.filter(r=>r.url.endsWith('/download'))).toEqual([{
      url:base+'/exports/'+ticketId+'/download',method:'GET',body:undefined,
    }])
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
})
