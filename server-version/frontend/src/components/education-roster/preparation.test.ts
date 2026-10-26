import {describe,it,expect} from 'vitest'
import {inspectRosterHeader,mappedRosterText,readRosterText,rosterErrorCsv,rosterTemplates,structureFileText} from './preparation'
import {parsePersonnelImport} from './personnel-import'
import {previewSchoolStructure} from './structure-import'
import type {RosterKind} from './types'
describe('shared School / Teacher roster preparation',()=>{
 it.each(Object.keys(rosterTemplates) as RosterKind[])('prepares the %s template without changing data',kind=>{
  const rows=readRosterText(rosterTemplates[kind]),mapping=inspectRosterHeader(rows,kind),text=mappedRosterText(rows,kind,mapping)
  if(kind==='GRADE'||kind==='CLASS')expect(previewSchoolStructure(text,kind,[{id:'g',unitKind:'GRADE',name:'一年级',parentUnitId:null}]).errors).toEqual([])
  else expect(parsePersonnelImport(text,kind).rows).toHaveLength(2)
 })
 it('maps arbitrary headers, ignores unselected columns, and preserves source lines and leading zeros',()=>{
  const rows=readRosterText('学籍编号,年段,行政班,备注\n0012,一年级,一班,ignore\n\n0013,一年级,一班,ignore')
  const mapping=inspectRosterHeader(rows,'STUDENT')
  expect(mapping.number).toBe(-1)
  const text=mappedRosterText(rows,'STUDENT',{...mapping,number:0,grade:1,className:2})
  expect(parsePersonnelImport(text,'STUDENT').rows).toEqual([{line:2,number:'0012',grade:'一年级',className:'一班'},{line:4,number:'0013',grade:'一年级',className:'一班'}])
  expect(text).not.toContain('ignore')
 })
 it('rejects missing or duplicate target mappings and empty required cells',()=>{
  const rows=readRosterText('工号,姓名\nT1,示例教师'),mapping=inspectRosterHeader(rows,'STAFF')
  expect(()=>mappedRosterText(rows,'STAFF',{...mapping,name:-1})).toThrow(/必填/)
  expect(()=>mappedRosterText(rows,'STAFF',{...mapping,name:0})).toThrow(/重复/)
  expect(()=>mappedRosterText(readRosterText('工号,姓名\nT1,'),'STAFF',mapping)).toThrow(/第 2 行缺少姓名/)
 })
 it.each(['密码','administrator','手机号','permission','身份证号'])('rejects sensitive %s columns before mapping or preview',header=>{
  expect(()=>inspectRosterHeader(readRosterText(`工号,姓名,${header}\nT1,示例,unsafe`),'STAFF')).toThrow(/不能包含/)
 })
 it('rejects duplicate aliases, replacement decoding, wide files and over 100 rows',()=>{
  expect(()=>inspectRosterHeader(readRosterText('工号,number,姓名\nT1,T1,示例'),'STAFF')).toThrow(/多列表头/)
  expect(()=>readRosterText('姓名\n\uFFFD')).toThrow(/编码/)
  expect(()=>inspectRosterHeader(readRosterText('工号,姓名\n'+Array.from({length:101},(_,i)=>`T${i},示例`).join('\n')),'STAFF')).toThrow(/1–100/)
 })
 it('never guesses Excel numeric identifiers even with a displayed zero padding format',()=>{
  const rows=[{line:1,cells:['学号','年级','班级']},{line:2,cells:['12','一年级','一班'],numeric:[0]}]
  expect(()=>mappedRosterText(rows,'STUDENT',inspectRosterHeader(rows,'STUDENT'))).toThrow(/前导零/)
 })
 it('enforces the 64 KB limit in UTF-8 bytes, including direct pasted input',()=>{
  const text='工号,姓名\nT001,'+'中'.repeat(22000)
  expect(()=>readRosterText(text)).toThrow(/64 KB/)
  expect(()=>parsePersonnelImport(text,'STAFF')).toThrow(/64 KB/)
  expect(previewSchoolStructure('中'.repeat(22000),'GRADE',[]).errors.length).toBe(1)
 })
 it('escapes error downloads so spreadsheet formulas are inert',()=>{
  const csv=rosterErrorCsv([{line:2,message:'=HYPERLINK("https://invalid.example")'},{line:3,message:'  +cmd'},{line:4,message:'normal,quoted'}])
  expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv).toContain('"\'=HYPERLINK');expect(csv).toContain('"\'  +cmd"');expect(csv).toContain('"normal,quoted"')
 })
 it('preserves headerless structure files, their first row and selected parent-grade flow',()=>{
  expect(previewSchoolStructure(structureFileText(readRosterText('一年级\n二年级'),'GRADE'),'GRADE',[]).rows.map(r=>r.name)).toEqual(['一年级','二年级'])
  const rows=readRosterText('班级\n二班'),mapping=inspectRosterHeader(rows,'CLASS')
  const canonical=mappedRosterText(rows,'CLASS',mapping)
  expect(previewSchoolStructure(canonical,'CLASS',[{id:'g',unitKind:'GRADE',name:'一年级',parentUnitId:null}],'g').rows[0]).toMatchObject({line:2,name:'二班',parentUnitId:'g',state:'add'})
  expect(structureFileText([{line:1,cells:['一年级']}],'GRADE')).toBe('"一年级"')
 })

})
