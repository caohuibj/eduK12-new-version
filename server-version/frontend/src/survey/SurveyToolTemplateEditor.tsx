import {useCallback,useEffect,useRef,useState} from 'react'
import {ArrowLeft,Pencil} from 'lucide-react'
import {toolLibraryApi as api,ToolLibraryError,libraryKindLabel,type LibraryTool,type ToolRef} from './tool-library-api'
import {ResearchFormEditor} from './ResearchFormEditor'
import {ResearchScaleEditor} from './ResearchScaleEditor'
import {ResearchPreview} from './ResearchPreview'
import {ResearchImportGuide} from './ResearchAuthoringGuide'
import type {FormDraft,ScaleDraft,ResearchDraft} from './builder.types'
import type {BuilderLeaveRisk} from './SurveyBuilder'
import {SurveyCompositionEditor} from './SurveyCompositionEditor'
import {SurveyToolManagementGuide} from './SurveyToolManagementGuide'

type Review={ok:boolean;issues:{path?:string;line?:number;message:string}[];score?:{scores?:{key:string;value:number|null;status:string}[]}|null;unitCount?:number}
type Batch={batchId:string;format:'TEXT'|'CSV';content:string}
type Bulk={revision:number;digest:string;ok:boolean;count:number;issues:{line:number;message:string}[]}
export function SurveyToolTemplateEditor({id,onReturn,onLeaveRiskChange}:{id:string;onReturn:()=>void;onLeaveRiskChange?:(risk:BuilderLeaveRisk)=>void}){
  const [tool,setTool]=useState<LibraryTool|null>(null),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true)
  const [error,setError]=useState(''),[issues,setIssues]=useState<Review['issues']>([]),[notice,setNotice]=useState(''),[review,setReview]=useState<Review|null>(null),[preview,setPreview]=useState(false)
  const [bulkText,setBulkText]=useState(''),[bulkFormat,setBulkFormat]=useState<'TEXT'|'CSV'>('CSV'),[bulk,setBulk]=useState<{batch:Batch;result:Bulk}|null>(null)
  const [formRisk,setFormRisk]=useState(false),[nameOpen,setNameOpen]=useState(false)
  const [reload,setReload]=useState(0),[managementAction,setManagementAction]=useState<'archive'|'apply'|null>(null)
  const lock=useRef(false),editGeneration=useRef(0),nameInput=useRef<HTMLInputElement>(null)
  const risk=dirty||!!bulkText.trim()||formRisk
  const applicationBusy=useCallback((value:boolean)=>{lock.current=value;setBusy(value)},[])
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
  const complete=()=>{if(!tool||risk)return;void run(async()=>{const result=await api<LibraryTool>('/tool-library/'+id+'/complete','POST',{revision:tool.revision});setTool(result);setNotice('当前修订已完成编制，可在发布与采集中选用；后续保存修改会退回草稿。')})}
  const leave=()=>{if(busy)return;if(!risk||window.confirm('工具有尚未保存或导入的内容，确定放弃并返回工具集？'))onReturn()}
  if(loading)return <p role="status">正在读取工具…</p>
  if(!tool)return <section className="survey-tool-library"><button className="btn-secondary" onClick={onReturn}>返回工具集</button><p role="alert">{error||'工具不可用'}</p><button className="btn-secondary" onClick={()=>setReload(value=>value+1)}>重新读取</button></section>
  const draft=tool.kind!=='COMPOSITION'?{...tool,kind:tool.kind,definition:tool.definition,projectId:'tool:'+id,instrumentKey:'library_tool',createdAt:tool.updatedAt} as ResearchDraft:null
  const items:ToolRef[]=tool.kind==='COMPOSITION'?tool.definition.items:[]
  const readOnly=tool.status!=='DRAFT'
  const importFormat=tool.kind==='SCALE'?'CSV':bulkFormat
  const titleFields=<div className="survey-template-title"><label>工具名称<input ref={nameInput} className="input" disabled={busy||readOnly||formRisk} maxLength={200} value={tool.title} onChange={event=>{editGeneration.current++;setTool({...tool,title:event.target.value});setDirty(true)}}/></label><div className="survey-template-actions"><button type="button" className="btn-primary" disabled={busy||readOnly||!dirty||!tool.title.trim()||formRisk} onClick={save}>{tool.kind==='FORM'?'保存表单信息':tool.kind==='SCALE'?'保存量表信息':'保存组合信息'}</button></div></div>
  const usageHelp=<details className="survey-library-help"><summary>编制与使用说明</summary><p>此工具由你独立管理，不属于具体研究。保存只保留草稿；确认内容并点击“完成编制”，通过结构与素材校验后，才会出现在“发布与采集”的自建工具候选中。后续保存修改会退回草稿，需重新完成；每次选用保留当时的修订，不同步覆盖已有研究。</p><p>{tool.kind==='COMPOSITION'?'普通组合问卷组合已有表单、量表及已授权测评，不生成打包综合报告；研究内仍需配置波次、顺序和反馈策略。':tool.kind==='FORM'?'题目添加、编辑、移除及排序成功后即保存。完成后通过检查与试答核对内容。':'完成题目设置后保存并检查，再通过模拟作答核对内容。量表可设置维度、反向题、总分与原始分区间反馈；研究的报告和发布策略仍单独管理。'}</p></details>
  return <section className={'survey-tool-template'+(tool.kind==='FORM'?' is-form':tool.kind==='SCALE'?' is-scale':' is-composition')} aria-label="独立工具编辑">
    <header className="survey-form-toolbar">
      <div className="survey-form-toolbar-row"><button type="button" className="survey-template-back" disabled={busy} onClick={leave}><ArrowLeft size={17}/>工具集</button><span className="survey-form-toolbar-divider" aria-hidden="true"/>
        <div className="survey-form-toolbar-name"><span className="survey-form-type-label">{libraryKindLabel[tool.kind]}</span><h1 title={tool.title}>{tool.title}</h1><button type="button" className="survey-form-rename" aria-label="编辑名称" aria-expanded={nameOpen} aria-controls="survey-form-name-fields" disabled={busy||readOnly||formRisk} onClick={()=>setNameOpen(value=>!value)}><Pencil size={15}/></button></div>
        <span className="survey-form-toolbar-status">{risk?'未保存':tool.readiness==='READY'?'已完成编制':'草稿已保存'}<small>修订 {tool.revision}</small></span>{tool.kind!=='FORM'&&!nameOpen&&<button type="button" className="btn-primary survey-scale-save" disabled={busy||readOnly||!dirty||!tool.title.trim()||formRisk} onClick={save}>{busy?'正在保存…':tool.kind==='SCALE'?'保存量表':'保存组合问卷'}</button>}<button type="button" className="btn-secondary survey-form-check" disabled={busy||readOnly||risk} onClick={check}>{tool.kind==='COMPOSITION'?'检查组合':'检查与试答'}</button><button type="button" className="btn-primary survey-form-complete" disabled={busy||readOnly||risk||tool.readiness==='READY'} onClick={complete}>{tool.readiness==='READY'&&!risk?'已完成编制':'完成编制'}</button>
      </div>
      <div id="survey-form-name-fields" className="survey-form-name-fields" hidden={!nameOpen}>{titleFields}</div>
    </header>
    <p className="survey-tool-completion-hint">{tool.readiness==='READY'&&!risk?'此修订已完成编制，可加入研究。后续保存修改后需重新完成。':'保存保留草稿；核对内容、检查与试答后，点击“完成编制”才能在研究中选用。'}</p>
    {error&&<div role="alert" className="survey-library-error">{error}</div>}
    {!!issues.length&&<ul className="survey-library-issues" role="alert">{issues.map((issue,index)=><li key={index}>{issue.path||issue.line&&'第 '+issue.line+' 行'}：{issue.message}</li>)}</ul>}
    {tool.kind==='SCALE'&&<>{notice&&<p role="status" className="survey-library-notice">{notice}</p>}<ResearchScaleEditor key={id} value={tool.definition as ScaleDraft} onChange={change} projectId={'tool:'+id} appearance="studio" disabled={busy||readOnly} onDraftRiskChange={setFormRisk} onSave={save} canSave={dirty&&!busy&&!readOnly&&!!tool.title.trim()}/></>}
    <fieldset disabled={busy||readOnly} className="survey-template-fields">
    {notice&&tool.kind!=='SCALE'&&<p role="status" className="survey-library-notice">{notice}</p>}
    {tool.kind==='FORM'&&<ResearchFormEditor value={tool.definition as FormDraft} onChange={change} projectId={'tool:'+id} appearance="studio" onCommit={commitForm} onDraftRiskChange={setFormRisk} disabled={dirty}/>}
    {tool.kind==='COMPOSITION'&&<><SurveyCompositionEditor key={id} items={items} onChange={next=>change({...tool.definition,items:next})}/><footer className="survey-composition-footer"><p>添加、排序和移除后需保存；检查组合前请先保存全部修改。</p><button type="button" className="btn-primary" disabled={busy||readOnly||!dirty||!tool.title.trim()} onClick={save}>保存当前草稿</button></footer></>}
    {usageHelp}
    {draft&&<details className="survey-library-help survey-tool-import"><summary>批量录入题目</summary>
      <div className="survey-tool-import-guide"><h3>{tool.kind==='SCALE'?'使用 CSV 批量追加量表题目':'批量追加表单题目'}</h3><p>导入会追加题目，不覆盖已有内容。每批最多 200 题；请先保存当前修改，再解析预览。</p>
      {tool.kind==='SCALE'?<><p>简单题干可到“题目”分区的“批量录入与辅助题”逐行追加。此处使用 CSV，可同时指定维度与反向计分。</p><p>请先设置并保存共享响应选项和至少一个计分维度。CSV 的 type 填 LIKERT，required 填 true，options 留空；dimension 留空时归入首个维度，reverse 填 true 或 false。量表题目总数最多 240 道。</p></>:<p>CSV 可携带题型与选项；多行文本以空行分隔题块，每块第一行是题干，后续行是选项。复杂题型请使用完整 CSV 模板。</p>}
      <ol><li>展开下方模板说明，复制或填入模板后修改题目。</li><li>点击“解析并预览”，核对候选题数与错误提示；这一步不会写入。</li><li>预览通过后点击“确认导入”，题目才会写入并立即保存；已有研究中的副本不随之更新。</li></ol></div>
      <ResearchImportGuide draft={draft} onUse={text=>{if(!bulkText.trim()||window.confirm('替换尚未导入的文本？')){setBulkText(text);setBulkFormat('CSV');setBulk(null)}}}/><label>输入格式<select className="input" value={importFormat} onChange={event=>{setBulkFormat(event.target.value as 'TEXT'|'CSV');setBulk(null)}}><option value="CSV">CSV</option>{tool.kind!=='SCALE'&&<option value="TEXT">多行文本</option>}</select></label><label>待导入内容<textarea className="input" rows={7} value={bulkText} onChange={event=>{setBulkText(event.target.value);setBulk(null)}}/></label><button type="button" className="btn-secondary" disabled={dirty||formRisk||!bulkText.trim()} onClick={()=>void run(async()=>{const batch:Batch={batchId:crypto.randomUUID(),format:importFormat,content:bulkText};const result=await api<Bulk>('/tool-library/'+id+'/bulk-import/preview','POST',batch);setBulk({batch,result});setIssues(result.issues)})}>解析并预览</button>{bulk&&<div><p>候选题数：{bulk.result.count}</p><button type="button" className="btn-primary" disabled={dirty||formRisk||!bulk.result.ok||bulk.result.revision!==tool.revision} onClick={()=>void run(async()=>{const result=await api<LibraryTool>('/tool-library/'+id+'/bulk-import/apply','POST',{revision:bulk.result.revision,digest:bulk.result.digest,batch:bulk.batch});setTool(result);setBulk(null);setBulkText('');setReview(null);setPreview(false);setNotice('题目已整批导入。')})}>确认导入</button></div>}</details>}
    {review?.ok&&tool.kind==='COMPOSITION'&&<p role="status">组合结构通过，共 {review.unitCount} 个工具。</p>}
    {draft&&review?.ok&&!risk&&<details className="survey-library-help" open={preview} onToggle={event=>setPreview(event.currentTarget.open)}><summary>模拟作答（不产生正式答卷）</summary>{preview&&<ResearchPreview draft={draft} onSimulate={answers=>void run(async()=>{const result=await api<Review>('/tool-library/'+id+'/preview','POST',{answers});setReview(result);setIssues(result.issues)})} onValidateForm={answers=>void run(async()=>{const result=await api<Review>('/tool-library/'+id+'/form-dry-run','POST',{answers});setIssues(result.issues??[]);setNotice(result.ok?'表单试提交通过。':'请修正作答。')})}/>} {review.score?.scores?.map(score=><p key={score.key}>{score.key}：{score.value??'不可计算'}</p>)}</details>}
    </fieldset>
    <details className="survey-library-help"><summary>其他操作</summary><div className="survey-tool-management">
      <div className="survey-tool-management-options" aria-label="工具管理操作">
        <button type="button" className="btn-secondary" disabled={busy} aria-expanded={managementAction==='apply'} onClick={()=>setManagementAction(managementAction==='apply'?null:'apply')}>申请入库</button>
        <button type="button" className="btn-secondary" disabled={busy} aria-expanded={managementAction==='archive'} onClick={()=>setManagementAction(managementAction==='archive'?null:'archive')}>归档工具</button>
      </div>
      {managementAction==='apply'&&<SurveyToolManagementGuide key={id} tool={tool} disabled={risk||readOnly} busy={busy} onBusyChange={applicationBusy} onPublish={async()=>{
        let releaseId:string|null=null
        await run(async()=>{const result=await api<{releaseId:string}>('/tool-library/'+id+'/measurement-release','POST',{revision:tool.revision});releaseId=result.releaseId;setNotice('当前修订已发布，请核对资料后提交入库申请。')})
        return releaseId
      }}/>}
      {managementAction==='archive'&&
      <section className="survey-tool-management-card" aria-label="归档说明"><h3>归档工具</h3><p>归档后从“我编制的”列表隐藏，不能再加入新研究。已有研究中的独立副本保留；尚未选用的组合问卷若引用此工具，需先替换其中的引用。当前暂无恢复入口。</p>
      {risk&&<p>请先保存修改，或应用、清空尚未导入的内容，再归档。</p>}
      <button type="button" className="btn-secondary" disabled={busy||risk||tool.status!=='DRAFT'} onClick={()=>{if(window.confirm('归档后此工具将从列表隐藏，不能继续新选用；已有研究副本保留，当前暂无恢复入口。确定归档？'))void run(async()=>{await api('/tool-library/'+id+'/archive','POST',{revision:tool.revision});onReturn()})}}>确认归档</button></section>}
    </div></details>
  </section>
}
