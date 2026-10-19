import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyBuilder} from './SurveyBuilder'
import type {ResearchDraft,SjtDraftV2} from './builder.types'

const base='/api/survey/projects/p1'
const form:ResearchDraft={id:'form1',projectId:'p1',instrumentKey:'form',kind:'FORM',title:'合成表单',
  status:'DRAFT',revision:1,createdAt:'',updatedAt:'',definition:{schemaVersion:1,pages:[
    {pageKey:'page1',title:'第一页',questions:[{itemKey:'q1',type:'SHORT_TEXT',prompt:'第一题',required:true,options:[],rows:[]}]},
    {pageKey:'page2',title:'第二页',questions:[{itemKey:'q2',type:'SHORT_TEXT',prompt:'',required:true,options:[],rows:[]}]},
  ]}}
function setup(draft:ResearchDraft,{patchError=false,bulk=false}={}){
  const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
    let data:unknown=null,status=200
    if(url==='/api/survey/auth/csrf')data={csrfToken:'synthetic'}
    else if(url===base+'/instruments?page=1')data={list:[draft]}
    else if(url===base+'/assets')data={assets:[]}
    else if(url===base+'/catalog?page=1')data={list:[]}
    else if(url===base+'/instruments/'+draft.id+'/validate')data={revision:1,kind:draft.kind,ok:false,issues:[{
      path:draft.kind==='SJT'?'scenes.1.questions.0.prompt':'pages.1.questions.0.prompt',message:'请填写题干',severity:'error',
    }]}
    else if(url===base+'/instruments/'+draft.id+'/bulk-import/preview'&&bulk)data={revision:1,count:1,ok:false,digest:'synthetic',
      issues:[{line:3,message:'未知题型'}],items:[]}
    else if(url===base+'/instruments/'+draft.id){
      if(init?.method==='PATCH'&&patchError){status=400;data={issues:[{path:'pages.1.questions.0.prompt',message:'请核对字段',severity:'error'}]}}
      else data=draft
    }else throw Error('Unexpected route '+url)
    return {ok:status===200,status,json:async()=>({code:status===200?0:'INVALID',message:'研究工具包含待修正字段',data})} as Response
  })
  vi.stubGlobal('fetch',fetcher);render(<SurveyBuilder projectId="p1"/>);return fetcher
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
describe('S04 authoring guidance and issue locations',()=>{
  it('moves keyboard focus to the precise Form question without writing or changing the draft',async()=>{
    const user=userEvent.setup(),fetcher=setup(form)
    fireEvent.click(await screen.findByRole('button',{name:/合成表单 FORM/}))
    fireEvent.click(await screen.findByRole('button',{name:'结构检查与编译预览'}))
    const location=await screen.findByRole('button',{name:'第 2 页 · 第 1 题：请填写题干'})
    location.focus();await user.keyboard('{Enter}')
    await waitFor(()=>expect(document.getElementById('survey-form-q2')).toHaveFocus())
    expect(screen.getAllByLabelText('题干')[0]).toHaveValue('第一题')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(0)
  })
  it('retains a rejected unsaved edit and exposes the server issue as an actionable location',async()=>{
    setup(form,{patchError:true});fireEvent.click(await screen.findByRole('button',{name:/合成表单 FORM/}))
    fireEvent.change(await screen.findByLabelText('研究工具名称'),{target:{value:'未保存的名称'}})
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    fireEvent.click(await screen.findByRole('button',{name:'第 2 页 · 第 1 题：请核对字段'}))
    await waitFor(()=>expect(document.getElementById('survey-form-q2')).toHaveFocus())
    expect(screen.getByLabelText('研究工具名称')).toHaveValue('未保存的名称')
    expect(screen.getByRole('button',{name:'保存草稿'})).toBeEnabled()
  })
  it('selects the reported CSV line and keeps an invalid preview from offering an apply action',async()=>{
    const fetcher=setup(form,{bulk:true});fireEvent.click(await screen.findByRole('button',{name:/合成表单 FORM/}))
    fireEvent.change(await screen.findByLabelText('输入格式'),{target:{value:'CSV'}})
    const input=screen.getByLabelText('待解析的导入内容') as HTMLTextAreaElement
    fireEvent.change(input,{target:{value:'type,prompt\nTEXT,第一行\nBAD,出错行'}})
    fireEvent.click(screen.getByRole('button',{name:'解析并预览（不保存）'}))
    fireEvent.click(await screen.findByRole('button',{name:'导入位置 3：未知题型'}))
    await waitFor(()=>expect(input).toHaveFocus())
    expect(input.value.slice(input.selectionStart,input.selectionEnd)).toBe('BAD,出错行')
    expect(screen.queryByRole('button',{name:'确认导入全部题目'})).toBeNull()
    expect(fetcher.mock.calls.some(([url])=>url.endsWith('/apply'))).toBe(false)
  })
  it('uses the existing SJT scene selector before focusing a question in another scene',async()=>{
    const question=(key:string)=>({questionKey:key,prompt:'题干',responseType:'SINGLE' as const,required:true,allowRefusal:false,
      options:[{optionKey:'yes',label:'符合',contributions:{m:1}},{optionKey:'no',label:'不符合',contributions:{m:0}}]})
    const definition:SjtDraftV2={schemaVersion:2,respondentType:'participant_self_report',title:'合成情境',author:'合成',sourceNote:'合成',
      licenseStatus:'self_authored',redistribution:'allowed',orderPolicy:'FIXED',metrics:[{metricKey:'m',label:'构念',direction:'descriptive'}],
      scoring:{modelKey:'AUTHOR_KEY_SUM',modelVersion:'1',sourceNote:'合成'},scenes:[
        {sceneKey:'one',title:'情境一',stimulus:'合成材料一',questions:[question('sq1')]},
        {sceneKey:'two',title:'情境二',stimulus:'合成材料二',questions:[question('sq2')]},
      ]}
    const fetcher=setup({...form,id:'sjt',kind:'SJT',definition,title:'合成情境'})
    fireEvent.click(await screen.findByRole('button',{name:/合成情境 SJT/}))
    fireEvent.click(await screen.findByRole('button',{name:'结构检查与编译预览'}))
    fireEvent.click(await screen.findByRole('button',{name:'情境 2 · 第 1 题：请填写题干'}))
    await waitFor(()=>expect(document.getElementById('survey-sjt-sq2')).toHaveFocus())
    expect(screen.getByLabelText('情境标题')).toHaveValue('情境二')
    expect(fetcher.mock.calls.filter(([,init])=>init?.method==='PATCH')).toHaveLength(0)
  })
})
