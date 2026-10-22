import {useEffect,useState,type ComponentProps} from 'react'
import {ResearchFormEditor,type FormEditorFocus} from '../../survey/ResearchFormEditor'
import type {FormDraft} from '../../survey/builder.types'

type Props=Pick<ComponentProps<typeof ResearchFormEditor>,'value'|'onChange'|'renderImageField'>
const firstFocus=(value:FormDraft):FormEditorFocus|null=>value.pages[0]
 ?{pageKey:value.pages[0].pageKey,itemKey:value.pages[0].questions[0]?.itemKey??null}:null
const sameFocus=(a:FormEditorFocus|null,b:FormEditorFocus|null)=>a?.pageKey===b?.pageKey&&a?.itemKey===b?.itemKey
const validFocus=(value:FormDraft,focus:FormEditorFocus|null):FormEditorFocus|null=>{
 const page=value.pages.find(page=>page.pageKey===focus?.pageKey)
 if(!page)return firstFocus(value)
 return {pageKey:page.pageKey,itemKey:page.questions.find(question=>question.itemKey===focus?.itemKey)?.itemKey??page.questions[0]?.itemKey??null}
}
/** View-only directory over the native draft. Selection never saves or changes
 * definition identities; the parent owns whole-draft CAS and leave protection. */
export function EducationPrivateFormEditor({value,onChange,renderImageField}:Props){
 const [selected,setSelected]=useState<FormEditorFocus|null>(()=>firstFocus(value))
 const active=validFocus(value,selected)
 useEffect(()=>{if(!sameFocus(selected,active))setSelected(active)},[selected,active])
 const change=(next:FormDraft)=>{
  const addedPage=next.pages.find(page=>!value.pages.some(old=>old.pageKey===page.pageKey))
  const oldKeys=new Set(value.pages.flatMap(page=>page.questions.map(question=>question.itemKey)))
  const addedQuestion=next.pages.flatMap(page=>page.questions.filter(question=>!oldKeys.has(question.itemKey)).map(question=>({pageKey:page.pageKey,itemKey:question.itemKey})))[0]
  if(addedPage)setSelected({pageKey:addedPage.pageKey,itemKey:addedPage.questions[0]?.itemKey??null})
  else if(addedQuestion)setSelected(addedQuestion)
  else{
   const oldPageIndex=value.pages.findIndex(page=>page.pageKey===active?.pageKey)
   const page=next.pages.find(page=>page.pageKey===active?.pageKey)??next.pages[Math.min(Math.max(oldPageIndex,0),next.pages.length-1)]
   const oldQuestionIndex=value.pages[oldPageIndex]?.questions.findIndex(question=>question.itemKey===active?.itemKey)??0
   const question=page?.questions.find(question=>question.itemKey===active?.itemKey)??page?.questions[Math.min(Math.max(oldQuestionIndex,0),page.questions.length-1)]
   setSelected(page?{pageKey:page.pageKey,itemKey:question?.itemKey??null}:null)
  }
  onChange(next)
 }
 return <div className="education-private-form-workspace">
  <p className="education-private-step-help">按区段组织题目，正式作答时逐节呈现。切换题目会保留未保存修改，点击“保存草稿”才写入；离开工具前请先保存。</p>
  <div className="education-private-form-layout">
   <nav className="education-private-form-directory" aria-label="表单区段与题目">
    <h3>内容目录</h3>
    {!value.pages.length&&<p>还没有区段，请先新增区段。</p>}
    <ol>{value.pages.map((page,index)=><li key={page.pageKey}>
     <button type="button" aria-label={`选择区段：${page.title}`} aria-pressed={active?.pageKey===page.pageKey}
      onClick={()=>setSelected({pageKey:page.pageKey,itemKey:page.questions[0]?.itemKey??null})}>{index+1}. {page.title||'未命名区段'} <small>（{page.questions.length} 题）</small></button>
     <ol>{page.questions.map((question,questionIndex)=><li key={question.itemKey}><button type="button"
      aria-label={`编辑题目：${question.prompt||'未命名题目'}`} aria-pressed={active?.pageKey===page.pageKey&&active.itemKey===question.itemKey}
      onClick={()=>setSelected({pageKey:page.pageKey,itemKey:question.itemKey})}><span>{questionIndex+1}. {question.prompt||'未命名题目'}</span><small>{question.required?'必答':'选答'}</small></button></li>)}</ol>
     {!page.questions.length&&<p>此区段还没有题目。</p>}
    </li>)}</ol>
   </nav>
   <section className="education-private-form-fields" aria-label="当前表单内容编辑区">
    <ResearchFormEditor value={value} onChange={change} focusedItem={active??undefined} variant="education" renderImageField={renderImageField}/>
   </section>
  </div>
 </div>
}
