import {ArrowUp,ArrowDown,Copy,Trash2} from 'lucide-react'
import {SurveyMaterialPicker} from './SurveyMaterialPicker'
import {SurveyFormChoiceList} from './SurveyFormChoiceList'
import {referencedFormChoiceKeys} from '../modules/assessment-core/form/choiceSafety'
import type { ReactNode } from 'react'
import { SurveyFormStudio } from './SurveyFormStudio'
import { StructuredFormConstraints } from '../modules/assessment-core/form/StructuredFormConstraints'
import { BasicFormConstraints } from '../modules/assessment-core/form/BasicFormConstraints'
import type { FormDraft, FormQuestion } from './builder.types'
import { choiceTypes, professionalTypes, newQuestion, researchKey } from './builder.types'
import { SurveyImageField } from './SurveyImageField'

const types:Record<FormQuestion['type'],string>={
  SINGLE:'单选',MULTIPLE:'多选',SHORT_TEXT:'短文本',LONG_TEXT:'长文本',
  NUMBER:'数值',LIKERT:'Likert',MATRIX:'矩阵',
  DATE:'日期',TIME:'时间',RANK_ORDER:'排序',SLIDER:'滑块',
  CONSTANT_SUM:'恒定总和',MATRIX_MULTIPLE:'矩阵多选',
}
function FormSettings({compact,title,children}:{compact:boolean;title:string;children:ReactNode}){return compact?<details className="survey-form-question-settings"><summary>{title}</summary>{children}</details>:<>{children}</>}
export type FormEditorFocus={pageKey:string;itemKey:string|null}
type FieldsProps={value:FormDraft;onChange:(next:FormDraft)=>void;projectId?:string;questionKey?:string;questionMeta?:ReactNode;renderMaterials?:(question:FormQuestion,onChange:(question:FormQuestion)=>void)=>ReactNode;bulkPending?:boolean;onPendingChange?:(id:string,pending:boolean)=>void;
  focusedItem?:FormEditorFocus;variant?:'education';compactSettings?:boolean;renderImageField?:(props:{image?:FormQuestion['image'];onChange:(image:FormQuestion['image'])=>void})=>ReactNode}
