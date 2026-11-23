import {describe,expect,it} from 'vitest'
import {formQuestionSchema} from '../../modules/assessment-core/form/definition'
import {fieldEvidenceDisplay} from '../../modules/huiteacher/fieldEvidenceDisplay'
const q=(type:string)=>formQuestionSchema.parse({itemKey:'q',prompt:'观察',type,required:true,options:[{optionKey:'yes',label:'清晰'},{optionKey:'no',label:'需完善'}],rows:[{rowKey:'r1',label:'课堂目标'},{rowKey:'r2',label:'课堂互动'}]})
describe('frozen professional observation display',()=>{
 it.each(['SINGLE','LIKERT'])('maps %s keys to labels',type=>expect(fieldEvidenceDisplay(q(type),{state:'ANSWERED',value:'yes'})).toBe('清晰'))
 it('preserves multi-select and rank ordering',()=>{
  expect(fieldEvidenceDisplay(q('MULTIPLE'),{state:'ANSWERED',value:['no','yes']})).toBe('需完善、清晰')
  expect(fieldEvidenceDisplay(q('RANK_ORDER'),{state:'ANSWERED',value:['no','yes']})).toBe('1. 需完善；2. 清晰')
 })
 it('shows matrix row labels, choices and refusal without exposing a refused value',()=>{
  expect(fieldEvidenceDisplay(q('MATRIX'),{state:'ANSWERED',value:{r1:'yes',r2:'no'},rowStates:{r1:'ANSWERED',r2:'REFUSED'}})).toBe('课堂目标：清晰；课堂互动：已明确拒答')
  expect(fieldEvidenceDisplay(q('MATRIX_MULTIPLE'),{state:'ANSWERED',value:{r1:['yes','no']},rowStates:{r1:'ANSWERED',r2:'NOT_SHOWN'}})).toBe('课堂目标：清晰、需完善；课堂互动：未显示')
 })
 it('keeps zero, free text, dates, and explicit other text as readable facts',()=>{
  expect(fieldEvidenceDisplay(q('CONSTANT_SUM'),{state:'ANSWERED',value:{yes:0,no:100}})).toBe('清晰：0；需完善：100')
  for(const [type,value]of [['NUMBER',0],['SLIDER',0],['SHORT_TEXT','教师观察'],['LONG_TEXT','完整观察事实'],['DATE','2026-11-23'],['TIME','09:30']] as const)
   expect(fieldEvidenceDisplay(q(type),{state:'ANSWERED',value})).toBe(String(value))
  expect(fieldEvidenceDisplay(q('SINGLE'),{state:'ANSWERED',value:'yes',otherText:'补充说明'})).toBe('清晰；其他说明：补充说明')
 })
 it('does not translate missing/refused/hidden answers into apparent valid choices',()=>{
  expect(fieldEvidenceDisplay(q('SINGLE'),{state:'REFUSED',value:'yes'})).toBe('已明确拒答')
  expect(fieldEvidenceDisplay(q('SINGLE'),{state:'NOT_SHOWN',value:'yes'})).toBe('未显示')
  expect(fieldEvidenceDisplay(q('SINGLE'),{state:'ANSWERED',value:'unknown-key'})).toBe('无法匹配原固定选项')
 })
})
