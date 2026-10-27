import type {RosterKind} from './types'
import {parsePersonnelImport,type PersonnelImportInput} from './personnel-import'
import {readRosterText,jobRosterLimits} from './preparation'
export type RosterSource={rawDigest:string;mappingDigest:string;sheetDigest:string}
export type JobInput=PersonnelImportInput|{kind:'GRADE'|'CLASS';defaultGradeId:string|null;rows:{line:number;name:string;grade:string}[]}
export type JobPart={index:number;rows:number;state:'PLANNED'|'PREVIEWED'|'COMMITTED';add:number;skip:number;errors:number;issues:{line:number;message:string}[];receipt:{batchId:string;added:number;skipped:number}|null}
export type RosterJob={id:string;kind:RosterKind;status:string;rows:number;partCount:number;createdAt:string;expiresAt:string;expired:boolean;confirmed:boolean;planToken:string;needsVerification:boolean;added:number;skipped:number;savedRows:number;parts:JobPart[];proof?:string;runToken?:string|null}
export type RosterJobSummary=Pick<RosterJob,'id'|'kind'|'status'|'rows'|'partCount'|'createdAt'|'expiresAt'|'expired'|'added'|'skipped'|'savedRows'>
export async function rosterDigest(value:string|Uint8Array){
 const bytes=typeof value==='string'?new TextEncoder().encode(value):value
 const digest=await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer)
 return Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
}
export async function textRosterSource(text:string,kind:RosterKind,defaultGradeId:string){return {rawDigest:await rosterDigest(text),mappingDigest:await rosterDigest(JSON.stringify({kind,defaultGradeId,mode:'canonical-text'})),sheetDigest:await rosterDigest('TEXT')}}
export function parseJobInput(text:string,kind:RosterKind,defaultGradeId:string):JobInput{
 if(kind!=='GRADE'&&kind!=='CLASS')return parsePersonnelImport(text,kind,jobRosterLimits)
 const rows=readRosterText(text,jobRosterLimits),first=rows[0]?.cells.map(c=>c.toLowerCase())
 const grade=['年级','年级名称','grade','grade_name','name'],cl=['班级','班级名称','class','class_name','name']
 if(first&&(kind==='GRADE'?first.length===1&&grade.includes(first[0]):first.length===1&&cl.includes(first[0])||first.length===2&&grade.includes(first[0])&&cl.includes(first[1])))rows.shift()
 if(!rows.length||rows.length>5000)throw Error('名单需要 1–5000 行。')
 return {kind,defaultGradeId:kind==='CLASS'&&defaultGradeId?defaultGradeId:null,rows:rows.map(r=>{
  if(kind==='GRADE'&&r.cells.length!==1||kind==='CLASS'&&(r.cells.length<1||r.cells.length>2))throw Error(`第 ${r.line} 行列数不正确。`)
  return {line:r.line,name:r.cells[r.cells.length-1],grade:kind==='CLASS'&&r.cells.length===2?r.cells[0]:''}
 })}
}
export function jobParts(input:JobInput):JobInput[]{const result:JobInput[]=[];for(let i=0;i<input.rows.length;i+=100)result.push({...input,rows:input.rows.slice(i,i+100)} as JobInput);return result}
