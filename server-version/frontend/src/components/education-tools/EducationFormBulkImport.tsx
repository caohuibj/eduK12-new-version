import {useEffect,useRef,useState} from 'react'
import {authoringImportTemplate} from '../../survey/authoring-import-template'
import type {FormDraft} from '../../survey/builder.types'
import {privateToolBase,privateToolError,type PrivateTool,type PrivateToolApi} from './privateToolClient'

type Proof={digest:string;previewToken:string;previewExpiresAt:number;expectedRevision:number;expectedContentHash:string}
type Preview={ok:boolean;issues:Array<{line:number;message:string}>;count:number;totalQuestions:number;totalFields:number;
 groups:Array<{title:string;addedCount:number}>;items:Array<{line:number;type:string;prompt:string;required:boolean;options:string[];rows:string[]}>}&Partial<Proof>
type Props={api:PrivateToolApi;organizationId:string;actorId?:string;tool:PrivateTool;disabled:boolean;onImported:(tool:PrivateTool)=>void;onBusy:(busy:boolean)=>void;onPendingChange:(pending:boolean)=>void}
const kinds:Record<string,string>={SINGLE:'单选',MULTIPLE:'多选',SHORT_TEXT:'短文本',LONG_TEXT:'长文本',NUMBER:'数值',LIKERT:'Likert',MATRIX:'矩阵',DATE:'日期',TIME:'时间',RANK_ORDER:'排序',SLIDER:'滑块',CONSTANT_SUM:'恒定总和',MATRIX_MULTIPLE:'矩阵多选'}
export function EducationFormBulkImport(props:Props){return <ImportSession key={`${props.actorId??'author'}:${props.organizationId}:${props.tool.id}`} {...props}/>}
function ImportSession({api,organizationId,tool,disabled,onImported,onBusy,onPendingChange}:Props){
 const form=tool.definition as FormDraft
 const [format,setFormat]=useState<'CSV'|'TEXT'>('CSV'),[content,setContent]=useState(''),[target,setTarget]=useState('')
 const [batchId,setBatchId]=useState(()=>crypto.randomUUID()),[preview,setPreview]=useState<Preview|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false)
 const alive=useRef(true),locked=useRef(false),generation=useRef(0)
 const callbacks=useRef({onBusy,onPendingChange});callbacks.current={onBusy,onPendingChange}
 const identity=useRef({api,revision:tool.revision,hash:tool.contentHash});identity.current={api,revision:tool.revision,hash:tool.contentHash}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;callbacks.current.onBusy(false);callbacks.current.onPendingChange(false)}},[])
 useEffect(()=>{generation.current++;locked.current=false;setBusy(false);callbacks.current.onBusy(false);setPreview(null);setUncertain(false)},[api,tool.revision,tool.contentHash])
 useEffect(()=>{if(disabled)setPreview(null)},[disabled])
 useEffect(()=>{callbacks.current.onPendingChange(Boolean(content))},[content])
 const replace=(text:string)=>{setContent(text);setBatchId(crypto.randomUUID());setPreview(null);setError('');onPendingChange(Boolean(text))}
 const run=async(apply:boolean)=>{
  if(disabled||locked.current||uncertain||!content.trim()||apply&&(!preview?.ok||!preview.digest||!preview.previewToken||!preview.previewExpiresAt))return
  const started=identity.current,token=++generation.current
  const current=()=>alive.current&&generation.current===token&&identity.current.api===started.api&&identity.current.revision===started.revision&&identity.current.hash===started.hash
  locked.current=true;setBusy(true);onBusy(true);setError('')
  const body={format,content,batchId,...(target?{targetPageKey:target}:{}),expectedRevision:tool.revision,expectedContentHash:tool.contentHash,
   ...(apply?{digest:preview!.digest,previewToken:preview!.previewToken,previewExpiresAt:preview!.previewExpiresAt}:{})}
  try{
   const path=`${privateToolBase(organizationId)}/${encodeURIComponent(tool.id)}/form-import/${apply?'apply':'preview'}`
   if(apply){
    const result=await api<PrivateTool>(path,'POST',body)
    if(!current())return
    setContent('');setPreview(null);onPendingChange(false);locked.current=false;setBusy(false);onBusy(false);onImported(result)
   }else{
    const result=await api<Preview>(path,'POST',body)
    if(!current())return
    if(result.ok&&(result.expectedRevision!==tool.revision||result.expectedContentHash!==tool.contentHash||!result.digest||!result.previewToken||!result.previewExpiresAt))throw Error('预览与当前草稿不一致，请重新读取并核对。')
    setPreview(result)
   }
  }catch(cause){
   if(!current())return
   setPreview(null)
   const value=cause as {code?:string;message?:string;status?:number;data?:{issues?:Array<{line?:number;path?:string;message:string}>}}
   const code=typeof value.code==='string'?value.code:typeof value.message==='string'?value.message:''
   const unknown=apply&&(!value.status||value.status>=500)&&!code?.startsWith('PRIVATE_TOOL_')
   if(unknown)setUncertain(true)
   const message=unknown?'导入结果尚未确认，已暂停再次导入。请使用上方“重新读取草稿”核对题目。':code==='PRIVATE_TOOL_FORM_IMPORT_PREVIEW_EXPIRED'?'预览已过期或导入内容已变化，请重新解析预览。':code==='PRIVATE_TOOL_FORM_IMPORT_INVALID'?'导入内容未通过校验。':privateToolError(cause)
   setError([message,...(value.data?.issues??[]).map(issue=>`${issue.line?'第 '+issue.line+' 行':issue.path??''}：${issue.message}`),'输入已保留，不会自动重试或覆盖已有题目。'].join(' '))
  }finally{if(current()){locked.current=false;setBusy(false);onBusy(false)}}
 }
 return <details className="education-form-import"><summary>批量导入题目 · CSV／多行文本</summary><section aria-label="表单批量导入">
  <p>解析预览后确认追加，不覆盖已有题目；确认时保存草稿。</p>
  <div className="education-form-import-settings"><label>输入格式<select aria-label="表单导入格式" value={format} disabled={busy||disabled||uncertain} onChange={event=>{setFormat(event.target.value as 'CSV'|'TEXT');setPreview(null);setError('')}}><option value="CSV">CSV</option><option value="TEXT">多行文本</option></select></label>
   <label>追加位置<select aria-label="导入题目追加位置" value={target} disabled={busy||disabled||uncertain} onChange={event=>{setTarget(event.target.value);setPreview(null);setError('')}}><option value="">新建导入分组</option>{form.pages.map(page=><option key={page.pageKey} value={page.pageKey}>{page.title||'未命名分组'}（现有 {page.questions.length} 题）</option>)}</select></label></div>
  <details className="education-form-import-help"><summary>格式说明与示例</summary><p>已有题目、选项、素材和固定版本保持原样；导入确认后保存为新的草稿修订。</p><p>CSV 每行一题，必需表头为 type,prompt；options 和 rows 用 || 分隔。单元格包含逗号、换行或双引号时按 CSV 引号规则填写。模板覆盖当前表单版本支持的题型。</p>
   <p>多行文本按空行分隔题目：每块第一行为题干，后续行为选项；有选项识别为单选，无选项识别为短文本，默认必答。复杂题型和数值规则使用 CSV。</p>
   <pre>{format==='CSV'?'type,prompt,required,options\nSINGLE,今天的感受如何？,true,轻松||一般||需要支持\nTEXT,还想补充什么？,false,':'今天的感受如何？\n轻松\n一般\n需要支持\n\n还想补充什么？'}</pre>
   <button type="button" disabled={busy||disabled||uncertain||Boolean(content)} onClick={()=>{setFormat('CSV');replace(authoringImportTemplate('FORM',form.schemaVersion))}}>填入完整 CSV 模板</button>
   <p>单批最多 200 题、200000 字节；每组最多 80 题，选择新建时自动分组。整份表单最多 40 组、500 个作答字段。导入不配置计分、条件引用或媒体附件，这些内容继续在题目编辑区设置。</p>
  </details>
  {disabled&&!busy&&<p role="status">请先保存现有修改，应用或清空其他批量内容，等待当前操作完成后再导入。</p>}
  <div className="education-form-import-workspace"><div className="education-form-import-input"><label>待导入内容<textarea aria-label="表单待导入内容" rows={7} maxLength={200000} value={content} disabled={busy||disabled||uncertain} onChange={event=>replace(event.target.value)}/></label>
  <div className="education-form-import-actions"><button type="button" disabled={busy||disabled||uncertain||!content.trim()} onClick={()=>void run(false)}>{busy?'正在处理…':'解析并预览'}</button><button type="button" disabled={busy||uncertain||!content} onClick={()=>replace('')}>清空导入内容</button></div>
  {error&&<p role="alert">{error}</p>}</div>
  {preview&&<section className="education-form-import-preview" aria-label="导入预览结果">
   <p role="status">识别到 {preview.count} 题。{preview.ok?`确认后共 ${preview.totalQuestions} 题、${preview.totalFields} 个作答字段。尚未写入。`:'请先修正以下问题，再重新解析预览；尚未写入。'}</p>
   {preview.issues.length>0&&<ul role="alert" aria-label="导入错误">{preview.issues.map((issue,index)=><li key={index}>第 {issue.line} 行：{issue.message}</li>)}</ul>}
   {preview.ok&&<p>追加到：{preview.groups.map(group=>`${group.title}（新增 ${group.addedCount} 题）`).join('、')}。预览有效期 10 分钟。</p>}
   <ol>{preview.items.map((item,index)=><li key={index}><div><strong>{index+1}. {item.prompt}</strong><span>第 {item.line} 行 · {kinds[item.type]??item.type} · {item.required?'必答':'选答'}</span></div>{item.options.length>0&&<p>选项：{item.options.join(' / ')}</p>}{item.rows.length>0&&<p>矩阵行：{item.rows.join(' / ')}</p>}</li>)}</ol>
   {preview.ok&&<button type="button" className="education-private-primary" disabled={busy||disabled||uncertain} onClick={()=>void run(true)}>确认追加并保存草稿</button>}
  </section>}</div>
 </section></details>
}
