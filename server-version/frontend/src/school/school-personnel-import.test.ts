import {describe,expect,it} from 'vitest'
import {parsePersonnelImport} from './school-personnel-import'
describe('School personnel CSV/TSV preparation',()=>{
 it('keeps leading zeroes and accepts optional student names, BOM and CRLF',()=>{
  const result=parsePersonnelImport('\uFEFF学号,年级,班级,姓名\r\n0012,一年级,一班,\r\n0013,一年级,一班,"姓,名"','STUDENT')
  expect(result.rows).toEqual([{line:2,number:'0012',grade:'一年级',className:'一班',name:''},{line:3,number:'0013',grade:'一年级',className:'一班',name:'姓,名'}])
 })
 it('prepares staff default identity and explicitly separates counselor identity from grants',()=>{
  const result=parsePersonnelImport('工号\t姓名\t身份\nT01\t甲\t\nT02\t乙\t心理教师','STAFF')
  expect(result.rows[0].persona).toBeUndefined();expect(result.rows[1].persona).toBe('COUNSELOR')
 })
 it('supports a teacher having several class assignments',()=>{
  const r=parsePersonnelImport('工号,年级,班级,任教角色\nT01,一年级,一班,班主任\nT01,一年级,二班,任课教师','ASSIGNMENT')
  expect(r.rows.map(x=>x.staffRole)).toEqual(['HOMEROOM','TEACHING'])
 })
 it.each(['学号,年级,班级,密码\nS01,一年级,一班,password','学号,number,年级,班级\nS01,S02,一年级,一班','姓名,年级,班级\n甲,一年级,一班','学号,年级,班级\nS01,一年级','学号,年级,班级\n"S01,一年级,一班'])('rejects unsafe/ambiguous input before calling the server: %s',text=>expect(()=>parsePersonnelImport(text,'STUDENT')).toThrow())
 it('refuses importing administrator or professional capability columns/values',()=>{
  expect(()=>parsePersonnelImport('工号,姓名,身份\nT01,甲,管理员','STAFF')).toThrow(/管理和专业权限/)
  expect(()=>parsePersonnelImport('工号,姓名,权限\nT01,甲,PSYCHOLOGY_STAFF','STAFF')).toThrow(/权限字段/)
 })
 it('bounds batch length and file size',()=>{
  expect(()=>parsePersonnelImport('学号,年级,班级\n'+Array.from({length:101},(_,i)=>`S${i},年级,班级`).join('\n'),'STUDENT')).toThrow(/100/)
  expect(()=>parsePersonnelImport('x'.repeat(64001),'STAFF')).toThrow(/64 KB/)
 })
})
