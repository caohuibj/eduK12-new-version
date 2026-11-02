import {describe,it,expect} from 'vitest'
import {validateFormDefinition,type FormDraft} from '../../modules/assessment-core/form/definition'
import {describeFormResponse} from '../../modules/assessment-core/form/descriptive'
import {normalizeFormAnswers} from '../../modules/assessment-core/form/runtime'
import {compilePrivateFormRuntime} from '../../modules/education-tools/private-tool.form-runtime-adapter'
import {u4Candidate,u4CandidateList} from '../../modules/education-tools/content/u4/catalog'
import {createProtectedFormItems,recordProtectedFormAnswers,discloseProtectedFormItems} from '../../modules/huiteacher/groupReport.service'
import {studentFormComparableKey} from '../../modules/huiteacher/studentCompositionResource'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {STANDARD} from '../../modules/report-privacy/registry'

const selected=()=>u4Candidate('u4-tr36--tr-t01')!.definition
function normalized(form:FormDraft,answers:Record<string,unknown>){return normalizeFormAnswers(form,answers as never)}
describe('U4 frozen Form ordinal descriptions',()=>{
 it('all 53 independent candidates compile in the native runtime without a score or a dependency on another module',()=>{
  expect(u4CandidateList()).toHaveLength(53)
  for(const item of u4CandidateList()){
   const form=u4Candidate(item.key)!.definition
   expect(validateFormDefinition(form,{forPreview:true}).issues).toEqual([])
   expect(compilePrivateFormRuntime(form).sections.length).toBeGreaterThan(0)
   expect(form.pages.flatMap(p=>p.questions).every(q=>q.options.every(o=>o.score===undefined))).toBe(true)
  }
 })
 it('keeps zero, NA, U, refusal and omission distinct; optional mean is complete-case only',()=>{
  const form=selected(),keys=form.descriptive!.items.map(i=>i.itemKey)
  for(const [last,expected] of [['f4',2],['na',null],['u',null],[{_surveyRefusal:true},null],[undefined,null]] as const){
   form.descriptive!.exploratoryMeans=true
   const response=normalized(form,{[keys[0]]:'f0',[keys[1]]:'f2',...(last===undefined?{}:{[keys[2]]:last})})
   const result=describeFormResponse(form,response.rawAnswers,response.missing)!
   expect(result.items[0].code).toBe(0)
   expect(result.exploratoryMeans[0].value).toBe(expected)
   if(last==='na'||last==='u')expect(result.items[2].state).toBe('NONRESPONSE_OPTION')
   if(last===undefined)expect(result.items[2].state).toBe('SHOWN_MISSING')
   if(typeof last==='object')expect(result.items[2].state).toBe('REFUSED')
  }
  form.descriptive!.exploratoryMeans=false
  const empty=normalized(form,{})
  expect(describeFormResponse(form,empty.rawAnswers,empty.missing)!.exploratoryMeans).toEqual([])
 })
 it('report-only configuration preserves content comparison identity, including legacy identity',()=>{
  const f=selected(),{descriptive,...legacy}=f
  expect(studentFormComparableKey(f)).toBe('FORM:'+canonicalHash({kind:'FORM',definition:legacy}))
  f.descriptive!.exploratoryMeans=true
  expect(studentFormComparableKey(f)).toBe(studentFormComparableKey(legacy))
 })
 it('rejects partial/malformed option maps and scored ordinal options; no silent coercion',()=>{
  for(const mutate of [(f:FormDraft)=>f.descriptive!.items[0].values.pop(),(f:FormDraft)=>f.descriptive!.items[0].values[0].code=4,
   (f:FormDraft)=>f.pages[0].questions[0].options[0].score=0,(f:FormDraft)=>f.descriptive!.groups[0].itemKeys[0]='unknown']){
   const form=selected();mutate(form);expect(validateFormDefinition(form).issues.length).toBeGreaterThan(0)
  }
  expect(()=>describeFormResponse(selected(),{'tr-t01-01':'foreign'},[])).toThrow()
 })
 it('uses different explicit denominators and preserves skip/refusal without zeros',()=>{
  const form=u4Candidate('u4-sr24--sr-t01')!.definition,acc=createProtectedFormItems(form),keys=form.descriptive!.items.map(i=>i.itemKey)
  // 10 valid (five 0, five 4), and five each NA, U, refusal, omission.
  for(const value of ['f0','f4','na','u',{_surveyRefusal:true},undefined])for(let n=0;n<5;n++){
   const r=normalized(form,Object.fromEntries(keys.flatMap(k=>value===undefined?[]:[[k,value]])))
   recordProtectedFormAnswers(acc,r.rawAnswers,r.missing)
  }
  const result=discloseProtectedFormItems(acc,30,STANDARD,10)[0]
  expect(result).toMatchObject({status:'READY',descriptive:{submittedN:30,validN:10,frequencyDenominator:'VALID_ORDINAL_RESPONSES',nonresponseDenominator:'SUBMITTED_RESPONSES'}})
  expect(result.descriptive?.frequencies[0]).toMatchObject({key:'f0',percentage:50})
  expect(result.cells?.find(c=>c.key==='na')?.percentage).toBeCloseTo(100/6)
  expect(result.cells?.find(c=>c.key==='SHOWN_MISSING')?.count).toBe(5)
  expect(result.cells?.find(c=>c.key==='REFUSED')?.count).toBe(5)
 })
 it('applies small-cell, minimum-valid-N, distribution and coarse-precision restrictions before releasing conditional percentages',()=>{
  const form=selected(),keys=form.descriptive!.items.map(i=>i.itemKey),acc=createProtectedFormItems(form)
  for(let n=0;n<10;n++){const r=normalized(form,Object.fromEntries(keys.map(k=>[k,n===0?'na':'f0'])));recordProtectedFormAnswers(acc,r.rawAnswers,r.missing)}
  expect(discloseProtectedFormItems(acc,10,undefined,5)[0]).toMatchObject({status:'WITHHELD',reason:'SMALL_CELL'})
  expect(discloseProtectedFormItems(acc,10,{...STANDARD,withholdSmallCells:false},10)[0]).toMatchObject({status:'WITHHELD',reason:'MINIMUM_VALID_N'})
  const all=createProtectedFormItems(form)
  for(let n=0;n<10;n++){const r=normalized(form,Object.fromEntries(keys.map(k=>[k,'f0'])));recordProtectedFormAnswers(all,r.rawAnswers,r.missing)}
  expect(discloseProtectedFormItems(all,10,{...STANDARD,restrictItemDistributions:true})[0]).toMatchObject({status:'WITHHELD'})
  const coarse=discloseProtectedFormItems(all,10,{...STANDARD,restrictedStatisticsProjection:true})[0]
  expect(coarse).toMatchObject({descriptive:{submittedN:null,validN:null},precision:'ROUNDED_10_PERCENT'})
  expect(coarse.cells?.every(c=>!('count'in c))).toBe(true)
 })
})
