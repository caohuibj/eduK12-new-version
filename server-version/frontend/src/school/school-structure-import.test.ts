import {describe,it,expect} from 'vitest'
import {previewSchoolStructure,type SchoolUnit} from './school-structure-import'
const units:SchoolUnit[]=[{id:'g1',name:'一年级',unitKind:'GRADE',parentUnitId:null},{id:'g2',name:'二年级',unitKind:'GRADE',parentUnitId:null},{id:'c1',name:'一班',unitKind:'CLASS',parentUnitId:'g1'}]
describe('School structure import preview',()=>{
 it('accepts BOM, headers and quoted names while preserving physical source lines',()=>{
  const preview=previewSchoolStructure('\uFEFF年级\r\n一年级\r\n"三,年级"\r\n\r\n四年级','GRADE',units)
  expect(preview.errors).toEqual([])
  expect(preview.rows.map(row=>[row.line,row.name,row.state])).toEqual([[2,'一年级','skip'],[3,'三,年级','add'],[5,'四年级','add']])
 })
 it('maps multiple classes to exact existing grades with CSV or TSV',()=>{
  for(const delimiter of [',','\t']){
   const preview=previewSchoolStructure(`年级${delimiter}班级\n一年级${delimiter}一班\n二年级${delimiter}一班`,'CLASS',units)
   expect(preview.rows.map(row=>[row.parentUnitId,row.state])).toEqual([['g1','skip'],['g2','add']])
  }
 })
 it('supports a class-name column under an explicitly selected grade',()=>{
  expect(previewSchoolStructure('班级\n二班\n三班','CLASS',units,'g1').rows.map(row=>row.parentUnitId)).toEqual(['g1','g1'])
 })
 it('rejects ambiguous grade-name lookup without guessing, while allowing an exact selected id',()=>{
  const ambiguous=[...units,{...units[0],id:'g3'}]
  expect(previewSchoolStructure('一年级,二班','CLASS',ambiguous).rows[0].state).toBe('error')
  expect(previewSchoolStructure('二班','CLASS',ambiguous,'g1').rows[0].state).toBe('add')
 })
 it.each([
  ['一年级\n一年级','GRADE'],['未知年级,一班','CLASS'],['一班','CLASS'],['一年级,一班,附加列','CLASS'],['年级,班级','GRADE'],['"跨\n行"','GRADE'],['坏\u0000名称','GRADE'],['x'.repeat(201),'GRADE'],
 ] as const)('blocks invalid or duplicate rows: %s', (text,kind)=>{
  const value=previewSchoolStructure(text,kind,units)
  expect(value.errors.length+value.rows.filter(row=>row.state==='error').length).toBeGreaterThan(0)
 })
 it('refuses malformed CSV, oversized inputs and more than 100 records',()=>{
  for(const text of ['"未闭合','"名称"多余','x'.repeat(64001),Array.from({length:101},(_,i)=>'年级'+i).join('\n')])expect(previewSchoolStructure(text,'GRADE',units).errors.length).toBeGreaterThan(0)
 })
 it('rejects an already ambiguous same-name structure rather than modifying it',()=>{
  const value=previewSchoolStructure('一班','CLASS',[...units,{...units[2],id:'c2'}],'g1')
  expect(value.rows[0].state).toBe('error')
  expect(units).toHaveLength(3)
 })
})
