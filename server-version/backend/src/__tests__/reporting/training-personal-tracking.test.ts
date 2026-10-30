import {describe,it,expect} from 'vitest'
import {trainingTrackingMeasurementIdentity,trainingNumericFormIdentity} from '../../modules/composite/personal-tracking'

describe('Training entry measurement adapter',()=>{
 it('uses C plus actual cognitive mode, while full config report changes do not change raw-score identity',()=>{
  const unit={family:'COGNITIVE',measurement:{measurementHash:'a'.repeat(64)}} as any
  const identity=(profile:string,resolvedConfigHash:string)=>trainingTrackingMeasurementIdentity(unit,{cognitiveAssignment:{profile,resolvedConfigHash}})
  expect(identity('standard','old-report-config')).toBe(identity('standard','new-report-config'))
  expect(identity('research','old-report-config')).not.toBe(identity('standard','old-report-config'))
 })
 it('preserves numeric Form meaning across copied slot keys, and refuses category encodings',()=>{
  const original={type:'FORM',formType:'number',formLabel:'本周完成的次数',required:true,formDefinition:{itemKey:'q_original',type:'NUMBER',prompt:'本周完成的次数',required:true,options:[],rows:[],min:0,max:100}}
  const next={...original,formDefinition:{...original.formDefinition,itemKey:'q_new'}}
  expect(trainingNumericFormIdentity(original)).toEqual(trainingNumericFormIdentity(next,{q_new:'q_original'}))
  expect(trainingNumericFormIdentity({...next,formLabel:'本周时长（分钟）',formDefinition:{...next.formDefinition,prompt:'本周时长（分钟）'}})?.measurementHash)
   .not.toBe(trainingNumericFormIdentity(original)?.measurementHash)
  expect(trainingNumericFormIdentity({...original,formType:'single_choice',formLabel:'类别',formOptions:[{value:'a',label:'A'},{value:'b',label:'B'}],formDefinition:{itemKey:'q_category',type:'SINGLE',prompt:'类别',required:true,
   options:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],rows:[]}})).toBeNull()
 })
})
