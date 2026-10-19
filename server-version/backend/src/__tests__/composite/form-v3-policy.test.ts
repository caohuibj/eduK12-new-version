import {describe,it,expect,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {normalizeCompositeSectionAnswers} from '../../modules/composite/final-submit.service'
import {mapCompositeSection,compositeFormSectionDefinitionHash} from '../../modules/assessment-runtime/form-section-definition'
import {formFactsFor} from '../../modules/assessment-runtime/unified-form-section-final-submit.service'
import {assertTypedCompositeFormFacts} from '../../modules/assessment-runtime/typed-form-facts'
import {validateTypedCompositeSectionDefinition} from '../../modules/assessment-runtime/typed-form'
import {remapTrainingFormDefinition} from '../../modules/assessment-runtime/form-policy'
const policy={version:3,requiredRefusal:'ALLOW_SUBMIT',hiddenRequired:'EXEMPT'}
const opts=[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'},{optionKey:'other',label:'其他'}]
const q=(id:string,type:string,extra:any={})=>({id,formType:({SINGLE:'single_choice',MULTIPLE:'multiple_choice',SHORT_TEXT:'text_input'} as any)[type]??type.toLowerCase(),formLabel:id,required:true,position:0,formPolicy:policy,formOptions:['SINGLE','MULTIPLE'].includes(type)?opts.map(o=>({value:o.optionKey,label:o.label})):null,formDefinition:{itemKey:'q_'+id,type,prompt:id,required:true,options:['SINGLE','MULTIPLE','MATRIX'].includes(type)?opts:[],rows:[],...extra}})
const section=(items:any[])=>mapCompositeSection({id:'s',title:'Form',position:0,items:items.map((item,i)=>({...item,position:i}))})
const submit=(s:any,answers:any[])=>normalizeCompositeSectionAnswers(s,answers)
const answer=(formItemId:string,value:any,extra={})=>({formItemId,value,...extra})
describe('Training V3 section policy',()=>{
 it('distinguishes hidden, refusal, answered and shown missing in authoritative facts',()=>{
  const s=section([q('a','SINGLE'),q('b','SHORT_TEXT',{displayIf:{itemKey:'q_a',operator:'EQUALS',optionKey:'yes'}}),q('c','SHORT_TEXT',{allowRefusal:true}),{...q('d','SHORT_TEXT',{required:false}),required:false}])
  const normalized=submit(s,[answer('a','no'),answer('c',{_surveyRefusal:true})])
  expect(normalized.taskSatisfaction).toBe('NOT_SATISFIED')
  const facts=formFactsFor(s.id,normalized.normalized)
  expect(facts.schemaVersion).toBe(3)
  expect(facts.items.map((f:any)=>f.state)).toEqual(['ANSWERED','NOT_SHOWN','REFUSED','SHOWN_MISSING'])
  expect(normalized.payloadAnswers.some(a=>a.formItemId==='b')).toBe(false)
  assertTypedCompositeFormFacts(s,facts)
  for(const value of [null,'injected',{_surveyRefusal:true}])expect(()=>submit(s,[answer('a','no'),answer('b',value),answer('c',{_surveyRefusal:true})])).toThrow()
 })
 it('freezes required refusal and hidden qualification independently',()=>{
  const refused=section([q('a','SHORT_TEXT',{allowRefusal:true})]); refused.items[0].formPolicy={...policy,requiredRefusal:'BLOCK_SUBMIT'}
  expect(()=>submit(refused,[answer('a',{_surveyRefusal:true})])).toThrow()
  const hidden=section([q('a','SINGLE'),q('b','SHORT_TEXT',{displayIf:{itemKey:'q_a',operator:'EQUALS',optionKey:'yes'}})])
  expect(submit(hidden,[answer('a','no')]).taskSatisfaction).toBe('SATISFIED')
  const hash=compositeFormSectionDefinitionHash(hidden)
  hidden.items[1].formPolicy={...policy,hiddenRequired:'NOT_SATISFIED'}
  expect(submit(hidden,[answer('a','no')]).taskSatisfaction).toBe('NOT_SATISFIED')
  expect(compositeFormSectionDefinitionHash(hidden)).not.toBe(hash)
 })
 it('validates other text, exclusivity and unknown side fields',()=>{
  const s=section([q('a','MULTIPLE',{otherOptionKey:'other',otherMaxLength:8,exclusiveOptionKeys:['no']})])
  const n=submit(s,[answer('a',['other'],{otherText:'细节'})]); const f=formFactsFor(s.id,n.normalized)
  expect((f.items[0] as any).otherText).toBe('细节'); assertTypedCompositeFormFacts(s,f)
  for(const a of [answer('a',['other']),answer('a',['no','yes']),answer('a',['yes'],{otherText:'注入'}),answer('a',['other'],{otherText:'123456789'})])expect(()=>submit(s,[a])).toThrow()
 })
 it('keeps matrix row refusal distinct and refuses unauthorized rows',()=>{
  const s=section([q('a','MATRIX',{allowRefusal:true,rows:[{rowKey:'r1',label:'一'},{rowKey:'r2',label:'二'}]})])
  const n=submit(s,[answer('a',{r1:'yes',r2:{_surveyRefusal:true}})]);const f=formFactsFor(s.id,n.normalized)
  expect((f.items[0] as any).rowStates).toEqual({r1:'ANSWERED',r2:'REFUSED'});expect(n.taskSatisfaction).toBe('NOT_SATISFIED');assertTypedCompositeFormFacts(s,f)
  expect(()=>submit(s,[answer('a',{r1:'yes',r2:'no',unknown:'yes'})])).toThrow()
 })
 it('rejects forward, dangling, cross-section and Likert condition sources',()=>{
  const target=q('b','SHORT_TEXT',{displayIf:{itemKey:'q_a',operator:'EQUALS',optionKey:'yes'}})
  const valid=section([q('a','SINGLE'),target])
  expect(()=>validateTypedCompositeSectionDefinition(valid.items)).not.toThrow()
  // Missing after deletion or selecting only the destination section has the
  // same closed section namespace; neither may borrow a question elsewhere.
  for(const items of [[target],[target,q('a','SINGLE')],[q('a','LIKERT',{options:opts}),target]]) {
   expect(()=>validateTypedCompositeSectionDefinition(section(items).items)).toThrow('前置单选或多选题')
  }
  const dangling=section([q('a','SINGLE'),q('b','SHORT_TEXT',{displayIf:{itemKey:'q_missing',operator:'EQUALS',optionKey:'yes'}})])
  expect(()=>validateTypedCompositeSectionDefinition(dangling.items)).toThrow('前置单选或多选题')
 })
 it('remaps references by exact keys without touching labels/options',()=>{
  const d=q('b','SHORT_TEXT',{prompt:'q_a is text',displayIf:{itemKey:'q_a',operator:'EQUALS',optionKey:'q_a'}}).formDefinition
  expect(remapTrainingFormDefinition(d,new Map([['q_a','q_new_a'],['q_b','q_new_b']]))).toMatchObject({itemKey:'q_new_b',prompt:'q_a is text',displayIf:{itemKey:'q_new_a',optionKey:'q_a'}})
  expect(()=>remapTrainingFormDefinition(d,new Map([['q_b','q_new_b']]))).toThrow()
 })
})

it('does not treat unknown qualifications as task satisfaction',async()=>{
 const {isTaskSatisfied}=await import('../../modules/assessment-runtime/form-policy')
 for(const taskSatisfaction of [undefined,null,'SATISFIED'])expect(isTaskSatisfied({status:'COMPLETED',taskSatisfaction})).toBe(true)
 for(const taskSatisfaction of ['NOT_SATISFIED','corrupt',''])expect(isTaskSatisfied({status:'COMPLETED',taskSatisfaction})).toBe(false)
 expect(isTaskSatisfied({status:'IN_PROGRESS',taskSatisfaction:'SATISFIED'})).toBe(false)
})
it('rejects prototype keys and side-channel text on legacy questions',()=>{
 const s=section([q('a','MATRIX',{rows:[{rowKey:'constructor',label:'bad'}]})]);expect(()=>submit(s,[])).toThrow()
 const legacy=section([{id:'old',formType:'text_input',formLabel:'old',required:false,position:0}]);expect(()=>submit(legacy,[answer('old','hi',{otherText:'extra'})])).toThrow()
})

it('rejects prototype wire keys before record parsing can drop them',async()=>{
 const {finalCompositeFormSectionSubmitSchema}=await import('../../services/questionnaire-final-submit.schema')
 const base={submissionId:'submission-123456789',attemptEpoch:1,definitionHash:'hash',answers:[{formItemId:'a',value:JSON.parse('{"__proto__":"yes","r1":"yes"}')}]}
 expect(finalCompositeFormSectionSubmitSchema.safeParse({...base,answers:[{formItemId:'a',value:{r1:'yes'}}]}).success).toBe(true)
 const parsed=finalCompositeFormSectionSubmitSchema.safeParse(base);expect(parsed.success).toBe(false)
 if(!parsed.success)expect(parsed.error.issues.some(issue=>issue.path.includes('__proto__'))).toBe(true)
})
