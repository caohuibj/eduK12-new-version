import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {decryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
import {createCodeBundleDefinitionProvider} from '../../modules/bundle-product/code-catalog'
import {readFrozenBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {instantiateBundleStructure,type BundleBindings,type BundleSlotResource} from '../../modules/bundle-product/instantiate'
import {denyAllScaleProjectionPolicy} from '../../modules/scale/projection/policy-resolver'

const m=vi.hoisted(()=>({sections:vi.fn()}))
vi.mock('../../modules/composite/final-submit.service',()=>({ensureCompositeFormSections:m.sections}))
const entry=()=>createCodeBundleDefinitionProvider().exact('integrated_gonogo_adexi_adult_zh_cn_v1','1.0.0')!
const header={code:'isolated-package',name:'Whole package consumer',courseId:null,publicEnabled:false,expiresAt:null,
 createdBy:'education-author',creationKey:'isolated-package-key',creationHash:'a'.repeat(64)}
const database=()=>{
 const items:Array<Record<string,unknown>>=[]
 return {items,tx:{compositeAssessment:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>({id:'whole-parent',...data}))},
  compositeAssessmentItem:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>{const item={id:'item-'+items.length,...data};items.push(item);return item})},
  bundleInstance:{create:vi.fn(async({data}:{data:Record<string,unknown>})=>data)}}}
}
beforeEach(()=>{vi.stubEnv('DATA_ENCRYPTION_KEY','18'.repeat(32));vi.clearAllMocks()})
afterEach(()=>vi.unstubAllEnvs())
describe('complete native package materialization seam',()=>{
 it('preserves original whole definition, context, ordered slots and encrypted binding identity without Training authority',async()=>{
  const source=entry(),{tx,items}=database(),seen:string[]=[]
  const resolveSlot=vi.fn(async(slot:typeof source.definition.slots[number]):Promise<BundleSlotResource>=>{
   seen.push(slot.slotKey)
   if(slot.unitType==='SCALE')return {type:'SCALE',scaleId:'original-scale',scaleDisclosure:denyAllScaleProjectionPolicy()}
   return {type:'COGNITIVE',cognitiveAssignmentId:'exact-profile-wrapper'}
  })
  const row=await instantiateBundleStructure(tx as unknown as Prisma.TransactionClient,{entry:source,header,sourceReference:'education-package:exact-source',resolveSlot})
  expect(row.id).toBe('whole-parent')
  expect(tx.compositeAssessment.create).toHaveBeenCalledWith({data:{...header,productKind:'ASSESSMENT_BUNDLE'}})
  expect(seen).toEqual([...source.definition.slots].filter(s=>s.unitType!=='FORM').sort((a,b)=>a.position-b.position).map(s=>s.slotKey))
  expect(items[0]).toMatchObject({type:'FORM',position:0,formLabel:'年龄（周岁）',required:true})
  expect(m.sections).toHaveBeenCalledExactlyOnceWith('whole-parent',tx)
  const stored=tx.bundleInstance.create.mock.calls[0][0].data
  const frozen=readFrozenBundleProductionDefinition(decryptCognitivePayload(stored.definitionEncrypted as string))
  expect(frozen.bundleSnapshot.bundleDefinition).toEqual(source.definition)
  expect(frozen.contextDefinition).toEqual(source.contextDefinition)
  expect(frozen.reportDefinition).toEqual(source.reportDefinition)
  expect(frozen.ruleSet).toEqual(source.ruleSet)
  expect(frozen.contentHash).toBe(stored.definitionHash)
  const bindings=decryptCognitivePayload<BundleBindings>(stored.bindingsEncrypted as string)
  expect(canonicalHash(bindings)).toBe(stored.bindingsHash)
  expect(bindings.slots.map(s=>s.slotKey)).toEqual(seen)
  expect(bindings.context[0]).toMatchObject({contextKey:'subject_age_years',itemId:items[0].id,valueType:'number'})
  expect(items.find(item=>item.type==='COGNITIVE')).toMatchObject({cognitiveAssignmentId:'exact-profile-wrapper'})
 })
 it('fails before any materialization when an unsupported optional native slot is supplied',async()=>{
  const source=entry(),{tx}=database(),resolveSlot=vi.fn()
  source.definition.slots[0].required=false
  await expect(instantiateBundleStructure(tx as unknown as Prisma.TransactionClient,{entry:source,header,sourceReference:'test',resolveSlot})).rejects.toThrow()
  expect(tx.compositeAssessment.create).not.toHaveBeenCalled()
  expect(resolveSlot).not.toHaveBeenCalled()
 })
 it('does not persist an instance when a resolver substitutes another native family',async()=>{
  const source=entry(),{tx}=database()
  const resolveSlot=vi.fn(async():Promise<BundleSlotResource>=>({type:'SITUATIONAL',situationalInstrumentKey:'unrelated',situationalInstrumentVersion:'1.0.0'}))
  await expect(instantiateBundleStructure(tx as unknown as Prisma.TransactionClient,{entry:source,header,sourceReference:'test',resolveSlot})).rejects.toThrow('类型不匹配')
  expect(tx.bundleInstance.create).not.toHaveBeenCalled()
 })
 it('preserves exact SJT identity instead of accepting an alternative version from a resolver',async()=>{
  const source=createCodeBundleDefinitionProvider().exact('example_descriptive_v1','1.0.0')!,{tx}=database()
  const resolveSlot=vi.fn(async():Promise<BundleSlotResource>=>({type:'SITUATIONAL',situationalInstrumentKey:source.definition.slots[0].instrumentKey,situationalInstrumentVersion:'2.0.0'}))
  await expect(instantiateBundleStructure(tx as unknown as Prisma.TransactionClient,{entry:source,header,sourceReference:'test',resolveSlot})).rejects.toThrow('精确版本不匹配')
  expect(tx.bundleInstance.create).not.toHaveBeenCalled()
 })
})
