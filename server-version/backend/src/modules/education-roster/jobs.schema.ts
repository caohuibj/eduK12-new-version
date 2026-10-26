import {z} from 'zod'
import {personnelInput} from '../campus/personnel.service'
export const ROSTER_FILE_ROWS=5000,ROSTER_FILE_BYTES=1000000,ROSTER_PART_ROWS=100
export const rosterSource=z.object({rawDigest:z.string().regex(/^[a-f0-9]{64}$/),mappingDigest:z.string().regex(/^[a-f0-9]{64}$/),sheetDigest:z.string().regex(/^[a-f0-9]{64}$/)}).strict()
const structureRow=z.object({line:z.number().int().min(1).max(10000),name:z.string().trim().min(1).max(200),grade:z.string().trim().max(200).default('')}).strict()
const person=personnelInput.extend({rows:z.array(personnelInput.shape.rows.element).min(1).max(ROSTER_FILE_ROWS)})
const structure=z.object({kind:z.enum(['GRADE','CLASS']),defaultGradeId:z.string().guid().nullable().default(null),rows:z.array(structureRow).min(1).max(ROSTER_FILE_ROWS)}).strict()
export const rosterJobInput=z.union([person,structure])
export type RosterJobInput=z.infer<typeof rosterJobInput>
export type RosterSource=z.infer<typeof rosterSource>
export type RosterEntry='SCHOOL'|'TEACHER'
export type RosterIssue={line:number;message:string}
export class RosterJobError extends Error{
 constructor(public readonly code:string,message:string,public readonly statusCode=409,public readonly issues:RosterIssue[]=[]){super(message)}
}
export function validateWholeRoster(input:RosterJobInput){
 if(Buffer.byteLength(JSON.stringify(input),'utf8')>1600000)throw new RosterJobError('ROSTER_INPUT_LIMIT','名单转换后过大，请分成较小文件。',400)
 const seen=new Map<string,number>(),accounts=new Map<string,number>(),issues:RosterIssue[]=[]
 let previousLine=0
 if(input.kind==='GRADE'&&input.defaultGradeId)throw new RosterJobError('ROSTER_GRADE_PARENT','年级不能设置所属年级。',400)
 for(const row of input.rows){
  if(row.line<=previousLine)issues.push({line:row.line,message:'原始行号必须按顺序且不能重复。'})
  previousLine=row.line
  if('username'in row&&row.username){const key=row.username.toLowerCase();if(accounts.has(key))issues.push({line:row.line,message:`已有账号与第 ${accounts.get(key)} 行重复，不能对应两个编号。`});else accounts.set(key,row.line)}
  let key:string
  if('number' in row)key=input.kind==='ASSIGNMENT'?JSON.stringify([row.number.toUpperCase(),row.grade,row.className,row.staffRole]):row.number.toUpperCase()
  else key=JSON.stringify([row.grade||('defaultGradeId'in input?input.defaultGradeId:null),row.name])
  if(seen.has(key))issues.push({line:row.line,message:`与第 ${seen.get(key)} 行重复，请先去掉重复记录。`})
  else seen.set(key,row.line)
  if('name'in row&&[...row.name,...('grade'in row?row.grade:'')].some(c=>c.charCodeAt(0)<32||c==='\uFFFD'))issues.push({line:row.line,message:'名称包含无法识别的字符。'})
 }
 if(issues.length)throw new RosterJobError('ROSTER_WHOLE_FILE_INVALID','整份名单有错误，尚未开始导入。',400,issues)
}
export function rosterParts(input:RosterJobInput):RosterJobInput[]{
 const parts:RosterJobInput[]=[]
 for(let i=0;i<input.rows.length;i+=ROSTER_PART_ROWS)parts.push({...input,rows:input.rows.slice(i,i+ROSTER_PART_ROWS)} as RosterJobInput)
 return parts
}
