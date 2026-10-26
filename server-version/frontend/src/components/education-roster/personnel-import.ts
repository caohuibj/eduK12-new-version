import {readSchoolDelimitedRecords} from './structure-import'
export type PersonnelKind='STUDENT'|'STAFF'|'ASSIGNMENT'
export type PersonnelImportRow={line:number;number:string;name?:string;grade?:string;className?:string;persona?:'TEACHER'|'COUNSELOR';username?:string;staffRole?:'HOMEROOM'|'TEACHING'}
export type PersonnelImportInput={kind:PersonnelKind;rows:PersonnelImportRow[]}
const aliases:Record<string,string>={学号:'number',工号:'number',人员编号:'number',student_number:'number',staff_number:'number',number:'number',姓名:'name',name:'name',年级:'grade',grade:'grade',班级:'className',class:'className',class_name:'className',身份:'persona',persona:'persona',已有校园用户名:'username',校园用户名:'username',username:'username',任教角色:'staffRole',staff_role:'staffRole'}
const allowed:Record<PersonnelKind,string[]>={STUDENT:['number','grade','className','name','username'],STAFF:['number','name','persona','username'],ASSIGNMENT:['number','grade','className','staffRole']}
export const personnelTemplates:Record<PersonnelKind,string>={STUDENT:'学号,年级,班级,姓名,已有校园用户名\nS001,一年级,一班,,\nS002,一年级,一班,示例学生,',STAFF:'工号,姓名,身份,已有校园用户名\nT001,示例教师,普通教师,\nT002,示例心理教师,心理教师,',ASSIGNMENT:'工号,年级,班级,任教角色\nT001,一年级,一班,班主任\nT001,一年级,二班,任课教师'}
export function parsePersonnelImport(text:string,kind:PersonnelKind,limits={rows:100,bytes:64000,sizeLabel:'64 KB'}):PersonnelImportInput{
 if(new TextEncoder().encode(text).length>limits.bytes)throw Error(`内容超过 ${limits.sizeLabel}，请分批导入。`)
 const records=readSchoolDelimitedRecords(text),header=records.shift()
 if(!header)throw Error('请粘贴含表头的名单，或选择 UTF-8 CSV／TSV 文件。')
 const columns=header.cells.map(x=>aliases[x.toLowerCase()])
 if(columns.some(x=>!x||!allowed[kind].includes(x)))throw Error('表头包含不支持的字段；请使用对应模板，不接收密码、手机号或权限字段。')
 if(new Set(columns).size!==columns.length)throw Error('表头存在重复字段。')
 for(const key of kind==='STAFF'?['number','name']:['number','grade','className'])if(!columns.includes(key))throw Error('缺少必填列，请使用对应名单模板。')
 if(!records.length||records.length>limits.rows)throw Error(`每批需要 1–${limits.rows} 行名单，请拆分大文件。`)
 return {kind,rows:records.map(record=>{
  if(record.cells.length!==columns.length)throw Error(`第 ${record.line} 行列数与表头不一致。`)
  const row:Record<string,string|number>={line:record.line}
  record.cells.forEach((value,index)=>{row[columns[index]]=value})
  if(row.persona){const value=String(row.persona);if(!['普通教师','心理教师','TEACHER','COUNSELOR'].includes(value))throw Error(`第 ${record.line} 行身份只支持普通教师或心理教师；管理和专业权限须单独授权。`);row.persona=['心理教师','COUNSELOR'].includes(value)?'COUNSELOR':'TEACHER'}else delete row.persona
  if(row.staffRole){const value=String(row.staffRole);if(!['班主任','任课教师','HOMEROOM','TEACHING'].includes(value))throw Error(`第 ${record.line} 行任教角色无效。`);row.staffRole=['班主任','HOMEROOM'].includes(value)?'HOMEROOM':'TEACHING'}else delete row.staffRole
  return row as PersonnelImportRow
 })}
}
