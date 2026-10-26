import {readSchoolDelimitedRecords} from './structure-import'
import type {RosterKind,RosterRecord} from './types'
export type RosterLimits={rows:number;bytes:number;sizeLabel:string}
export const singleRosterLimits:RosterLimits={rows:100,bytes:64000,sizeLabel:'64 KB'}
export const jobRosterLimits:RosterLimits={rows:5000,bytes:1000000,sizeLabel:'1 MB'}
export type RosterField={key:string;label:string;required?:boolean;aliases:string[]}
const field=(key:string,label:string,aliases:string[],required=false):RosterField=>({key,label,aliases:[key,label,...aliases],required})
const number=(student:boolean)=>field('number',student?'学号':'工号',['人员编号','student_number','staff_number'],true)
const grade=()=>field('grade','年级',['年级名称','grade_name'],true),cl=()=>field('className','班级',['class','class_name','班级名称'],true)
const name=(required=false)=>field('name','姓名',[],required)
const username=()=>field('username','已有校园用户名',['校园用户名'])
export const rosterLabels:Record<RosterKind,string>={GRADE:'年级',CLASS:'班级',STUDENT:'学生名单',STAFF:'教师名单',ASSIGNMENT:'教师任教关系'}
export const rosterFields:Record<RosterKind,RosterField[]>={GRADE:[grade()],CLASS:[{...grade(),required:false},cl()],STUDENT:[number(true),grade(),cl(),name(),username()],STAFF:[number(false),name(true),field('persona','身份',[]),username()],ASSIGNMENT:[number(false),grade(),cl(),field('staffRole','任教角色',['staff_role'])]}
export const rosterTemplates:Record<RosterKind,string>={GRADE:'年级\n一年级\n二年级',CLASS:'年级,班级\n一年级,一班\n一年级,二班',STUDENT:'学号,年级,班级,姓名,已有校园用户名\n0001,一年级,一班,,\n0002,一年级,一班,示例学生,',STAFF:'工号,姓名,身份,已有校园用户名\nT001,示例教师,普通教师,\nT002,示例心理教师,心理教师,',ASSIGNMENT:'工号,年级,班级,任教角色\nT001,一年级,一班,班主任\nT001,一年级,二班,任课教师'}
export function readRosterText(text:string,limits: RosterLimits=singleRosterLimits):RosterRecord[]{
 if(new TextEncoder().encode(text).length>limits.bytes)throw Error(`内容超过 ${limits.sizeLabel}，请分批导入。`)
 if(text.includes('\uFFFD'))throw Error('文件编码无法识别，请使用 UTF-8 CSV 或 Excel 文件。')
 return readSchoolDelimitedRecords(text)
}
export function inspectRosterHeader(rows:RosterRecord[],kind:RosterKind,limits:RosterLimits=singleRosterLimits){
 if(rows.length<2||rows.length>limits.rows+1)throw Error(`需要表头和 1–${limits.rows} 行名单；大文件请先拆分。`)
 const headers=rows[0].cells
 if(!headers.length||headers.length>20)throw Error('每份名单最多 20 列。')
 const lowered=headers.map(v=>v.trim().toLowerCase())
 if(lowered.some(v=>!v)||new Set(lowered).size!==lowered.length)throw Error('表头不能为空或重复，请先修正源文件。')
 const known=new Set(Object.values(rosterFields).flat().flatMap(f=>f.aliases.map(a=>a.toLowerCase())))
 if(lowered.some(v=>!known.has(v)&&/密码|口令|权限|角色|管理员|身份证|证件|手机|电话|联系|邮箱|password|passwd|pwd|permission|admin|role|phone|mobile|email|e-mail/i.test(v)))throw Error('名单不能包含密码、联系方式、证件或管理权限列；请先从文件中移除。')
 if(rows.some(row=>row.cells.length!==headers.length))throw Error('部分行列数与表头不一致，请先修正源文件。')
 const mapping:Record<string,number>={}
 for(const f of rosterFields[kind]){
  const matches=lowered.flatMap((v,i)=>f.aliases.map(a=>a.toLowerCase()).includes(v)?[i]:[])
  if(matches.length>1)throw Error(`多列表头对应“${f.label}”，请保留一列后重选。`)
  mapping[f.key]=matches[0]??-1
 }
 return mapping
}
const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"'
export function mappedRosterText(rows:RosterRecord[],kind:RosterKind,mapping:Record<string,number>,limits:RosterLimits=singleRosterLimits){
 const fields=rosterFields[kind],selected=fields.filter(f=>(mapping[f.key]??-1)>=0)
 if(fields.some(f=>f.required&&(mapping[f.key]??-1)<0))throw Error('请匹配所有必填列。')
 if(new Set(selected.map(f=>mapping[f.key])).size!==selected.length)throw Error('一列不能重复对应多个字段。')
 if(selected.some(f=>!Number.isInteger(mapping[f.key])||mapping[f.key]>=rows[0].cells.length))throw Error('表头映射无效，请重新选择。')
 let text='\n'.repeat(Math.max(0,rows[0].line-1))+selected.map(f=>quote(f.label)).join(','),line=rows[0].line+1
 for(const row of rows.slice(1)){
  const id=mapping.number
  if(id>=0&&row.numeric?.includes(id))throw Error(`第 ${row.line} 行编号是 Excel 数值单元格；无法确认前导零。请核对原始编号并改为文本后重选。`)
  for(const f of fields)if(f.required&&!row.cells[mapping[f.key]]?.trim())throw Error(`第 ${row.line} 行缺少${f.label}。`)
  const values=selected.map(f=>row.cells[mapping[f.key]]??'')
  text+='\n'.repeat(Math.max(1,row.line-line+1))+values.map(quote).join(',')
  line=row.line+1+values.reduce((n,v)=>n+(v.match(/\n/g)?.length??0),0)
 }
 if(new TextEncoder().encode(text).length>limits.bytes)throw Error(`转换后的名单超过 ${limits.sizeLabel}，请分批导入。`)
 return text
}
/** Error downloads are inert text even when opened in spreadsheet software. */
export function rosterErrorCsv(rows:{line:number|string;message:string}[]){
 const safe=(v:string)=>quote(/^[\s]*[=+@-]/.test(v)?"'"+v:v)
 return '\uFEFF'+[['源文件行号','问题说明'],...rows.map(r=>[String(r.line),r.message])].map(row=>row.map(safe).join(',')).join('\r\n')
}
export function downloadRosterFile(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function downloadRosterErrors(rows:{line:number|string;message:string}[]){downloadRosterFile(new Blob([rosterErrorCsv(rows)],{type:'text/csv;charset=utf-8'}),'导入问题.csv')}

export function structureFileText(rows:RosterRecord[],kind:'GRADE'|'CLASS',limits:RosterLimits=singleRosterLimits){
 if(!rows.length||rows.length>limits.rows)throw Error(`无表头名单需要 1–${limits.rows} 行。`)
 if(rows.some(r=>r.cells.length!==(rows[0].cells.length))||rows[0].cells.length>(kind==='GRADE'?1:2))throw Error('年级一列，班级一列或“年级,班级”两列。')
 if(rows[0].cells.some(v=>/密码|权限|手机号|password|permission|admin/i.test(v)))throw Error('不接收密码或权限列。')
 let text='',line=1
 for(const row of rows){const value=row.cells.map(quote).join(',');text+='\n'.repeat(Math.max(0,row.line-line))+value;line=row.line+(value.match(/\n/g)?.length??0)}
 if(new TextEncoder().encode(text).length>limits.bytes)throw Error(`内容超过 ${limits.sizeLabel}，请分批导入。`)
 return text
}
