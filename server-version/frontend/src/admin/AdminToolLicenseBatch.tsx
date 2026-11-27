import {firstLicenseCutover} from './toolLicenseRollout'
import {useEffect,useRef} from 'react'
import type {Product} from './toolLicenseFocus'

type BatchTool = {key:string;limit:number|null}
type BatchSubject = {id:string;label:string;description?:string}
export type BatchIntent = {
 requestId:string
 product:Product
 subjectIds:string[]
 startsAt:string
 expiresAt:string
 reason:string
 tools:BatchTool[]
}
export type BatchCommit = BatchIntent & {previewDigest:string}
export type BatchPreview = {
 requestId:string
 product:Product
 startsAt:string
 expiresAt:string
 reason:string
 subjects:BatchSubject[]
 tools:Array<BatchTool & {name:string;family:string}>
 previewDigest:string
 conflicts:Array<{subjectId:string;label:string;reason:string}>
}
export type BatchReceipt = {
 requestId:string
 licenses:Array<{
  id:string;product:Product;subjectId:string;subjectLabel:string;startsAt:string;expiresAt:string
  tools:Array<BatchTool & {name:string}>
 }>
}

export function readPendingBatch(storageKey:string,product:Product):BatchCommit|null {
 const stored=sessionStorage.getItem(storageKey)
 if(stored===null)return null
 const input=JSON.parse(stored) as BatchCommit
 if(!input||input.product!==product||typeof input.requestId!=='string'
  ||!Array.isArray(input.subjectIds)||input.subjectIds.length<2||input.subjectIds.some(id=>typeof id!=='string')
  ||!Number.isFinite(Date.parse(input.startsAt))||!Number.isFinite(Date.parse(input.expiresAt))
  ||typeof input.reason!=='string'||!Array.isArray(input.tools)||!input.tools.length
  ||input.tools.some(tool=>!tool||typeof tool.key!=='string'||!(tool.limit===null||Number.isSafeInteger(tool.limit)&&tool.limit>0&&tool.limit<=2147483647))
  ||typeof input.previewDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.previewDigest)){
  throw new Error('待核对的批量签发记录不完整，请保留本标签页并联系管理员核对。')
 }
 return input
}

function sameTools(returned:BatchTool[],expected:BatchTool[]){
 return Array.isArray(returned)&&returned.length===expected.length
  &&expected.every(tool=>returned.some(value=>value.key===tool.key&&value.limit===tool.limit))
}
export function matchesBatchPreview(preview:BatchPreview|undefined,input:BatchIntent):preview is BatchPreview {
 if(!preview||preview.requestId!==input.requestId||preview.product!==input.product
  ||Date.parse(preview.startsAt)!==Date.parse(input.startsAt)||Date.parse(preview.expiresAt)!==Date.parse(input.expiresAt)
  ||preview.reason!==input.reason||!/^[a-f0-9]{64}$/.test(preview.previewDigest)
  ||!Array.isArray(preview.subjects)||!Array.isArray(preview.conflicts)||!sameTools(preview.tools,input.tools))return false
 const ids=new Set([...preview.subjects.map(row=>row.id),...preview.conflicts.map(row=>row.subjectId)])
 return ids.size===input.subjectIds.length&&input.subjectIds.every(id=>ids.has(id))
}
export function isBatchReceipt(receipt:BatchReceipt|undefined,input:BatchCommit):receipt is BatchReceipt {
 return receipt?.requestId===input.requestId&&Array.isArray(receipt.licenses)
  &&receipt.licenses.length===input.subjectIds.length
  &&input.subjectIds.every(id=>receipt.licenses.some(row=>row.subjectId===id&&row.product===input.product
   &&Date.parse(row.startsAt)===Date.parse(input.startsAt)&&Date.parse(row.expiresAt)===Date.parse(input.expiresAt)
   &&sameTools(row.tools,input.tools)))
}

export function BatchConfirmation({preview,selectedSubjects,busy,onCancel,onConfirm,formatTime,commercialCheckEnabled}:{
 preview:BatchPreview;selectedSubjects:BatchSubject[];busy:boolean;onCancel:()=>void;onConfirm:()=>void;formatTime:(value:string)=>string;commercialCheckEnabled?:boolean
}){
 const conflicts=new Map(preview.conflicts.map(row=>[row.subjectId,row]))
 const section=useRef<HTMLElement>(null)
 useEffect(()=>{section.current?.focus()},[])
 return <section className="sys-message tool-batch-preview" aria-label="批量签发预览" tabIndex={-1} ref={section}>
  <h3>批量签发预览</h3>
  <p>{formatTime(preview.startsAt)} 至 {formatTime(preview.expiresAt)}</p>
  {commercialCheckEnabled&&<p>{firstLicenseCutover}</p>}
  <p>每个授权对象分别获得以下工具及额度。标签用于选工具，已确认的名单会记录在本次许可。</p>
  <h4>授权对象（{selectedSubjects.length}）</h4>
  <ul>{selectedSubjects.map(subject=>{
   const record=preview.subjects.find(row=>row.id===subject.id)
   const conflict=conflicts.get(subject.id)
   return <li key={subject.id}><strong>{record?.label??subject.label}</strong>
    {record?.description&&!record.label.includes(record.description)&&<span> · {record.description}</span>}
    {conflict&&<p role="alert">{conflict.reason}</p>}
   </li>
  })}</ul>
  <h4>实际覆盖的工具（{preview.tools.length}）</h4>
  <ul>{preview.tools.map(tool=><li key={tool.key}>{tool.name} · {tool.limit===null?'不限次数':tool.limit+' 次'}</li>)}</ul>
  <p>原因：{preview.reason}</p>
  {!!preview.conflicts.length&&<p role="alert">有对象暂不可签发，请返回修改后重新预览。</p>}
  <div className="system-actions">
   <button type="button" disabled={busy} onClick={onCancel}>返回修改</button>
   <button type="button" disabled={busy||Boolean(preview.conflicts.length)} onClick={onConfirm}>确认批量签发 {selectedSubjects.length} 份许可</button>
  </div>
 </section>
}
