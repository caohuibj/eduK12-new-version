import {describe,it,expect} from 'vitest'
import {buildCompositeExportProjectionBinding,projectCompositeExportData,bindCompositeExportFileName,compositeExportFileNameMatchesProjection} from '../../modules/composite/composite-export-projection'
const items=[{id:'item',type:'SCALE',scale:{id:'scale',code:'custom',instrumentVersion:'2.0.0',instrumentClass:'CUSTOM_DESCRIPTIVE' as const}}]
const binding=(enabled=false,revision=1)=>buildCompositeExportProjectionBinding({resourceId:'parent',items,timingExportEnabled:enabled,timingExportRevision:revision})
describe('independent Training timing export capability',()=>{
 it('defaults closed and never elevates raw answers even in summary',()=>{
  const data={fields:[{name:'S001_TIMING_activeTimeMs_Q1'},{name:'S001_Q_V_Q1'},{name:'S001_RT_Q1'}],rows:[{S001_TIMING_activeTimeMs_Q1:50,S001_Q_V_Q1:'secret',S001_RT_Q1:10}]} as any
  expect(projectCompositeExportData(data,binding()).fields).toEqual([])
  const projected=projectCompositeExportData(data,binding(true))
  expect(projected.rows).toEqual([{S001_TIMING_activeTimeMs_Q1:50}])
  expect(projected.fields).toHaveLength(1)
 })
 it('binds artifacts to the current permission revision including re-grant',()=>{
  const filename=bindCompositeExportFileName('composite_parent_summary_2026-01-01T00-00-00_aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.csv',binding(true,2))
  expect(compositeExportFileNameMatchesProjection(filename,binding(true,2))).toBe(true)
  expect(compositeExportFileNameMatchesProjection(filename,binding(false,3))).toBe(false)
  expect(compositeExportFileNameMatchesProjection(filename,binding(true,4))).toBe(false)
 })
})
