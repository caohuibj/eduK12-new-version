import {useState} from 'react'
import {AssessmentShell} from '@source/components/assessment-shell'
import FormPlayer,{type FormPlayerValue} from '@source/components/questionnaire/FormPlayer'
import {trainingVisibleFields} from '@source/modules/assessment-core/form/training-policy'
import {ProductThemeControl} from '@source/components/product-theme/ProductThemeControl'
import {useProductTheme} from '@source/components/product-theme/useProductTheme'
import type {FormDraft} from '@source/survey/builder.types'

// Display-only local fixture, not FinalCompositeAssessment's persistence/FINAL protocol.
export function ParticipantFixture({entry,definition}:{entry:'school'|'teacher';definition:FormDraft}){
 const appearance=useProductTheme(entry,'synthetic-theme-participant')
 const state=new URLSearchParams(location.search).get('participantState')||'form'
 const [section,setSection]=useState(0),[position,setPosition]=useState(0)
 const [values,setValues]=useState<Record<string,FormPlayerValue>>({})
 const [error,setError]=useState(state==='error'?'合成校验错误：请完成必填字段':'')
 const [save,setSave]=useState({error:state==='save-error',message:state==='save-error'?'合成本机保存失败：诊断状态':'合成草稿仅在当前浏览器保留，不会提交服务器。'})
 const [complete,setComplete]=useState(state==='complete')
 const page=definition.pages[section]
 const fields=trainingVisibleFields(page.questions.map(question=>({formItemId:question.itemKey,formDefinition:{...question,image:undefined},required:question.required})),values)
 const index=Math.min(position,Math.max(0,fields.length-1)),field=fields[index],question=field?.formDefinition
 const change=(next:FormPlayerValue)=>{
  if(!question)return
  const updated={...values,[question.itemKey]:next};setValues(updated);setError('')
  try{
   if(state==='save-error')throw Error('Synthetic storage failure')
   sessionStorage.setItem('synthetic-education-participant:'+entry,JSON.stringify(updated))
   setSave({error:false,message:'合成答案已保存到本机（仅诊断），尚未提交任何服务器。'})
  }catch{setSave({error:true,message:'合成本机保存失败：请保留当前页面。此为诊断数据。'})}
 }
 const submit=()=>{
  // UI-only missing-value guard. Authoritative validation and FINAL are deliberately absent.
  const missing=fields.findIndex(row=>{const value=values[row.formItemId];return value===null||value===undefined||(Array.isArray(value)?value.length===0:typeof value==='string'?!value.trim():false)})
  if(missing>=0){setPosition(missing);setError('合成校验错误：还有必填字段未完成');return}
  setError('');if(section<definition.pages.length-1){setSection(section+1);setPosition(0)}else setComplete(true)
 }
 const panel=<section className={entry==='teacher'?'ht-panel':'hs-panel hs-runner'} aria-label="合成参与者表单诊断">
  <h2>我的自编表单任务（合成诊断）</h2>
  <p>仅检查真实参与者组件的显示与交互；没有账号、数据库、请求或正式 FINAL。</p>
  <div className={entry==='teacher'?'ht-task':undefined}>
   <h3>正在完成：合成参与者表单</h3>
   {complete?(entry==='school'?<div role="status" className="hs-message"><h3>合成表单演示已完成</h3><p>这不是正式提交，没有产生 FINAL。</p><button type="button" onClick={()=>{setComplete(false);setSection(0);setPosition(0)}}>返回合成表单</button></div>:<><p role="status">合成表单演示已完成。这不是正式提交，没有产生 FINAL。</p><button type="button" onClick={()=>{setComplete(false);setSection(0);setPosition(0)}}>返回合成表单</button></>):<AssessmentShell title="合成参与者表单" eyebrow="综合测评"
    instructions={<div className="space-y-2"><p>当前单元：{page.title}</p><p>合成答案仅保存在本机诊断空间，完成按钮不会提交服务器。</p></div>}
    progress={{kind:'count',completed:section,total:definition.pages.length,label:'综合测评单元进度'}}
    navigation={<section aria-label="提交单元" className="rounded-xl border border-slate-200 bg-white p-4"><p className="mb-2 text-sm font-medium text-slate-600">提交单元</p><div className="flex flex-wrap gap-2">{definition.pages.map((item,i)=><span key={item.pageKey} className={`rounded px-3 py-1 text-sm ${i<section?'bg-green-100 text-green-700':i===section?'bg-blue-700 text-white':'bg-slate-100 text-slate-600'}`}>{i+1}. {item.title}</span>)}</div></section>}>
    {error&&<p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}
    <p role={save.error?'alert':'status'} className="assessment-local-save-status mb-4 text-sm" data-participant-local-save>{save.message}</p>
    <div><div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 sm:p-6"><p className="text-sm text-slate-500">表单区段</p><h2 className="mt-1 text-xl font-semibold text-slate-900">{page.title}</h2></div>
     {question&&<FormPlayer key={question.itemKey} item={{id:question.itemKey,type:question.type,label:question.prompt,required:question.required,formDefinition:question,formPolicy:{version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}}}
      options={(question.options??[]).map(option=>({value:option.optionKey,label:option.label}))} value={values[question.itemKey]} allowSkip
      position={index+1} total={fields.length} onChange={change} onPrevious={()=>{setPosition(Math.max(0,index-1));setError('')}}
      onNext={index<fields.length-1?()=>{setPosition(index+1);setError('')}:undefined} onSubmit={index===fields.length-1?submit:undefined} />}
    </div>
   </AssessmentShell>}
  </div>
 </section>
 const content=<div className={entry==='teacher'?'ht-workspace':'hs-workspace-content'}><ProductThemeControl appearance={appearance} product={entry==='teacher'?'Teacher':'School'}/>{panel}</div>
 const props={'data-theme':appearance.theme,'data-testid':'theme-root','data-theme-diagnostic-ready':'true','data-fixture':'synthetic-participant-only'}
 return entry==='teacher'?<main className="ht-app" {...props}>{content}</main>:<div className="hs-app hs-workspace" {...props}><main id="hs-main" tabIndex={-1} className="hs-main hs-main-workspace"><div className="hs-workspace-layout">{content}</div></main></div>
}
