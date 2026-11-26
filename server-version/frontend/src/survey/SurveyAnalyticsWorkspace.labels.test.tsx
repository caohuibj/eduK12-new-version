import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyAnalyticsWorkspace} from './SurveyAnalyticsWorkspace'

vi.mock('./SurveyGroupReports',()=>({SurveyGroupReports:()=>null}))
vi.mock('./StoredPackageReports',()=>({StoredPackageReports:()=>null}))
vi.mock('./SurveyPrivateReferenceStudio',()=>({SurveyPrivateReferenceStudio:()=>null}))
vi.mock('./SurveyStoredReportReader',()=>({SurveyStoredReportReader:()=>null}))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
const types=['SINGLE','MULTIPLE','LIKERT','MATRIX','MATRIX_MULTIPLE','RANK_ORDER'] as const
const options=[{code:'stable_yes',label:'同意'},{code:'stable_no',label:'不同意'}]
const missingByReason={SHOWN_MISSING:1,NOT_SHOWN:2,REFUSED:3,UNABLE_TO_JUDGE:4,NEW_REASON:5,constructor:6}
const rows=types.map((responseType,index)=>({itemKey:responseType.toLowerCase(),instrumentKey:'form',prompt:responseType+' 题目',kind:'FORM',respondentN:7,
  responseType,options,frequencies:[{value:responseType==='RANK_ORDER'?'stable_yes@rank2':'stable_yes',count:index+1}],
  combinationFrequencies:['MULTIPLE','MATRIX_MULTIPLE'].includes(responseType)?[{value:'["stable_yes","stable_no"]',count:2},{value:'[]',count:1},{value:'["unknown","stable_yes"]',count:1}]:[],
  missingByReason,numericMean:null,numericSampleSd:null}))
const legacy={...rows[0],itemKey:'legacy',prompt:'旧响应题目',options:undefined,frequencies:[{value:'legacy_key',count:8},{value:'constructor',count:2}],missingByReason:{}}
const unknown={...rows[0],itemKey:'unknown',prompt:'未知选项题目',frequencies:[{value:'unmapped_key',count:9}],missingByReason:{}}
function setup(){
  const requests:{url:string;method:string;body?:Record<string,unknown>}[]=[]
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET',body=init?.body?JSON.parse(String(init.body)):undefined
    requests.push({url,method,body})
    let data:unknown
    if(url.endsWith('/analytics/overview'))data={projectId:'project',collectionMode:'SINGLE_UNLINKED',note:'合成概览',source:'verified',waves:[{id:'wave',ordinal:1,title:'合成波次',status:'OPEN',starts:7,completedTotal:7,finalCompleted:7,analysisIncluded:7,qualityExcluded:0,uniqueLinkedCodes:null,excluded:0}]}
    else if(url.includes('/analytics/quality/attempts?'))data={list:[]}
    else if(url.endsWith('/auth/csrf'))data={csrfToken:'synthetic'}
    else if(url.endsWith('/items/dictionary'))data={variables:rows.map(q=>({instrumentKey:q.instrumentKey,itemKey:q.itemKey,prompt:q.prompt,responseType:q.responseType,kind:q.kind,columnKey:q.itemKey}))}
    else if(url.endsWith('/items/paged'))data={...rows.find(q=>q.itemKey===body?.itemKey),analysisFinalCount:7,complete:true,sourceCutOff:'2026-11-26T00:00:00Z',note:'完整分批统计'}
    else if(url.endsWith('/items'))data={waveId:'wave',items:[...rows,legacy,unknown],descriptiveScores:[],note:'冻结字典合成统计'}
    else throw Error('Unexpected request '+url)
    return {ok:true,status:200,json:async()=>({code:0,data,message:'ok'})} as Response
  }))
  render(<SurveyAnalyticsWorkspace projectId="project"/>)
  return requests
}
describe('frozen option labels in Survey statistics',()=>{
  it('labels all six response types, combinations, missing reasons and stable-code fallbacks in the wave table',async()=>{
    const requests=setup()
    fireEvent.click(await screen.findByRole('button',{name:'查看此波次题目频数与探索性得分'}))
    await screen.findByText('冻结字典合成统计')
    const table=screen.getByRole('columnheader',{name:'频数 / 缺失'}).closest('table')!
    for(const [index,type] of types.entries()){
      const row=within(table).getByText(type+' 题目',{selector:'th'}).closest('tr')!
      const code=type==='RANK_ORDER'?'stable_yes@rank2':'stable_yes'
      expect(within(row).getByTitle('原始编码：'+code)).toHaveTextContent((type==='RANK_ORDER'?'同意 · 第2位':'同意')+'：'+(index+1))
      for(const [code,label] of [['SHOWN_MISSING','未作答'],['NOT_SHOWN','未呈现'],['REFUSED','不愿回答'],['UNABLE_TO_JUDGE','无法判断'],['NEW_REASON','NEW_REASON'],['constructor','constructor']])
        expect(within(row).getByTitle('缺失代码：'+code)).toHaveTextContent(label)
      if(['MULTIPLE','MATRIX_MULTIPLE'].includes(type)){
        expect(within(row).getByTitle('原始编码：["stable_yes","stable_no"]')).toHaveTextContent('同意、不同意：2')
        expect(within(row).getByTitle('原始编码：[]')).toHaveTextContent('未选择任何选项：1')
        expect(within(row).getByTitle('原始编码：["unknown","stable_yes"]')).toHaveTextContent('unknown、同意：1')
      }
    }
    expect(within(table).getByTitle('原始编码：legacy_key')).toHaveTextContent('legacy_key：8')
    expect(within(table).getByTitle('原始编码：unmapped_key')).toHaveTextContent('unmapped_key：9')
    expect(within(table).getByTitle('原始编码：constructor')).toHaveTextContent('constructor：2')
    expect(requests.filter(r=>r.method!=='GET')).toEqual([])
    expect(rows[5].frequencies[0].value).toBe('stable_yes@rank2')
  })
  it.each(types)('uses the same labels and missing codes for bounded %s statistics without changing the request',async type=>{
    const requests=setup()
    await screen.findByRole('heading',{name:'逐题与描述性统计'})
    fireEvent.click(screen.getByText('大样本单题统计'))
    fireEvent.click(await screen.findByRole('button',{name:'读取当前波次变量字典'}))
    const selector=await screen.findByRole('combobox',{name:'大样本题目'})
    fireEvent.change(selector,{target:{value:type.toLowerCase()}})
    fireEvent.click(screen.getByRole('button',{name:'计算本题完整分批统计'}))
    await screen.findByText(type+' 题目',{selector:'p'})
    const code=type==='RANK_ORDER'?'stable_yes@rank2':'stable_yes'
    expect(screen.getByTitle('原始编码：'+code)).toHaveTextContent(type==='RANK_ORDER'?'同意 · 第2位':'同意')
    expect(screen.getByTitle('缺失代码：SHOWN_MISSING')).toHaveTextContent('未作答：1')
    expect(screen.getByTitle('缺失代码：REFUSED')).toHaveTextContent('不愿回答：3')
    expect(screen.getByTitle('缺失代码：NEW_REASON')).toHaveTextContent('NEW_REASON：5')
    await waitFor(()=>expect(requests.filter(r=>r.url.endsWith('/items/paged'))).toEqual([{url:'/api/survey/projects/project/analytics/waves/wave/items/paged',method:'POST',body:{instrumentKey:'form',itemKey:type.toLowerCase()}}]))
    expect(requests.some(r=>r.url.includes('/exports')||r.url.includes('/quality/attempts/')||r.url.includes('/step-up'))).toBe(false)
  })
})
