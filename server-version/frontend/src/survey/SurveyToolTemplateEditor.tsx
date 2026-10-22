import {useEffect,useRef,useState} from 'react'
import {ArrowLeft,Pencil} from 'lucide-react'
import {toolLibraryApi as api,ToolLibraryError,libraryKindLabel,type LibraryTool,type ToolRef} from './tool-library-api'
import {ResearchFormEditor} from './ResearchFormEditor'
import {ResearchScaleEditor} from './ResearchScaleEditor'
import {ResearchPreview} from './ResearchPreview'
import {ResearchImportGuide} from './ResearchAuthoringGuide'
import type {FormDraft,ScaleDraft,ResearchDraft} from './builder.types'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import {SurveyCompositionEditor} from './SurveyCompositionEditor'

type Review={ok:boolean;issues:{path?:string;line?:number;message:string}[];score?:{scores?:{key:string;value:number|null;status:string}[]}|null;unitCount?:number}
type Batch={batchId:string;format:'TEXT'|'CSV';content:string}
type Bulk={revision:number;digest:string;ok:boolean;count:number;issues:{line:number;message:string}[]}
export function SurveyToolTemplateEditor({id,onReturn,onLeaveRiskChange}:{id:string;onReturn:()=>void;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void}){
  const [tool,setTool]=useState<LibraryTool|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[issues,setIssues]=useState<Review['issues']>([]),[notice,setNotice]=useState(''),[review,setReview]=useState<Review|null>(null),[preview,setPreview]=useState(false)
  const [bulkText,setBulkText]=useState(''),[bulkFormat,setBulkFormat]=useState<'TEXT'|'CSV'>('CSV'),[bulk,setBulk]=useState<{batch:Batch;result:Bulk}|null>(null)
  const [formRisk,setFormRisk]=useState(false),[nameOpen,setNameOpen]=useState(false)
  const [reload,setReload]=useState(0)
  const lock=useRef(false),editGeneration=useRef(0),nameInput=useRef<HTMLInputElement>(null)
  const risk=dirty||!!bulkText.trim()||formRisk
  useEffect(()=>{if(nameOpen)nameInput.current?.focus()},[nameOpen])
  useEffect(()=>{let current=true;setLoading(true);setError('');void api<LibraryTool>('/tool-library/'+encodeURIComponent(id)).then(result=>{if(current){setTool(result);setDirty(false);setNameOpen(false)}}).catch(cause=>{if(current)setError(cause.message)}).finally(()=>{if(current)setLoading(false)});return()=>{current=false}},[id,reload])
  useEffect(()=>{onLeaveRiskChange?.({dirty:risk,busy});return()=>onLeaveRiskChange?.({dirty:false,busy:false})},[risk,busy,onLeaveRiskChange])
  useEffect(()=>{const warn=(event:BeforeUnloadEvent)=>{if(risk||busy){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[risk,busy])
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return()=>window.clearTimeout(timer)},[notice])
  const run=async(task:()=>Promise<void>)=>{if(lock.current)return false;lock.current=true;setBusy(true);setError('');setIssues([]);setNotice('');try{await task();return true}catch(cause){setError(cause instanceof Error?cause.message:'操作失败');if(cause instanceof ToolLibraryError)setIssues(cause.issues);return false}finally{lock.current=false;setBusy(false)}}
  const change=(definition:any)=>{if(!tool)return;editGeneration.current++;setTool({...tool,definition});setDirty(true);setReview(null);setPreview(false);setBulk(null)}
  const save=()=>{if(!tool)return;const snapshot=tool,generation=editGeneration.current;void run(async()=>{const result=await api<LibraryTool>('/tool-library/'+id,'PATCH',{revision:snapshot.revision,title:snapshot.title,definition:snapshot.definition});const changed=editGeneration.current!==generation;setTool(current=>changed&&current?.id===snapshot.id?{...result,title:current.title,definition:current.definition}:result);setDirty(changed);if(!changed)setNameOpen(false);setNotice(changed?'本次已保存，保存期间的新修改仍待保存。':'工具草稿已保存；已有研究中的内容保持原样。')})}
  const commitForm=async(definition:FormDraft)=>{if(!tool||dirty)return false;return run(async()=>{const result=await api<LibraryTool>('/tool-library/'+id,'PATCH',{revision:tool.revision,title:tool.title,definition});setTool(result);setReview(null);setPreview(false);setNotice('表单内容已保存。')})}
  const check=()=>void run(async()=>{const result=await api<Review>('/tool-library/'+id+'/validate','POST',{});setReview(result);setIssues(result.issues);setPreview(result.ok);setNotice(result.ok?'结构检查通过；未创建真实答卷。':'请按提示修正工具。')})
  const leave=()=>{if(busy)return;if(!risk||window.confirm('工具有尚未保存或导入的内容，确定放弃并返回工具集？'))onReturn()}
  if(loading)return <p role="status">正在读取工具…</p>
  if(!tool)return <section className="survey-tool-library"><button className="btn-secondary" onClick={onReturn}>返回工具集</button><p role="alert">{error||'工具不可用'}</p><button className="btn-secondary" onClick={()=>setReload(value=>value+1)}>重新读取</button></section>
  const draft=tool.kind!=='COMPOSITION'?{...tool,kind:tool.kind,definition:tool.definition,projectId:'tool:'+id,instrumentKey:'library_tool',createdAt:tool.updatedAt} as ResearchDraft:null
  const items:ToolRef[]=tool.kind==='COMPOSITION'?tool.definition.items:[]
  const readOnly=tool.status!=='DRAFT'
  const titleFields=<div className="survey-template-title"><label>工具名称<input ref={nameInput} className="input" disabled={busy||readOnly||formRisk} maxLength={200} value={tool.title} onChange={event=>{editGeneration.current++;setTool({...tool,title:event.target.value});setDirty(true)}}/></label><div className="survey-template-actions"><button type="button" className="btn-primary" disabled={busy||readOnly||!dirty||!tool.title.trim()||formRisk} onClick={save}>{tool.kind==='FORM'?'保存表单信息':tool.kind==='SCALE'?'保存量表信息':'保存组合信息'}</button></div></div>
  const usageHelp=<details className="survey-library-help"><summary>编制与使用说明</summary><p>此工具由你独立管理，不属于具体研究。保存后可在研究的“发布与采集”中选用；每次选用保留当时的修订，不同步覆盖已有研究。</p><p>{tool.kind==='COMPOSITION'?'普通组合问卷组合已有表单、量表及已授权测评，不生成打包综合报告；研究内仍需配置波次、顺序和反馈策略。':tool.kind==='FORM'?'题目添加、编辑、移除及排序成功后即保存。完成后通过检查与试答核对内容。':'完成题目设置后保存并检查，再通过模拟作答核对内容。量表可设置维度、反向题、总分与原始分区间反馈；研究的报告和发布策略仍单独管理。'}</p></details>
  return <section className={'survey-tool-template'+(tool.kind==='FORM'?' is-form':tool.kind==='SCALE'?' is-scale':' is-composition')} aria-label="独立工具编辑">
    <header className="survey-form-toolbar">
      <div className="survey-form-toolbar-row"><button type="button" className="survey-template-back" disabled={busy} onClick={leave}><ArrowLeft size={17}/>工具集</button><span className="survey-form-toolbar-divider" aria-hidden="true"/>
        <div className="survey-form-toolbar-name"><span className="survey-form-type-label">{libraryKindLabel[tool.kind]}</span><h1 title={tool.title}>{tool.title}</h1><button type="button" className="survey-form-rename" aria-label="编辑名称" aria-expanded={nameOpen} aria-controls="survey-form-name-fields" disabled={busy||readOnly||formRisk} onClick={()=>setNameOpen(value=>!value)}><Pencil size={15}/></button></div>
        <span className="survey-form-toolbar-status">{dirty||formRisk?'未保存':'已保存'}<small>修订 {tool.revision}</small></span>{tool.kind!=='FORM'&&!nameOpen&&<button type="button" className="btn-primary survey-scale-save" disabled={busy||readOnly||!dirty||!tool.title.trim()||formRisk} onClick={save}>{busy?'正在保存…':tool.kind==='SCALE'?'保存量表':'保存组合问卷'}</button>}<button type="button" className="btn-secondary survey-form-check" disabled={busy||readOnly||risk} onClick={check}>{tool.kind==='COMPOSITION'?'检查组合':'检查与试答'}</button>
      </div>
      <div id="survey-form-name-fields" className="survey-form-name-fields" hidden={!nameOpen}>{titleFields}</div>
    </header>
    {error&&<div role="alert" className="survey-library-error">{error}</div>}
    {!!issues.length&&<ul className="survey-library-issues" role="alert">{issues.map((issue,index)=><li key={index}>{issue.path||issue.line&&'第 '+issue.line+' 行'}：{issue.message}</li>)}</ul>}
    {tool.kind==='SCALE'&&<>{notice&&<p role="status" className="survey-library-notice">{notice}</p>}<ResearchScaleEditor key={id} value={tool.definition as ScaleDraft} onChange={change} projectId={'tool:'+id} appearance="studio" disabled={busy||readOnly} onDraftRiskChange={setFormRisk} onSave={save} canSave={dirty&&!busy&&!readOnly&&!!tool.title.trim()}/></>}
    <fieldset disabled={busy||readOnly} className="survey-template-fields">
    {notice&&tool.kind!=='SCALE'&&<p role="status" className="survey-library-notice">{notice}</p>}
    {tool.kind==='FORM'&&<ResearchFormEditor value={tool.definition as FormDraft} onChange={change} projectId={'tool:'+id} appearance="studio" onCommit={commitForm} onDraftRiskChange={setFormRisk} disabled={dirty}/>}
    {tool.kind==='COMPOSITION'&&<><SurveyCompositionEditor key={id} items={items} onChange={next=>change({...tool.definition,items:next})}/><footer className="survey-composition-footer"><p>添加、排序和移除后需保存；检查组合前请先保存全部修改。</p><button type="button" className="btn-primary" disabled={busy||readOnly||!dirty||!tool.title.trim()} onClick={save}>保存当前草稿</button></footer></>}
    {usageHelp}
    {draft&&<details className="survey-library-help"><summary>批量录入题目</summary><ResearchImportGuide draft={draft} onUse={text=>{if(!bulkText.trim()||window.confirm('替换尚未导入的文本？')){setBulkText(text);setBulkFormat('CSV');setBulk(null)}}}/><label>输入格式<select className="input" value={bulkFormat} onChange={event=>{setBulkFormat(event.target.value as 'TEXT'|'CSV');setBulk(null)}}><option value="CSV">CSV</option><option value="TEXT">多行文本</option></select></label><label>待导入内容<textarea className="input" rows={7} value={bulkText} onChange={event=>{setBulkText(event.target.value);setBulk(null)}}/></label><button type="button" className="btn-secondary" disabled={dirty||formRisk||!bulkText.trim()} onClick={()=>void run(async()=>{const batch:Batch={batchId:crypto.randomUUID(),format:bulkFormat,content:bulkText};const result=await api<Bulk>('/tool-library/'+id+'/bulk-import/preview','POST',batch);setBulk({batch,result});setIssues(result.issues)})}>解析并预览</button>{bulk&&<div><p>候选题数：{bulk.result.count}</p><button type="button" className="btn-primary" disabled={dirty||formRisk||!bulk.result.ok||bulk.result.revision!==tool.revision} onClick={()=>void run(async()=>{const result=await api<LibraryTool>('/tool-library/'+id+'/bulk-import/apply','POST',{revision:bulk.result.revision,digest:bulk.result.digest,batch:bulk.batch});setTool(result);setBulk(null);setBulkText('');setReview(null);setPreview(false);setNotice('题目已整批导入。')})}>确认导入</button></div>}</details>}
    {review?.ok&&tool.kind==='COMPOSITION'&&<p role="status">组合结构通过，共 {review.unitCount} 个工具。</p>}
    {draft&&review?.ok&&!risk&&<details className="survey-library-help" open={preview} onToggle={event=>setPreview(event.currentTarget.open)}><summary>模拟作答（不产生正式答卷）</summary>{preview&&<ResearchPreview draft={draft} onSimulate={answers=>void run(async()=>{const result=await api<Review>('/tool-library/'+id+'/preview','POST',{answers});setReview(result);setIssues(result.issues)})} onValidateForm={answers=>void run(async()=>{const result=await api<Review>('/tool-library/'+id+'/form-dry-run','POST',{answers});setIssues(result.issues??[]);setNotice(result.ok?'表单试提交通过。':'请修正作答。')})}/>} {review.score?.scores?.map(score=><p key={score.key}>{score.key}：{score.value??'不可计算'}</p>)}</details>}
    </fieldset>
    <details className="survey-library-help"><summary>其他操作</summary><button type="button" className="btn-secondary" disabled={busy||risk||tool.status!=='DRAFT'} onClick={()=>{if(window.confirm('归档此工具？已有研究中的内容不受影响。'))void run(async()=>{await api('/tool-library/'+id+'/archive','POST',{revision:tool.revision});onReturn()})}}>归档工具</button></details>
  </section>
}
