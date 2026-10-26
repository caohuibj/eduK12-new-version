import {EducationRosterSource} from './EducationRosterSource'
import {downloadRosterErrors} from './preparation'
import {useEffect,useId,useRef,useState} from 'react'
import type {EducationRosterApi as SchoolApi} from './types'
import {previewSchoolStructure,type SchoolUnit,type StructureImportKind,type StructureImportPreview} from './structure-import'
import '../../school/school-structure-import.css'

type Props={api:SchoolApi;organizationId:string;units:SchoolUnit[];onUnits:(units:SchoolUnit[])=>void;onBusy:(busy:boolean)=>void;disabled:boolean;fixedKind?:StructureImportKind;embedded?:boolean}
export function EducationStructureImport(props:Props){return <ImportSession key={props.organizationId} {...props}/>}
function ImportSession({api,organizationId,units,onUnits,onBusy,disabled,fixedKind,embedded}:Props){
 const [open,setOpen]=useState(!!embedded),[kind,setKind]=useState<StructureImportKind>(fixedKind??'GRADE')
 const [content,setContent]=useState(''),[gradeId,setGradeId]=useState(''),[preview,setPreview]=useState<StructureImportPreview|null>(null)
 const [reading,setReading]=useState(false)
 const importId=useId()
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
 const alive=useRef(true),locked=useRef(false),fileRead=useRef(0),filePending=useRef(false)
 const callbacks=useRef({onUnits,onBusy});callbacks.current={onUnits,onBusy}
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;callbacks.current.onBusy(false)}},[])
 const replace=(text:string)=>{fileRead.current++;filePending.current=false;setReading(false);setContent(text);setPreview(null);setMessage('');setError('')}
 const parse=()=>{if(filePending.current)return;setPreview(previewSchoolStructure(content,kind,units,gradeId));setMessage('');setError('')}
 const count=preview?.rows.filter(row=>row.state==='add').length??0
 const invalid=!!preview&&(preview.errors.length>0||preview.rows.some(row=>row.state==='error'))
 const refresh=async()=>{
  if(locked.current||filePending.current||disabled)return
  locked.current=true;setBusy(true);onBusy(true);setPreview(null);setError('');setMessage('')
  try{const result=await api<{list:SchoolUnit[]}>(`/organizations/${organizationId}/units`);if(alive.current){callbacks.current.onUnits(result.list);setMessage('学校结构已刷新，请重新解析预览。')}}
  catch(cause){if(alive.current)setError(cause instanceof Error?cause.message:'学校结构读取失败。')}
  finally{if(alive.current){locked.current=false;setBusy(false);callbacks.current.onBusy(false)}}
 }
 const apply=async()=>{
  if(locked.current||filePending.current||disabled||!preview||invalid||!count)return
  locked.current=true;setBusy(true);onBusy(true);setError('');setMessage('')
  let created=0,skipped=0,currentLine=0
  const base=`/organizations/${organizationId}/units`
  try{
   // Re-read immediately before writing; never trust a stale client preview.
   const fresh=await api<{list:SchoolUnit[]}>(base)
   if(!alive.current)return
   callbacks.current.onUnits(fresh.list)
   const checked=previewSchoolStructure(content,kind,fresh.list,gradeId)
   setPreview(checked)
   if(checked.errors.length||checked.rows.some(row=>row.state==='error'))throw Error('学校结构已变化，请核对预览后再确认。')
   for(const row of checked.rows){
    if(!alive.current)return
    currentLine=row.line
    if(row.state==='skip'){skipped++;continue}
    await api<SchoolUnit>(base,'POST',{unitKind:kind,name:row.name,...(kind==='CLASS'?{parentUnitId:row.parentUnitId}:{})})
    if(!alive.current)return
    created++;setMessage(`已新增 ${created} 条，正在继续…`)
   }
   currentLine=0
   const result=await api<{list:SchoolUnit[]}>(base)
   if(!alive.current)return
   callbacks.current.onUnits(result.list);setPreview(null)
   setMessage(`已新增 ${created} 条，跳过 ${skipped} 条已有项。请核对学校与班级选择。`)
  }catch(cause){
   if(!alive.current)return
   setPreview(null)
   setError(`已确认新增 ${created} 条。${currentLine?`停在源文件第 ${currentLine} 行。`:''}${cause instanceof Error?cause.message:'导入未完成。'} 未确认的结果不会自动重试；请刷新学校结构并核对，再重新预览剩余内容。`)
  }finally{
   if(alive.current){locked.current=false;setBusy(false);callbacks.current.onBusy(false)}
  }
 }
 return <div className="hs-structure-import">
  {!embedded&&<button type="button" className="hs-structure-import-toggle" aria-expanded={open} aria-controls={open?importId:undefined} disabled={busy||disabled} onClick={()=>setOpen(value=>!value)}>批量导入年级／班级</button>}
  {open&&<section id={importId} aria-label="批量导入学校结构">
   <div className="hs-structure-import-fields">{!fixedKind&&<label className="hs-field"><span>导入类型</span><select disabled={busy} value={kind} onChange={event=>{setKind(event.target.value as StructureImportKind);replace('')}}><option value="GRADE">年级</option><option value="CLASS">班级</option></select></label>}
   {kind==='CLASS'&&<label className="hs-field"><span>单列班级的所属年级</span><select disabled={busy} value={gradeId} onChange={event=>{setGradeId(event.target.value);setPreview(null);setError('');setMessage('')}}><option value="">两列文件按行指定年级</option>{units.filter(unit=>unit.unitKind==='GRADE').map(unit=><option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label>}
   </div>
   <EducationRosterSource key={kind} api={api} organizationId={organizationId} kind={kind} text={content} disabled={busy||disabled} fileLabel="CSV／Excel 文件（可含表头）" onText={replace} onInvalidate={()=>{fileRead.current++;setPreview(null);setError('');setMessage('')}} onBlocked={value=>{filePending.current=value;setReading(value)}}/>
   <p className="hs-structure-import-hint">{kind==='GRADE'?'每行一个年级名称。':'每行一个班级名称并选择所属年级，或使用“年级,班级”两列；年级须已存在。'} 支持 CSV、制表符和多行粘贴，每批最多 100 条。</p>
   <label className="hs-field"><span>待导入内容</span><textarea rows={5} disabled={busy} value={content} placeholder={kind==='GRADE'?'年级\n一年级\n二年级':'年级,班级\n一年级,一班\n二年级,一班'} onChange={event=>{fileRead.current++;replace(event.target.value)}}/></label>
   <div className="hs-actions"><button disabled={busy||reading||disabled||!content.trim()} onClick={parse}>解析预览</button><button disabled={busy||disabled} onClick={()=>{fileRead.current++;replace('')}}>清空输入</button><button disabled={busy||reading||disabled} onClick={()=>void refresh()}>刷新学校结构</button></div>
   {preview&&<section className="hs-structure-import-preview" aria-label="学校结构导入预览"><h3>导入预览</h3><p>新增 {count} 条 · 跳过 {preview.rows.filter(row=>row.state==='skip').length} 条 · 错误 {preview.rows.filter(row=>row.state==='error').length+preview.errors.length} 处</p>
    {preview.errors.map((issue,index)=><p role="alert" key={index}>{issue}</p>)}
    <ol>{preview.rows.map(row=><li key={row.line} data-state={row.state}><span>第 {row.line} 行</span><strong>{row.gradeName?`${row.gradeName} / `:''}{row.name||'空名称'}</strong><span>{row.message}</span></li>)}</ol>
    <p className="hs-structure-import-hint">只新增，不修改或删除已有项。确认后逐条保存，失败即停止，已完成部分不会整体回滚；仍需当前学校管理权限和近期安全验证。</p>
    {(invalid)&&<button type="button" onClick={()=>downloadRosterErrors([...preview.errors.map(message=>({line:'文件',message})),...preview.rows.filter(row=>row.state==='error').map(row=>({line:row.line,message:row.message}))])}>下载问题清单</button>}
    <button className="hs-primary" disabled={busy||reading||disabled||invalid||!count} onClick={()=>void apply()}>确认新增 {count} 条</button>
   </section>}
   {message&&<p role="status" className="hs-message">{message}</p>}{error&&<p role="alert" className="hs-alert">{error}</p>}
  </section>}
 </div>
}
