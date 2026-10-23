import {useEffect,useRef,useState} from 'react'
import {privateToolBase,privateToolError,type PrivateTool,type PrivateToolApi} from './privateToolClient'

type Preview={digest:string;previewToken:string;previewExpiresAt:number;expectedRevision:number;expectedContentHash:string;
 count:number;totalItems:number;responseSetKey:string;responseSet:{options:Array<{value:string|number;label:string;score:number}>};
 scores:Array<{key:string;label:string;aggregation:string}>;items:Array<{itemCode:string;content:string;reverse:boolean;scoreKeys:string[]}>}
type Props={api:PrivateToolApi;organizationId:string;tool:PrivateTool;disabled:boolean;
 onImported:(tool:PrivateTool)=>void;onBusy:(value:boolean)=>void;onPendingChange?:(value:boolean)=>void}
export function EducationScaleCsvImport({api,organizationId,tool,disabled,onImported,onBusy,onPendingChange}:Props){
 const [content,setContent]=useState(''),[preview,setPreview]=useState<Preview|null>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false)
 const alive=useRef(true),pending=useRef(false),requestId=useRef(0)
 const identity=useRef({api,organizationId,id:tool.id,revision:tool.revision,hash:tool.contentHash})
 identity.current={api,organizationId,id:tool.id,revision:tool.revision,hash:tool.contentHash}
 const callbacks=useRef({onBusy,onPendingChange});callbacks.current={onBusy,onPendingChange}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;callbacks.current.onBusy(false);callbacks.current.onPendingChange?.(false)}},[])
 useEffect(()=>{requestId.current+=1;pending.current=false;setBusy(false);callbacks.current.onBusy(false);setPreview(null)},[api,organizationId,tool.id,tool.revision,tool.contentHash])
 const run=async(apply:boolean)=>{
  if(pending.current||disabled||!content||apply&&!preview)return
  const generation=++requestId.current,started=identity.current
  const current=()=>alive.current&&requestId.current===generation&&identity.current.api===started.api&&identity.current.organizationId===started.organizationId&&identity.current.id===started.id&&identity.current.revision===started.revision&&identity.current.hash===started.hash
  pending.current=true;setBusy(true);onBusy(true);setMessage('');setFailed(false)
  try{
   const body={content,expectedRevision:tool.revision,expectedContentHash:tool.contentHash,
    ...(apply&&preview?{digest:preview.digest,previewToken:preview.previewToken,previewExpiresAt:preview.previewExpiresAt}:{})}
   const path=`${privateToolBase(organizationId)}/${encodeURIComponent(tool.id)}/import/${apply?'apply':'preview'}`
   if(apply){
    const value=await api<PrivateTool&{importedCount:number}>(path,'POST',body)
    if(!current())return
    setContent('');setPreview(null);onPendingChange?.(false)
    // The parent intentionally remounts the editor on complete server DTOs.
    pending.current=false;setBusy(false);onBusy(false);onImported(value)
   }else{
    const value=await api<Preview>(path,'POST',body)
    if(!current())return
    setPreview(value);setMessage('预检通过，凭据有效期 10 分钟。请核对题干、反向计分、计分项和共享选项，再确认追加保存。')
   }
  }catch(error){
   if(!current())return
   setPreview(null);setFailed(true)
   const value=error as {code?:string;message?:string;data?:{issues?:Array<{path:string;message:string}>}}
   const code=value.code??value.message
   const detail=code==='PRIVATE_TOOL_CSV_PREVIEW_EXPIRED'?'预检凭据已失效或内容已变化，请重新预检。':
    code==='PRIVATE_TOOL_CSV_INVALID'?'CSV 未通过校验。':code==='PRIVATE_TOOL_CSV_SCALE_REQUIRED'?'CSV 导入仅支持私有量表草稿。':privateToolError(error)
   setMessage([detail,...(value.data?.issues??[]).map(issue=>`${issue.path}：${issue.message}`),'输入已保留，不会自动覆盖本页或重新提交。'].join(' '))
  }finally{
   if(current()){pending.current=false;setBusy(false);onBusy(false)}
  }
 }
 return <section className="education-private-csv" aria-label="CSV 批量导入">
  <h3>CSV 批量导入</h3>
  <p>仅向已保存且合法的本人私有量表草稿追加计分单选题。先保存至少一题、一套共享响应选项和计分项；最多共 200 题、50 个共享选项，CSV 不超过 200000 字节。</p>
  <p>表头：item_code,prompt,reverse,score_keys,response_set_key。reverse 填 true/false，多个现有直接计分项用 | 分隔。题干、维度映射和反向计分将逐题预检，选项与分值沿用当前共享响应集。</p>
  <p>此 CSV 协议不支持辅助题、新建维度、新选项、多响应集或素材附件。请使用编辑器配置这些内容。导入不会发布，也不会修改已固定版本。</p>
  {disabled&&!busy&&<p role="status">请先保存编辑内容并应用或清除其他批量内容，等待当前操作完成后再导入。</p>}
  <label>CSV 内容<textarea aria-label="CSV 内容" value={content} maxLength={200000} disabled={busy||disabled} onChange={event=>{
   const text=event.target.value;setContent(text);setPreview(null);setMessage('');onPendingChange?.(Boolean(text))
  }}/></label>
  <button type="button" disabled={busy||disabled||!content} onClick={()=>void run(false)}>预检导入</button>
  <button type="button" disabled={busy||!content} onClick={()=>{setContent('');setPreview(null);setMessage('');onPendingChange?.(false)}}>清除 CSV 内容</button>
  {message&&<p role={failed?'alert':'status'} aria-live="polite">{message}</p>}
  {preview&&<div>
   <p>新增 {preview.count} 题，保存后共 {preview.totalItems} 题。共享响应集：{preview.responseSetKey}</p>
   <ul>{preview.responseSet.options.map(option=><li key={String(option.value)}>{String(option.value)}：{option.label}，分值 {option.score}</li>)}</ul>
   <ul>{preview.scores.map(score=><li key={score.key}>{score.key}：{score.label}（{score.aggregation}）</li>)}</ul>
   <ol>{preview.items.map(item=><li key={item.itemCode}>{item.itemCode}：{item.content}；{item.reverse?'反向计分':'正向计分'}；计分项：{item.scoreKeys.join('、')}</li>)}</ol>
   <button type="button" className="education-private-primary" disabled={busy||disabled} onClick={()=>void run(true)}>确认导入并保存草稿</button>
  </div>}
 </section>
}
