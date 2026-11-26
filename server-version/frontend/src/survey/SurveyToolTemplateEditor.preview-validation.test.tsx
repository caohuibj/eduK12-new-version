import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyToolTemplateEditor} from './SurveyToolTemplateEditor'
import type {FormDraft,FormQuestion} from './builder.types'

vi.mock('./ResearchFormEditor',()=>({ResearchFormEditor:()=>null}))
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
function setup(matrix=false){
  const question:FormQuestion=matrix
    ?{itemKey:'matrix',type:'MATRIX',prompt:'课堂体验',required:true,rows:[{rowKey:'discussion',label:'讨论参与'}],options:[{optionKey:'yes',label:'符合'},{optionKey:'no',label:'不符合'}]}
    :{itemKey:'required_choice',type:'SINGLE',prompt:'请选择本周学习状态',required:true,rows:[],options:[{optionKey:'yes',label:'状态良好'},{optionKey:'no',label:'需要支持'}]}
  const definition:FormDraft={schemaVersion:2,pages:[
    {pageKey:'p1',title:'说明',questions:[{itemKey:'note',type:'SHORT_TEXT',prompt:'补充说明',required:false,options:[],rows:[]}]},
    {pageKey:'p2',title:'学习情况',questions:[question]},
  ]}
  const attempts:Record<string,unknown>[]=[]
  const fetcher=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input)
    let data:unknown
    if(url.endsWith('/auth/csrf'))data={csrfToken:'synthetic'}
    else if(url.endsWith('/validate'))data={ok:true,issues:[]}
    else if(url.endsWith('/form-dry-run')){
      const answers=JSON.parse(String(init?.body)).answers as Record<string,unknown>
      attempts.push(answers)
      data=answers.required_choice==='yes'?{ok:true,issues:[],missing:[]}:{ok:false,issues:[{
        path:matrix?'answers.matrix.discussion':'answers.required_choice',message:matrix?'必答矩阵行未完成':'必答题目未完成',
      }],missing:[]}
    }else if(url==='/api/survey/tool-library/form')data={id:'form',kind:'FORM',title:'合成预览表单',revision:1,status:'DRAFT',readiness:'READY',updatedAt:'2026-11-26',definition}
    else throw Error('Unexpected request '+url)
    return {ok:true,json:async()=>({code:0,data})} as Response
  })
  vi.stubGlobal('fetch',fetcher)
  render(<SurveyToolTemplateEditor id="form" onReturn={()=>{}}/>)
  return {attempts,fetcher}
}
const submit=()=>screen.getByRole('button',{name:'按正式 FINAL 规则试提交（不保存数据）'})
describe('independent Form preview answer validation',()=>{
  it('shows the real question prompt and re-focuses a later page on repeated rejection without losing answers or publishing',async()=>{
    const {attempts,fetcher}=setup()
    fireEvent.click(await screen.findByRole('button',{name:'检查与试答'}))
    await screen.findByRole('button',{name:'按正式 FINAL 规则试提交（不保存数据）'})
    fireEvent.change(screen.getByRole('textbox',{name:'补充说明'}),{target:{value:'保留这一段已有回答'}})
    fireEvent.click(submit())
    const issue=await screen.findByRole('button',{name:'「请选择本周学习状态」：必答题目未完成'})
    await waitFor(()=>expect(document.getElementById('survey-preview-required_choice')).toHaveFocus())
    expect(issue).not.toHaveTextContent('answers.required_choice')
    expect(screen.getByRole('radio',{name:'状态良好'})).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    expect(screen.getByRole('textbox',{name:'补充说明'})).toHaveValue('保留这一段已有回答')
    fireEvent.click(issue)
    await waitFor(()=>expect(document.getElementById('survey-preview-required_choice')).toHaveFocus())
    fireEvent.click(screen.getByRole('button',{name:'上一页'}))
    fireEvent.click(submit())
    await waitFor(()=>expect(attempts).toHaveLength(2))
    await waitFor(()=>expect(document.getElementById('survey-preview-required_choice')).toHaveFocus())
    fireEvent.click(screen.getByRole('radio',{name:'状态良好'}))
    fireEvent.click(submit())
    await screen.findByText('表单试提交通过。')
    expect(screen.queryByRole('button',{name:'「请选择本周学习状态」：必答题目未完成'})).not.toBeInTheDocument()
    expect(attempts).toEqual([{note:'保留这一段已有回答'},{note:'保留这一段已有回答'},{note:'保留这一段已有回答',required_choice:'yes'}])
    expect(fetcher.mock.calls.some(([url,init])=>String(url).includes('/prepare')||String(url).includes('/open')||init?.method==='PATCH')).toBe(false)
  })
  it('labels a rejected matrix row with its question and row while focusing the rendered question',async()=>{
    setup(true)
    fireEvent.click(await screen.findByRole('button',{name:'检查与试答'}))
    await screen.findByRole('button',{name:'按正式 FINAL 规则试提交（不保存数据）'})
    fireEvent.click(submit())
    await screen.findByRole('button',{name:'「课堂体验」 · 讨论参与：必答矩阵行未完成'})
    await waitFor(()=>expect(document.getElementById('survey-preview-matrix')).toHaveFocus())
    expect(screen.getByRole('rowheader',{name:'讨论参与'})).toBeVisible()
  })
})
