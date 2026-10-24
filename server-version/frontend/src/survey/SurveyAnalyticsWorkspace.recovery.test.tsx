import {act,fireEvent,render,screen,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {SurveyAnalyticsWorkspace} from './SurveyAnalyticsWorkspace'

const start=Date.parse('2032-01-02T03:04:05.000Z')
const project='abcdef01-1111-4111-8111-111111111111'
const wave='11111111-2222-4333-8444-555555555555'
type Ticket={id:string;format:string;status:string;expiresAt:string;pageNumber:number;nextCursor:string|null;
  manifest:{rowCount:number;columnCount:number;sourceCutOff:string;sourceProjectRevision:number;
    generatedAt:string;batch:{phase:string;representation:string}}}
type Request={url:string;method:string;body:Record<string,unknown>|undefined}
let requests:Request[],tickets:Map<string,Ticket>,files:string[],serial:number,readCount:number
let frozenCutOff:string
let postReply:((body:Record<string,unknown>)=>Promise<Response>)|undefined
let readReply:((ticket:Ticket)=>Promise<Response>)|undefined
const reply=(data:unknown)=>Promise.resolve(new Response(JSON.stringify({code:0,data,message:'ok'})))
const reject=(status:number,message:string,headers?:HeadersInit)=>Promise.resolve(new Response(
  JSON.stringify({code:-1,data:null,message}),{status,headers}))
const makeTicket=(page:number):Ticket=>({id:'synthetic-ticket-'+(++serial),status:'READY',
  format:'COGNITIVE_TRIAL_LONG',pageNumber:page,nextCursor:'signed-page-'+(page+1),
  expiresAt:new Date(Date.now()+600000).toISOString(),manifest:{rowCount:2,columnCount:4,
    sourceCutOff:frozenCutOff,sourceProjectRevision:7,
    generatedAt:new Date(Date.now()).toISOString(),
    batch:{phase:'VERIFIED_FINAL',representation:'FINAL_BOUND_CHILD_TRIAL_ROWS'}}})
const artifact=(ticket:Ticket)=>({id:ticket.id,format:ticket.format,csv:'"trial","value"\r\n"1","a"\r\n',
  codebook:{variables:[]},manifest:ticket.manifest})
const posts=()=>requests.filter(r=>r.method==='POST'&&r.url.endsWith('/exports'))
const last=<T,>(rows:T[])=>rows[rows.length-1]
const reads=()=>requests.filter(r=>r.url.includes('/download?part='))
const card=()=>within(screen.getByRole('region',{name:'当前导出批次'}))
const click=async(name:string|RegExp)=>{await act(async()=>{fireEvent.click(screen.getByRole('button',{name}))})}
const tick=async(ms:number)=>{await act(async()=>{vi.advanceTimersByTime(ms)})}
const collect=async()=>{for(const name of ['CSV','Codebook','Manifest'])await click('下载 '+name)}
async function mount(configure?:()=>void){
  const view=render(<SurveyAnalyticsWorkspace projectId={project}/>)
  await act(async()=>{})
  fireEvent.change(screen.getByLabelText('数据格式'),{target:{value:'COGNITIVE_TRIAL_LONG'}})
  configure?.()
  await click('生成导出文件')
  return view
}
async function secondPage(){await mount();await collect();await click('生成下一批（请先核对本批文件）')}
function deferred<T>(){
  let resolve!:(value:T)=>void
  let reject!:(error:Error)=>void
  const promise=new Promise<T>((r,j)=>{resolve=r;reject=j})
  return {promise,resolve,reject}
}

beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date','setInterval','clearInterval']});vi.setSystemTime(start)
  requests=[];tickets=new Map();files=[];serial=0;readCount=0;postReply=undefined;readReply=undefined
  frozenCutOff=new Date(start-1000).toISOString()
  vi.spyOn(window,'confirm').mockReturnValue(true)
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){files.push(this.download)})
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=> 'blob:synthetic');static revokeObjectURL=vi.fn()})
  vi.stubGlobal('fetch',vi.fn(async(url:string,init?:RequestInit)=>{
    const method=init?.method??'GET'
    const body=init?.body?JSON.parse(String(init.body)) as Record<string,unknown>:undefined
    requests.push({url,method,body})
    if(url==='/api/survey/auth/csrf')return reply({csrfToken:'synthetic-csrf'})
    if(url==='/api/survey/auth/mfa/step-up')return reply({verified:true})
    if(url.endsWith('/analytics/overview'))return reply({collectionMode:'SINGLE_UNLINKED',waves:[
      {id:wave,ordinal:1,title:'synthetic wave',status:'OPEN',starts:14,finalCompleted:14,
        analysisIncluded:14,qualityExcluded:0,uniqueLinkedCodes:null,excluded:0}]})
    if(url.endsWith('/analytics/quality/attempts?page=1'))return reply({list:[]})
    if(url.endsWith('/exports')&&method==='POST'){
      if(postReply)return postReply(body!)
      const page=body?.cursor?Number(last(String(body.cursor).split('-'))):1
      if(!body?.cursor)frozenCutOff=new Date(Date.now()-1000).toISOString()
      const ticket=makeTicket(page);ticket.format=String(body?.format);tickets.set(ticket.id,ticket)
      return reply(ticket)
    }
    if(url.includes('/download?part=')){
      const segments=url.split('/'),ticket=tickets.get(segments[segments.length-2])!
      readCount++
      return readReply?readReply(ticket):reply(artifact(ticket))
    }
    throw new Error('unexpected synthetic request')
  }))
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})

