import {describe,it,expect} from 'vitest'
import {compilePrivateFormRuntime} from '../../modules/education-tools/private-tool.form-runtime-adapter'
import {formDraftSchema,type FormQuestion} from '../../modules/assessment-core/form/definition'
import {normalizeTypedCompositeSection} from '../../modules/assessment-runtime/typed-form'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {EducationPrivateToolError} from '../../modules/education-tools/private-tool.contracts'
const options=[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}]
const q=(type:FormQuestion['type'],patch:Partial<FormQuestion>={}):FormQuestion=>({itemKey:type.toLowerCase(),type,prompt:'Synthetic '+type,required:true,options:[],rows:[],...patch})
const draft=(questions:FormQuestion[])=>formDraftSchema.parse({schemaVersion:2,pages:[{pageKey:'one',title:'Original title',description:'Original instructions',questions}]})
const issues=(input:unknown)=>{try{compilePrivateFormRuntime(input);throw Error('Expected incompatibility')}catch(error){expect(error).toBeInstanceOf(EducationPrivateToolError);return (error as EducationPrivateToolError).issues}}
describe('Education private Form lossless Training-compatible adapter',()=>{
 it('keeps all thirteen typed question definitions and page order/title/instructions without scoring',()=>{
  const questions=[q('SINGLE',{options,otherOptionKey:'b',otherMaxLength:40}),q('MULTIPLE',{options,minSelections:1,maxSelections:2,exclusiveOptionKeys:['b']}),
   q('SHORT_TEXT',{maxLength:100,textValidation:'EMAIL'}),q('LONG_TEXT',{maxLength:150}),q('NUMBER',{min:0,max:10,integerOnly:true,step:1,precision:0}),
   q('LIKERT',{options}),q('MATRIX',{options,rows:[{rowKey:'row',label:'Row'}]}),q('DATE'),q('TIME',{timeZone:'Asia/Shanghai'}),q('RANK_ORDER',{options}),
   q('SLIDER',{min:0,max:10,step:0.5,precision:1}),q('CONSTANT_SUM',{options,total:10,integerOnly:true}),q('MATRIX_MULTIPLE',{options,rows:[{rowKey:'row',label:'Row'}],minSelections:1,maxSelections:2})]
  const original=draft(questions),last=original.pages[0].questions.pop()!
  original.pages.push({pageKey:'two',title:'Second title',description:'Second instructions',questions:[last]})
  const before=canonicalHash(original),compiled=compilePrivateFormRuntime(original)
  expect(compiled.sections.map(page=>[page.pageKey,page.title,page.description])).toEqual(original.pages.map(page=>[page.pageKey,page.title,page.description]))
  expect(compiled.sections.flatMap(page=>page.items.map(item=>item.formDefinition))).toEqual(original.pages.flatMap(page=>page.questions))
  expect(compiled.sections.flatMap(page=>page.items)).toHaveLength(13)
  expect(canonicalHash(original)).toBe(before)
 })
 it('preserves per-question refusal and same-page hidden-required semantics through the actual Training normalizer',()=>{
  const original=draft([q('SINGLE',{options,allowRefusal:false}),q('LONG_TEXT',{allowRefusal:true}),q('SHORT_TEXT',{displayIf:{itemKey:'single',operator:'EQUALS',optionKey:'a'}})])
  const {items}=compilePrivateFormRuntime(original).sections[0]
  const normalized=normalizeTypedCompositeSection(items,new Map([[items[0].id,{value:'b'}],[items[1].id,{value:{_surveyRefusal:true as const}}]]))
  expect(normalized.get(items[1].id)).toMatchObject({state:'REFUSED',qualifies:false})
  expect(normalized.get(items[2].id)).toMatchObject({state:'NOT_SHOWN',qualifies:true})
  expect(()=>normalizeTypedCompositeSection(items,new Map([[items[0].id,{value:{_surveyRefusal:true as const}}],[items[1].id,{value:'text'}]]))).toThrow()
  expect(()=>normalizeTypedCompositeSection(items,new Map([[items[0].id,{value:'b'}],[items[1].id,{value:'text'}],[items[2].id,{value:'injected'}]]))).toThrow()
 })
 it('reports exact image and cross-page/unsupported condition locations, retaining the source intact',()=>{
  const imageDraft=draft([q('SHORT_TEXT',{image:{asset:{assetId:'synthetic',contentHash:'a'.repeat(64),mimeType:'image/png'},altText:'Synthetic',rightsStatus:'self_authored',rightsNote:'Synthetic test'}})])
  const before=canonicalHash(imageDraft)
  expect(issues(imageDraft)).toContainEqual(expect.objectContaining({pageKey:'one',itemKey:'short_text',reason:'QUESTION_IMAGE_UNSUPPORTED'}))
  expect(canonicalHash(imageDraft)).toBe(before)
  const cross=draft([q('SINGLE',{options})]);cross.pages.push({pageKey:'two',title:'Second',questions:[q('SHORT_TEXT',{displayIf:{itemKey:'single',operator:'EQUALS',optionKey:'a'}})]})
  expect(issues(cross)).toContainEqual(expect.objectContaining({pageKey:'two',itemKey:'short_text',reason:'CONDITION_SCOPE_UNSUPPORTED'}))
  const likert=draft([q('LIKERT',{options}),q('SHORT_TEXT',{displayIf:{itemKey:'likert',operator:'EQUALS',optionKey:'a'}})])
  expect(issues(likert)).toContainEqual(expect.objectContaining({pageKey:'one',itemKey:'short_text',reason:'CONDITION_SCOPE_UNSUPPORTED'}))
 })
 it('rejects unknown fields instead of stripping them and rejects empty pages instead of silently skipping them',()=>{
  expect(()=>compilePrivateFormRuntime({schemaVersion:2,pages:[{pageKey:'one',title:'A',questions:[{...q('SHORT_TEXT'),futureLogic:'not representable'}]}]})).toThrow('PRIVATE_FORM_DEFINITION_INVALID')
  const empty=draft([q('SHORT_TEXT')]);empty.pages.push({pageKey:'empty',title:'Instructions without questions',questions:[]})
  expect(issues(empty)).toContainEqual(expect.objectContaining({pageKey:'empty',itemKey:null,reason:'EMPTY_PAGE_UNSUPPORTED'}))
 })
})