type Props=FieldsProps&({appearance:'studio';onCommit:(next:FormDraft)=>Promise<boolean>;onDraftRiskChange?:(dirty:boolean)=>void;disabled?:boolean}|{appearance?:'standard'})
export function ResearchFormEditor(props:Props){
  return props.appearance==='studio'?<SurveyFormStudio value={props.value} onCommit={props.onCommit} onDraftRiskChange={props.onDraftRiskChange} disabled={props.disabled} renderQuestion={(value,onChange,key,pageControl,onPendingChange,bulkPending)=><FormFields value={value} onChange={onChange} projectId={props.projectId} questionKey={key} renderMaterials={props.renderMaterials} questionMeta={pageControl} bulkPending={bulkPending} onPendingChange={onPendingChange} focusedItem={props.focusedItem} variant={props.variant} compactSettings={props.compactSettings} renderImageField={props.renderImageField}/>}/>:<FormFields {...props}/>
}
function FormFields({value,onChange,projectId,questionKey,questionMeta,focusedItem,variant,renderImageField,renderMaterials,bulkPending,onPendingChange,compactSettings=false}:FieldsProps){
  const groupTerm=compactSettings?'分组':'区段'
  const setPage=(index:number,update:(p:FormDraft['pages'][number])=>FormDraft['pages'][number])=>{
    const pages=value.pages.map((p,i)=>i===index?update(p):p)
    onChange({...value,pages})
  }
  const setQuestion=(pi:number,qi:number,update:(q:FormQuestion)=>FormQuestion)=>
    setPage(pi,page=>({...page,questions:page.questions.map((q,i)=>i===qi?update(q):q)}))
  const fieldCount=value.pages.flatMap(p=>p.questions).reduce((n,q)=>n+(['MATRIX','MATRIX_MULTIPLE'].includes(q.type)?q.rows.length:1)+(q.otherOptionKey?1:0),0)
  const move=(pi:number,qi:number,by:number)=>{
    setPage(pi,page=>{const questions=page.questions.slice(),other=qi+by
      if(other>=0&&other<questions.length)[questions[qi],questions[other]]=[questions[other],questions[qi]]
      return {...page,questions}
    })
  }
  return <div className={compactSettings?"education-form-editor space-y-5":"space-y-5"}>
    <div className={compactSettings?"education-form-structure":"flex flex-wrap gap-2 items-center"} hidden={!!questionKey}>
      <h3 className="font-semibold">{compactSettings?'题目管理':<>{variant==='education'?'表单区段':'Form 问卷页面'} · V{value.schemaVersion}</>}</h3>
      {compactSettings&&fieldCount<=500?<details className="education-form-structure-help"><summary>结构说明</summary><span className={fieldCount>500?'text-red-700 text-sm':'text-slate-600 text-sm'}
        role={fieldCount>500?'alert':undefined}>作答字段 {fieldCount}/500（矩阵每行及其他填写各计 1）</span></details>:<span className={fieldCount>500?'text-red-700 text-sm':'text-slate-600 text-sm'}
        role={fieldCount>500?'alert':undefined}>作答字段 {fieldCount}/500（矩阵每行及其他填写各计 1）</span>}
      {value.schemaVersion===1&&<button type="button" disabled={bulkPending} className="btn-secondary"
        onClick={()=>onChange({...value,schemaVersion:2})}>
        升级为 Form V2（生成新冻结版本）</button>}
      <button type="button" disabled={bulkPending} className="btn-secondary" onClick={()=>onChange({...value,pages:[...value.pages,
        {pageKey:researchKey('p'),title:'第 '+(value.pages.length+1)+(variant==='education'?' '+groupTerm:' 页'),questions:[]}]})}>{variant==='education'?'新增'+groupTerm:'新增分页'}</button>
    </div>
    {value.pages.map((page,pi)=>focusedItem&&focusedItem.pageKey!==page.pageKey?null:<section className={questionKey?'survey-form-question-fields':compactSettings?'education-form-group':'rounded-xl border p-4 bg-white space-y-4'} key={page.pageKey} hidden={!!questionKey&&!page.questions.some(q=>q.itemKey===questionKey)}>
      <header className={compactSettings?"education-form-group-heading":"flex items-center gap-2"} hidden={!!questionKey}>
        <input className="input flex-1" aria-label={'第 '+(pi+1)+(variant==='education'?' '+groupTerm+'标题':' 页标题')} value={page.title}
          onChange={e=>setPage(pi,p=>({...p,title:e.target.value}))}/>
        <button className="btn-secondary" type="button" disabled={bulkPending||pi===0} aria-label={variant==='education'?'上移'+groupTerm:'上移分页'}
          onClick={()=>{const copy=value.pages.slice();[copy[pi],copy[pi-1]]=[copy[pi-1],copy[pi]];onChange({...value,pages:copy})}}>↑</button>
        <button className="btn-secondary" type="button" disabled={bulkPending||pi===value.pages.length-1} aria-label={variant==='education'?'下移'+groupTerm:'下移分页'}
          onClick={()=>{const copy=value.pages.slice();[copy[pi],copy[pi+1]]=[copy[pi+1],copy[pi]];onChange({...value,pages:copy})}}>↓</button>
        <button type="button" disabled={bulkPending} className="btn-secondary" onClick={()=>onChange({...value,pages:value.pages.filter((_,i)=>i!==pi)})}>{variant==='education'?'删除'+groupTerm:'删除页'}</button>
      </header>
      {page.questions.map((q,qi)=>{
        if(focusedItem&&focusedItem.itemKey!==q.itemKey)return null
        const previous=[...value.pages.slice(0,pi).flatMap(p=>p.questions),...page.questions.slice(0,qi)]
          .filter(q=>['SINGLE','MULTIPLE','LIKERT'].includes(q.type))
        if(questionKey&&q.itemKey!==questionKey)return null
        const referencedOptions=referencedFormChoiceKeys(q,value.pages.flatMap(p=>p.questions))
        const typeControl=<select className="input" aria-label="选择题型" disabled={bulkPending} value={q.type} onChange={e=>{
              const type=e.target.value as FormQuestion['type']
              const fresh=newQuestion(type)
              setQuestion(pi,qi,old=>({...fresh,itemKey:old.itemKey,prompt:old.prompt,required:old.required,allowRefusal:old.allowRefusal}))
            }}>{Object.entries(types).filter(([kind])=>value.schemaVersion===2||
              !professionalTypes.has(kind as FormQuestion['type']))
              .map(([kind,name])=><option key={kind} value={kind}>{name}</option>)}</select>
        const mediaFields=<FormSettings compact={!!questionKey||compactSettings} title="题目配图">
          {renderImageField ? renderImageField({image:q.image,onChange:image=>setQuestion(pi,qi,x=>({...x,image}))}) : projectId ? <SurveyImageField projectId={projectId} image={q.image}
            onChange={image=>setQuestion(pi,qi,x=>({...x,image}))}/>
            : q.image ? <p className="text-sm" role="status">
              此图片来自研究项目，Huiteacher 暂不复用研究者媒体权限。
              <button type="button" disabled={bulkPending} className="btn-secondary" onClick={()=>setQuestion(pi,qi,x=>({...x,image:undefined}))}>
                移除图片
              </button></p> : null}
          </FormSettings>
        return <article key={q.itemKey} id={'survey-form-'+q.itemKey} tabIndex={-1}
          className={questionKey?'survey-form-question space-y-4':compactSettings?'education-form-question':'border rounded-lg p-3 bg-slate-50 space-y-3 scroll-mt-4'}>
          <div className={questionKey?'survey-form-question-meta':compactSettings?'education-form-question-meta':'flex flex-wrap gap-2 items-center'}>
            {questionKey?questionMeta:<strong className="text-sm">题目 {qi+1}</strong>}
            {questionKey||compactSettings?<label className={compactSettings?'education-form-type-control':'survey-form-type-control'}>题型{typeControl}</label>:typeControl}

            <button hidden={!!questionKey} type="button" className="btn-secondary" aria-label={compactSettings?'上移题目':undefined} title={compactSettings?'上移题目':undefined} disabled={bulkPending||qi===0} onClick={()=>move(pi,qi,-1)}>{compactSettings?<ArrowUp size={16} aria-hidden="true"/>:'上移'}</button>
            <button hidden={!!questionKey} type="button" className="btn-secondary" aria-label={compactSettings?'下移题目':undefined} title={compactSettings?'下移题目':undefined} disabled={bulkPending||qi===page.questions.length-1} onClick={()=>move(pi,qi,1)}>{compactSettings?<ArrowDown size={16} aria-hidden="true"/>:'下移'}</button>
            <button hidden={!!questionKey} type="button" disabled={bulkPending} className="btn-secondary" aria-label={compactSettings?'复制题目':undefined} title={compactSettings?'复制题目':undefined} onClick={()=>{
              const copiedOptions=q.options.map(o=>({...o,optionKey:researchKey('o')}))
              const remap=new Map(q.options.map((o,i)=>[o.optionKey,copiedOptions[i].optionKey]))
              const clone:FormQuestion={...structuredClone(q),itemKey:researchKey('q'),
                options:copiedOptions,rows:q.rows.map(row=>({...row,rowKey:researchKey('r')})),
                otherOptionKey:q.otherOptionKey?remap.get(q.otherOptionKey):undefined,
                exclusiveOptionKeys:q.exclusiveOptionKeys?.map(key=>remap.get(key)!).filter(Boolean)}
              setPage(pi,p=>({...p,questions:[
                ...p.questions.slice(0,qi+1),clone,...p.questions.slice(qi+1)]}))
            }}>{compactSettings?<Copy size={16} aria-hidden="true"/>:'复制'}</button>
            <button hidden={!!questionKey} type="button" disabled={bulkPending} className="btn-secondary" aria-label={compactSettings?'删除题目':undefined} title={compactSettings?'删除题目':undefined} onClick={()=>setPage(pi,p=>({...p,questions:p.questions.filter((_,i)=>i!==qi)}))}>{compactSettings?<Trash2 size={16} aria-hidden="true"/>:'删除'}</button>
          </div>
          <label className={questionKey?'survey-form-prompt':compactSettings?'education-form-prompt':'block text-sm'}>题干
            <textarea className="input w-full block" rows={questionKey||compactSettings?3:2} placeholder={questionKey?'请输入题目内容':undefined} value={q.prompt}
              onChange={e=>setQuestion(pi,qi,x=>({...x,prompt:e.target.value}))}/>
          </label>
          <div className={questionKey?'survey-form-question-switches':compactSettings?'education-form-question-switches':'flex gap-4 flex-wrap'}>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={q.required}
              onChange={e=>setQuestion(pi,qi,x=>({...x,required:e.target.checked}))}/>必答</label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={q.allowRefusal===true}
                onChange={e=>setQuestion(pi,qi,x=>({...x,allowRefusal:e.target.checked}))}/>
              {questionKey||compactSettings?'允许选择“不愿回答”':'允许明确选择「不愿回答」（单独记为 REFUSED）'}
            </label>
          </div>
          {!compactSettings&&(renderMaterials ? <FormSettings compact={compactSettings} title="题目展示素材">{renderMaterials(q,next=>setQuestion(pi,qi,()=>next))}</FormSettings> : projectId&&<details className="survey-form-question-settings"><summary>题目素材 · 图片、视频、文档</summary><SurveyMaterialPicker label="题目展示素材" value={q.materials} onChange={materials=>setQuestion(pi,qi,x=>({...x,materials}))}/></details>)}
          {!questionKey&&!compactSettings&&mediaFields}
          {choiceTypes.has(q.type)&&<SurveyFormChoiceList key={q.itemKey+q.type+'options'} question={q} kind="选项" limit={30} protectedKeys={referencedOptions} onPendingChange={onPendingChange} onChange={next=>setQuestion(pi,qi,()=>next)}/>}
          {questionKey&&!compactSettings&&mediaFields}
          {compactSettings&&<details className="survey-form-question-settings"><summary>展示素材与配图</summary>{renderMaterials&&renderMaterials(q,next=>setQuestion(pi,qi,()=>next))}{mediaFields}</details>}
          {(!questionKey&&!compactSettings||value.schemaVersion===2&&['SINGLE','MULTIPLE'].includes(q.type))&&<FormSettings compact={!!questionKey||compactSettings} title="选项补充设置">
          {value.schemaVersion===2&&['SINGLE','MULTIPLE'].includes(q.type)&&
            <div className="border rounded-lg p-3 space-y-3">
              <label className="block text-sm">选择后填写文字
                <select className="input block w-full" aria-describedby={'survey-form-'+q.itemKey+'-other-help'} value={q.otherOptionKey??''}
                  onChange={e=>setQuestion(pi,qi,x=>({...x,
                    otherOptionKey:e.target.value||undefined,
                    otherMaxLength:e.target.value?(x.otherMaxLength??300):undefined}))}>
                  <option value="">不启用</option>
                  {q.options.map(o=><option key={o.optionKey} value={o.optionKey}>
                    {o.label||o.optionKey}</option>)}
                </select>
              </label>
              <p className="survey-form-setting-note" id={'survey-form-'+q.itemKey+'-other-help'}>为选中的选项附加文字输入框，例如“其他，请说明”。被试选择该选项后可补充文字，未选择时不记录这段文字。</p>
              {q.otherOptionKey&&<label className="block text-sm">其他文字长度上限
                <input className="input block w-full" type="number" min="1" max="2000" step="1"
                  value={q.otherMaxLength??300}
                  onChange={e=>setQuestion(pi,qi,x=>({...x,otherMaxLength:Number(e.target.value)}))}/>
              </label>}
              {q.type==='MULTIPLE'&&<fieldset className="space-y-2">
                <legend className="text-sm">不可与其他选项同时选择</legend>
                <p className="survey-form-setting-note" id={'survey-form-'+q.itemKey+'-exclusive-help'}>例如“以上均无”：被试选中它后，其他已选选项会被取消。此设置仅用于多选题。</p>
                {q.options.map(o=><label className="flex items-center gap-2 text-sm" key={o.optionKey}>
                  <input type="checkbox" aria-describedby={'survey-form-'+q.itemKey+'-exclusive-help'} checked={q.exclusiveOptionKeys?.includes(o.optionKey)??false}
                    onChange={e=>setQuestion(pi,qi,x=>({...x,
                      exclusiveOptionKeys:e.target.checked?
                        [...(x.exclusiveOptionKeys??[]),o.optionKey]:
                        (x.exclusiveOptionKeys??[]).filter(key=>key!==o.optionKey)}))}/>
                  {o.label||o.optionKey}</label>)}
              </fieldset>}
            </div>}
          </FormSettings>}
          {['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<SurveyFormChoiceList key={q.itemKey+q.type+'rows'} question={q} kind="矩阵行" limit={Math.min(40,500-fieldCount+q.rows.length)} onPendingChange={onPendingChange} onChange={next=>setQuestion(pi,qi,()=>next)}/>}
          {(!questionKey&&!compactSettings||['NUMBER','SLIDER','TIME','SHORT_TEXT','LONG_TEXT','CONSTANT_SUM','MULTIPLE','MATRIX_MULTIPLE'].includes(q.type))&&<FormSettings compact={!!questionKey||compactSettings} title="作答规则与格式"><div className="space-y-3">
          <BasicFormConstraints question={q} onChange={patch=>setQuestion(pi,qi,x=>({...x,...patch}))}/>
          {value.schemaVersion===2&&<StructuredFormConstraints question={q} onChange={patch=>setQuestion(pi,qi,x=>({...x,...patch}))}/>}
          {value.schemaVersion===2&&['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&
            <label className="block text-sm">输入格式
            <select className="input block" value={q.textValidation??''}
              onChange={e=>setQuestion(pi,qi,x=>({...x,
                textValidation:e.target.value?e.target.value as 'EMAIL'|'DIGITS'|'ALPHANUMERIC':undefined}))}>
              <option value="">不限制</option><option value="EMAIL">邮箱</option>
              <option value="DIGITS">仅数字</option><option value="ALPHANUMERIC">英文字母与数字</option>
            </select></label>}
          </div></FormSettings>}
          {(!questionKey&&!compactSettings||previous.length>0)&&<FormSettings compact={!!questionKey||compactSettings} title="条件显示">
          {previous.length>0&&<div className="space-y-3">
            <p className="survey-form-setting-note" id={'survey-form-'+q.itemKey+'-condition-help'}>满足以下条件时显示本题。例如：前题“是否参加过培训”选择“是”，才显示本题“参加过哪些培训”。选择“始终显示”则不受前题答案影响。</p>
            <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">依据哪道题
              <select className="input block w-full" aria-describedby={'survey-form-'+q.itemKey+'-condition-help'} value={q.displayIf?.itemKey||''}
                onChange={e=>{const item=previous.find(a=>a.itemKey===e.target.value)
                  setQuestion(pi,qi,x=>({...x,displayIf:item?{itemKey:item.itemKey,operator:item.type==='MULTIPLE'?'INCLUDES':'EQUALS',optionKey:item.options[0]?.optionKey||''}:undefined}))
                }}>
                <option value="">始终显示</option>
                {previous.map(item=><option value={item.itemKey} key={item.itemKey}>{item.prompt||item.itemKey}</option>)}
              </select>
            </label>
            {q.displayIf&&<label className="block text-sm">选中哪个选项
              <select className="input block w-full" aria-describedby={'survey-form-'+q.itemKey+'-condition-result'} value={q.displayIf.optionKey}
                onChange={e=>setQuestion(pi,qi,x=>({...x,displayIf:{...q.displayIf!,optionKey:e.target.value}}))}>
                {(previous.find(item=>item.itemKey===q.displayIf?.itemKey)?.options||[]).map(o=>
                  <option key={o.optionKey} value={o.optionKey}>{o.label||o.optionKey}</option>)}
              </select>
            </label>}
            </div>
            <p className="survey-form-setting-note" id={'survey-form-'+q.itemKey+'-condition-result'}>前题为多选时，包含指定选项即可显示。未作答或条件不满足时，本题隐藏，其答案不计入提交结果。</p>
          </div>}
          </FormSettings>}
        </article>
      })}
      <FormSettings compact={compactSettings} title="添加题目"><div className={compactSettings?"education-form-add-types":"flex flex-wrap gap-2"} hidden={!!questionKey}>{Object.entries(types).filter(([type])=>value.schemaVersion===2||
        !professionalTypes.has(type as FormQuestion['type'])).map(([type,title])=>
        <button type="button" disabled={bulkPending} className="btn-secondary" key={type}
          onClick={()=>setPage(pi,p=>({...p,questions:[...p.questions,newQuestion(type as FormQuestion['type'])]}))}>
          + {title}</button>)}</div></FormSettings>
    </section>)}
    {!questionKey&&!value.pages.length&&<p className="text-sm text-slate-500">{variant==='education'?'先新增一个'+groupTerm+'，再添加题目。':'先新增一个分页，再添加题目；也可使用批量导入自动创建第一页。'}</p>}
  </div>
}