describe('bounded export recovery contracts (component simulation, not real Redis/browser)',()=>{
  it.each(['completion filter','workspace refresh'])('remembers launched earlier pages after %s invalidates an untouched next page',async invalidation=>{
    await secondPage()
    expect(card().getByText(/第 2 批 ·/)).toBeInTheDocument()
    expect(card().getByText('CSV：尚未发起')).toBeInTheDocument()
    if(invalidation==='completion filter'){
      fireEvent.change(screen.getByLabelText('完成时间起点（含）'),{target:{value:'2031-06-01T09:00'}})
    }else await click('刷新完成进度')
    expect(screen.queryByRole('region',{name:'当前导出批次'})).toBeNull()
    expect(screen.getByText(/旧票据 .*第 1 批.*CSV、Codebook、Manifest 曾发起/)).toBeInTheDocument()
    vi.mocked(window.confirm).mockReturnValue(false)
    await click('生成导出文件')
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('旧的部分文件不能与新导出混作同一批'))
    expect(posts()).toHaveLength(2);expect(reads()).toHaveLength(3);expect(files).toHaveLength(3)
    vi.mocked(window.confirm).mockReturnValue(true)
    await click('生成导出文件')
    expect(posts()).toHaveLength(3)
    expect(last(posts())?.body).toMatchObject({format:'COGNITIVE_TRIAL_LONG',waveId:wave})
    expect(last(posts())?.body).not.toHaveProperty('cursor')
    if(invalidation==='completion filter')expect(last(posts())?.body?.completedFrom).toBe(new Date('2031-06-01T09:00').toISOString())
    expect(reads()).toHaveLength(3);expect(files).toHaveLength(3)
  })

  it('keeps page 14 after GET 41 is rate limited, waits through expiry, then explicitly rebuilds its incoming cursor',async()=>{
    readReply=t=>Date.now()<start+900000&&readCount>40
      ?reject(429,'请求过于频繁，请稍后再试',{'Retry-After':'900'}):reply(artifact(t))
    await mount(()=>fireEvent.change(screen.getByLabelText('完成时间起点（含）'),{target:{value:'2031-06-01T09:00'}}))
    for(let page=1;page<=13;page++){await collect();await click('生成下一批（请先核对本批文件）')}
    await click('下载 CSV');await click('下载 Codebook')
    expect(reads()).toHaveLength(41);expect(files).toHaveLength(40);expect(posts()).toHaveLength(14)
    expect(card().getByText('CSV：已发起，请核对保存')).toBeInTheDocument()
    expect(card().getByText('Codebook：尚未发起')).toBeInTheDocument()
    expect(screen.getByText(/剩余 900 秒/)).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'下载 Codebook'})).toBeDisabled()
    await tick(600001)
    expect(screen.getByRole('button',{name:'重新生成当前第 14 批'})).toBeDisabled()
    await tick(300000)
    expect(reads()).toHaveLength(41);expect(posts()).toHaveLength(14)
    await click('重新生成当前第 14 批')
    expect(posts()).toHaveLength(15)
    expect(last(posts())?.body).toEqual({format:'COGNITIVE_TRIAL_LONG',waveId:wave,
      completedFrom:new Date('2031-06-01T09:00').toISOString(),cursor:'signed-page-14'})
    expect(card().getByText(/第 14 批 ·/)).toBeInTheDocument()
    for(const name of ['CSV','Codebook','Manifest'])expect(card().getByText(name+'：尚未发起')).toBeInTheDocument()
    expect(screen.getByText(/旧票据 .*第 14 批.*CSV 曾发起/)).toBeInTheDocument()
    expect(reads()).toHaveLength(41);expect(files).toHaveLength(40)
    expect(screen.getAllByRole('status').some(x=>x.textContent?.includes('generatedAt 会变化'))).toBe(true)
    await collect()
    expect(reads()).toHaveLength(44);expect(files).toHaveLength(43)
    expect(screen.getByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeEnabled()
  })

  it('requires confirmation for a new-watermark first-page restart and preserves canceled/old file state',async()=>{
    await mount();await click('下载 CSV');await tick(600001)
    const original=last([...tickets.values()])
    expect(screen.queryByRole('button',{name:'重新生成当前第 1 批'})).toBeNull()
    expect(screen.getByText(/首批原本没有入站游标/)).toBeInTheDocument()
    vi.mocked(window.confirm).mockReturnValue(false)
    await click('重新开始完整导出（新水位）')
    expect(posts()).toHaveLength(1);expect(reads()).toHaveLength(1);expect(files).toHaveLength(1)
    expect(card().getByText('CSV：已发起，请核对保存')).toBeInTheDocument()
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('旧的部分文件不能与新导出混作同一批'))
    vi.mocked(window.confirm).mockReturnValue(true)
    await click('重新开始完整导出（新水位）')
    expect(last(posts())?.body).toEqual({format:'COGNITIVE_TRIAL_LONG',waveId:wave})
    expect(posts()).toHaveLength(2);expect(reads()).toHaveLength(1);expect(files).toHaveLength(1)
    expect(card().getByText('CSV：尚未发起')).toBeInTheDocument()
    expect(screen.getByText(/旧票据 .*CSV 曾发起/)).toBeInTheDocument()
    const restarted=last([...tickets.values()])
    expect(restarted.manifest.sourceCutOff).not.toBe(original.manifest.sourceCutOff)
    expect(restarted.manifest.generatedAt).not.toBe(original.manifest.generatedAt)
  })

  it.each([404,410])('rebuilds an unavailable %s last page without nextCursor and resets its file group',async status=>{
    await mount();await collect()
    postReply=()=>{
      const terminal={...makeTicket(2),nextCursor:null};tickets.set(terminal.id,terminal);return reply(terminal)
    }
    await click('生成下一批（请先核对本批文件）');postReply=undefined;await click('下载 CSV')
    expect(screen.queryByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeNull()
    // Recovering a terminal page uses its incoming proof, not a nonexistent next proof.
    readReply=()=>reject(status,'导出已过期、撤销或不存在')
    await click('下载 Codebook')
    postReply=async body=>{
      expect(body.cursor).toBe('signed-page-2')
      const next={...makeTicket(2),nextCursor:null};tickets.set(next.id,next);return reply(next)
    }
    await click('重新生成当前第 2 批')
    expect(screen.queryByRole('button',{name:'生成下一批（请先核对本批文件）'})).toBeNull()
    expect(card().getByText('CSV：尚未发起')).toBeInTheDocument()
    expect(reads()).toHaveLength(5);expect(posts()).toHaveLength(3)
  })

  it.each([400,409])('stops a rejected continuation (%s) without falling back to a fresh snapshot',async status=>{
    await secondPage();await tick(600001)
    postReply=()=>reject(status,status===400?'研究导出分页凭证无效或已过期':'研究样本或项目版本变化')
    await click('重新生成当前第 2 批')
    expect(posts()).toHaveLength(3);expect(last(posts())?.body?.cursor).toBe('signed-page-2')
    expect(screen.getByText(/已停止此导出链/)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'重新生成当前第 2 批'})).toBeNull()
    expect(screen.getByRole('button',{name:'下载 CSV'})).toBeDisabled()
    await tick(3600000)
    expect(posts()).toHaveLength(3);expect(files).toHaveLength(3)
    vi.mocked(window.confirm).mockReturnValue(false)
    await click('重新开始完整导出（新水位）')
    expect(posts()).toHaveLength(3)
  })

  it('requires explicit recovery after MFA, with no automatic POST after step-up',async()=>{
    await secondPage();await tick(600001)
    postReply=()=>reject(403,'需要最近五分钟的 TOTP 二次验证')
    await click('重新生成当前第 2 批')
    expect(posts()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('动态验证码'),{target:{value:'123456'}})
    await click('验证身份')
    expect(posts()).toHaveLength(3);expect(reads()).toHaveLength(3)
    postReply=undefined
    await click('重新生成当前第 2 批')
    expect(posts()).toHaveLength(4);expect(last(posts())?.body?.cursor).toBe('signed-page-2')
  })

  it('honors an HTTP-date Retry-After even for a non-JSON 429 without automatic requests',async()=>{
    await mount()
    readReply=()=>Promise.resolve(new Response('<html>rate limited</html>',{status:429,
      headers:{'Retry-After':new Date(start+120000).toUTCString()}}))
    await click('下载 CSV')
    expect(screen.getByText(/剩余 120 秒/)).toBeInTheDocument()
    await tick(120001)
    expect(reads()).toHaveLength(1);expect(posts()).toHaveLength(1)
    expect(screen.getByRole('button',{name:'下载 CSV'})).toBeEnabled()
  })

  it('does not duplicate a recovery POST on rapid clicks or after an unknown network result',async()=>{
    await secondPage();await tick(600001)
    const pending=deferred<Response>();postReply=()=>pending.promise
    const button=screen.getByRole('button',{name:'重新生成当前第 2 批'})
    await act(async()=>{fireEvent.click(button);fireEvent.click(button)})
    expect(posts()).toHaveLength(3)
    await act(async()=>{pending.reject(new TypeError('synthetic unknown network outcome'))})
    await tick(10000)
    expect(posts()).toHaveLength(3);expect(reads()).toHaveLength(3)
  })

  it('rejects a recovered ticket from another source revision rather than replacing the current page',async()=>{
    await secondPage();await tick(600001)
    postReply=()=>reply({...makeTicket(2),manifest:{...makeTicket(2).manifest,sourceProjectRevision:8}})
    await click('重新生成当前第 2 批')
    expect(card().getByRole('alert')).toHaveTextContent('冻结来源不一致')
    expect(screen.getByText(/已停止此导出链/)).toBeInTheDocument()
    expect(reads()).toHaveLength(3)
  })

  it.each(['success','rejection'])('ignores an old ticket read %s after a filter invalidates it',async result=>{
    await mount();const old=last([...tickets.values()])!
    const pending=deferred<Response>();readReply=()=>pending.promise
    await click('下载 CSV')
    fireEvent.change(screen.getByLabelText('完成时间起点（含）'),{target:{value:'2031-01-01T00:00'}})
    await act(async()=>{
      if(result==='success')pending.resolve(await reply(artifact(old)))
      else pending.reject(new TypeError('synthetic stale read rejection'))
    })
    expect(files).toHaveLength(0);expect(screen.queryByRole('region',{name:'当前导出批次'})).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    readReply=undefined
    await click('生成导出文件')
    expect(last(posts())?.body).toMatchObject({format:'COGNITIVE_TRIAL_LONG',completedFrom:expect.any(String)})
    expect(last(posts())?.body).not.toHaveProperty('cursor')
  })

  it('ignores a stale recovery response after project changes, without leaking its page or cursor',async()=>{
    const view=await mount();await collect();await click('生成下一批（请先核对本批文件）');await tick(600001)
    const pending=deferred<Response>();postReply=()=>pending.promise
    await click('重新生成当前第 2 批')
    const newer=project.replace('abcdef01','abcdef02')
    view.rerender(<SurveyAnalyticsWorkspace projectId={newer}/>)
    await act(async()=>{pending.resolve(await reply(makeTicket(2)))})
    expect(reads()).toHaveLength(3)
    expect(screen.queryByRole('region',{name:'当前导出批次'})).toBeNull()
    postReply=undefined
    await click('生成导出文件')
    expect(last(posts())?.url).toBe('/api/survey/projects/'+newer+'/exports')
    expect(last(posts())?.body).not.toHaveProperty('cursor')
  })

  it('never launches a late ticket response after the workspace unmounts',async()=>{
    const view=await mount(),old=last([...tickets.values()])
    const pending=deferred<Response>();readReply=()=>pending.promise
    await click('下载 CSV');view.unmount()
    await act(async()=>{pending.resolve(await reply(artifact(old)))})
    expect(files).toHaveLength(0);expect(reads()).toHaveLength(1)
  })

  it('continues a fully launched page after its ticket expires without regenerating or rereading it',async()=>{
    await mount();await collect();await tick(600001)
    await click('生成下一批（请先核对本批文件）')
    expect(posts()).toHaveLength(2);expect(last(posts())?.body?.cursor).toBe('signed-page-2')
    expect(reads()).toHaveLength(3);expect(card().getByText(/第 2 批 ·/)).toBeInTheDocument()
  })
})
