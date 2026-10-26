import {useEffect,useRef,useState} from 'react'
import type {EducationRosterApi,RosterKind,RosterSheet} from './types'
import {downloadRosterErrors,downloadRosterFile,inspectRosterHeader,mappedRosterText,readRosterText,rosterFields,rosterLabels,rosterTemplates,structureFileText} from './preparation'
import './education-roster.css'

type Props={api:EducationRosterApi;organizationId:string;kind:RosterKind;text:string;disabled?:boolean;onText:(text:string)=>void;onInvalidate:()=>void;onBlocked:(blocked:boolean)=>void;onError?:(error:unknown)=>void;fileLabel?:string}
export function EducationRosterSource({api,organizationId,kind,text,disabled,onText,onInvalidate,onBlocked,onError,fileLabel='CSV／Excel 文件'}:Props){
 const [sheets,setSheets]=useState<RosterSheet[]>([]),[sheet,setSheet]=useState(0)
 const [mapping,setMapping]=useState<Record<string,number>>({}),[headerValid,setHeaderValid]=useState(false)
 const [structureRows,setStructureRows]=useState<RosterSheet['rows']>([])
 const [reading,setReading]=useState(false),[error,setError]=useState(''),[filename,setFilename]=useState('')
 const alive=useRef(true),request=useRef(0),blocked=useRef(onBlocked)
 blocked.current=onBlocked
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;blocked.current(false)}},[])
 const selectedFile=useRef<File|undefined>(undefined)
 const previousText=useRef(text)
 useEffect(()=>{
  if(previousText.current!==text){
   previousText.current=text;selectedFile.current=undefined;request.current++;setSheets([]);setStructureRows([]);setReading(false);blocked.current(false)
  }
 },[text])
 const invalidate=()=>{onInvalidate();onBlocked(true);setError('');setStructureRows([])}
 const report=(cause:unknown)=>{setError(cause instanceof Error?cause.message:'文件读取失败，当前文本已保留。');onError?.(cause)}
 const prepare=(values:RosterSheet[],index=0)=>{
  setSheets(values);setSheet(index);setMapping({});setHeaderValid(false);setStructureRows([])
  const rows=values[index]?.rows??[]
  if(kind==='GRADE'||kind==='CLASS'){
   try{structureFileText(rows,kind);setStructureRows(rows)}catch{ /* Normal header validation still explains invalid input. */ }
  }
  const result=inspectRosterHeader(rows,kind)
  setMapping(result);setHeaderValid(true)
 }
 const read=async(file:File|undefined)=>{
  if(!file)return
  selectedFile.current=file
  const id=++request.current
  invalidate();setSheets([]);setReading(true);setFilename('')
  try{
   if(file.size>64000)throw Error('文件超过 64 KB，请拆分后导入。当前文本已保留。')
   let values:RosterSheet[]
   if(/\.xlsx$/i.test(file.name??'')){
    const bytes=new Uint8Array(await file.arrayBuffer())
    let binary=''
    for(const byte of bytes)binary+=String.fromCharCode(byte)
    values=(await api<{sheets:RosterSheet[]}>(`/organizations/${organizationId}/roster-files/read`,'POST',{content:btoa(binary)})).sheets
   }else{
    if(file.name&&!/\.(csv|tsv|txt)$/i.test(file.name))throw Error('请选择 UTF-8 CSV、文本或 .xlsx 文件。')
    let value:string
    try{value=await file.text()}catch{throw Error('文件读取失败，当前文本已保留。请重选文件或直接粘贴。')}
    values=[{name:'文本名单',rows:readRosterText(value)}]
   }
   if(alive.current&&id===request.current){setFilename(file.name||'所选文件');prepare(values)}
  }catch(cause){if(alive.current&&id===request.current){report(cause);onBlocked(false)}}
  finally{if(alive.current&&id===request.current)setReading(false)}
 }
 const pasted=()=>{
  invalidate();setFilename('粘贴内容')
  try{prepare([{name:'粘贴内容',rows:readRosterText(text)}])}catch(cause){report(cause);onBlocked(false)}
 }
 const finish=(value:string)=>{selectedFile.current=undefined;onText(value);setSheets([]);setStructureRows([]);setError('');onBlocked(false)}
 const apply=()=>{
  if(!headerValid)return
  try{finish(mappedRosterText(sheets[sheet].rows,kind,mapping))}catch(cause){report(cause)}
 }
 const useHeaderless=()=>{
  if(kind!=='GRADE'&&kind!=='CLASS')return
  try{finish(structureFileText(structureRows,kind))}catch(cause){report(cause)}
 }
 const cancel=()=>{selectedFile.current=undefined;request.current++;setSheets([]);setStructureRows([]);setError('');onBlocked(false)}
 const chooseSheet=(index:number)=>{
  invalidate()
  try{prepare(sheets,index)}catch(cause){report(cause);onBlocked(false)}
 }
 const template=async()=>{
  const id=++request.current
  setReading(true);setError('')
  try{
   const blob=await api<Blob>(`/organizations/${organizationId}/roster-files/template?kind=${kind}`,'GET',undefined,{responseType:'blob'})
   if(alive.current&&id===request.current)downloadRosterFile(blob,`${rosterLabels[kind]}模板.xlsx`)
  }catch(cause){if(alive.current&&id===request.current)report(cause)}
  finally{if(alive.current&&id===request.current)setReading(false)}
 }
 const current=sheets[sheet],headerless=structureRows.length>0&&(!headerValid||Object.values(mapping).every(v=>v<0))
 return <div className="er-source" aria-busy={reading}>
  <div className="er-file-toolbar">
   <label className="hs-field"><span>{fileLabel}</span><input type="file" accept=".csv,.tsv,.txt,.xlsx" disabled={disabled||reading} onChange={e=>{void read(e.target.files?.[0]);e.target.value=''}}/></label>
   <details><summary>模板与格式</summary><p>含表头，每批 1–100 行、64 KB。Excel 编号列必须为文本，保留前导零。一次选择一个工作表，不合并或截断内容。</p>
    <div className="er-actions"><button type="button" disabled={disabled||reading} onClick={()=>downloadRosterFile(new Blob(['\uFEFF'+rosterTemplates[kind]],{type:'text/csv;charset=utf-8'}),`${rosterLabels[kind]}模板.csv`)}>CSV 模板</button><button type="button" disabled={disabled||reading} onClick={()=>void template()}>Excel 模板</button></div>
   </details>
  </div>
  <button className="er-match-paste" type="button" disabled={disabled||reading||!text.trim()} onClick={pasted}>匹配粘贴表头</button>
  {reading&&<p role="status">正在读取文件…</p>}
  {error&&<div className="er-file-error" role="alert"><span>{error} 当前输入未覆盖。</span>{selectedFile.current&&<button type="button" disabled={disabled||reading} onClick={()=>void read(selectedFile.current)}>重新读取文件</button>}<button type="button" onClick={()=>downloadRosterErrors([{line:'文件／映射',message:error}])}>下载问题清单</button></div>}
  {headerless&&<div className="er-headerless"><span>文件没有表头时，可保留首行作为名单内容。</span><button type="button" disabled={disabled||reading} onClick={useHeaderless}>按无表头名单使用（保留首行）</button></div>}
  {current&&<section className="er-mapping" aria-label="表头映射与样例">
   <div className="er-mapping-heading"><strong>核对表头 · {filename}</strong>
    {sheets.length>1&&<label>工作表<select aria-label="选择工作表" value={sheet} disabled={reading} onChange={e=>chooseSheet(Number(e.target.value))}>{sheets.map((s,i)=><option key={i} value={i}>{s.name}</option>)}</select></label>}
   </div>
   {headerValid&&<>
    <div className="er-mapping-fields">{rosterFields[kind].map(f=><label className="hs-field" key={f.key}>
     <span>{f.label}{f.required?' *':'（选填）'}</span><select aria-label={`对应列：${f.label}`} value={mapping[f.key]??-1} onChange={e=>{setMapping(v=>({...v,[f.key]:Number(e.target.value)}));setError('')}}>
      <option value={-1}>不导入此列</option>{current.rows[0].cells.map((h,i)=><option key={i} value={i}>{h}</option>)}
     </select>
    </label>)}</div>
    <p>共 {current.rows.length-1} 行。只导入已匹配列，其余列忽略；不会修改已有人员。以下显示前 3 行。</p>
    <ul className="er-samples">{current.rows.slice(1,4).map(row=><li key={row.line}><span>第 {row.line} 行</span><dl>{rosterFields[kind].filter(f=>mapping[f.key]>=0).map(f=><div key={f.key}><dt>{f.label}</dt><dd>{row.cells[mapping[f.key]]||'—'}</dd></div>)}</dl></li>)}</ul>
   </>}
   <div className="er-actions"><button type="button" disabled={disabled||reading} onClick={cancel}>取消读取</button><button type="button" className="hs-primary" disabled={disabled||reading||!headerValid} onClick={apply}>使用这份名单</button></div>
   <p>此步仅更新待导入文本；仍需解析预览并确认新增。</p>
  </section>}
 </div>
}
