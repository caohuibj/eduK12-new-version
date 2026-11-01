import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest'
import path from 'node:path'
import {runtimePackageFixture} from './runtime-packages.fixture'
import {packageEntry} from '../../modules/assessment-bundle/onboarding/catalog'
import {BundleDefinitionProvider,freezeBundleProductionDefinition} from '../../modules/bundle-product/definition-provider'
import {bundleBirthYearMonthForm,loadBundleScaleStartContext,validateBundleStartContextMappings} from '../../modules/bundle-product/start-context'
import {buildAssessmentContext} from '../../modules/assessment-context/context'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenActiveSlotSet,encryptFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {createFormSectionCollectionFacts} from '../../modules/assessment-runtime/form-facts'
import {encryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {encryptCognitivePayload} from '../../modules/cognitive/cognitive.security'
const at='2026-11-01T00:00:00.000Z'
const families=[['adult_bedtime_sleep_zh_cn','0.1.0']] as const
function fixture(family:typeof families[number],dob:string){
 const pack=runtimePackageFixture('B10')
 const entry=packageEntry(pack),frozen=freezeBundleProductionDefinition(entry,{frozenAt:at,sourceReference:'synthetic-frozen-dob'})
 validateBundleStartContextMappings(entry.definition,entry.contextDefinition)
 const birthItem=bundleBirthYearMonthForm(entry.definition,'birth_year_month')!
 const context=buildAssessmentContext({items:[{id:'dob',type:birthItem.formType,contextKey:birthItem.contextKey as 'birthYearMonth',required:true}],answers:[{formItemId:'dob',value:dob}],frozenAt:new Date(at)})
 const scaleSlots=entry.definition.slots.filter(s=>s.unitType==='SCALE')
 const bindings={schemaVersion:1,slots:scaleSlots.map(s=>({slotKey:s.slotKey,itemId:s.slotKey,unitType:'SCALE'})),context:entry.contextDefinition!.fields.map(f=>({contextKey:f.contextKey,valueType:f.valueType,itemId:'form-'+f.contextKey}))}
 const instance={definitionHash:frozen.contentHash,definitionEncrypted:encryptCognitivePayload(frozen),bindingsHash:canonicalHash(bindings),bindingsEncrypted:encryptCognitivePayload(bindings)}
 const values:Record<string,string>={birth_year_month:dob,adult_confirmed:'true'}
 const facts=()=>createFormSectionCollectionFacts({sectionKey:'background',items:bindings.context.map(f=>({key:f.itemId,label:f.contextKey,value:values[f.contextKey]??null}))})
 const active=createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'form-section:background',unitType:'FORM_SECTION',required:true,sourceDefinitionIdentity:{key:'background',version:'1.0.0',hash:'1'.repeat(64)},sourceBinding:{sectionId:'background'}}]})
 const row={compositeAttemptId:'synthetic-attempt',attemptEpoch:1,slotKey:'form-section:background',unitType:'FORM_SECTION',terminalState:'COMPLETED',payloadKind:'COLLECTION_FACTS',sourceDefinitionHash:'1'.repeat(64),collectionFactsEncrypted:encryptUnifiedRuntimePayload(facts()),completedAt:new Date(at)}
 const db={bundleInstance:{findFirst:vi.fn().mockResolvedValue(instance)},assessmentUnitSnapshot:{findMany:vi.fn().mockImplementation(async()=>[row])}}
 const parent={id:'synthetic-attempt',attemptEpoch:1,frozenActiveSlotSetEncrypted:encryptFrozenActiveSlotSet(active),frozenActiveSlotSetHash:active.snapshotHash,compositeAssessment:{productKind:'ASSESSMENT_BUNDLE'}}
 const read=(slot=scaleSlots[0],demographic=context.values)=>loadBundleScaleStartContext(db as never,parent,slot.slotKey,slot.instrumentKey,slot.instrumentVersion,demographic)
 return {pack,entry,context,scaleSlots,values,row,db,read,rewrite:()=>{row.collectionFactsEncrypted=encryptUnifiedRuntimePayload(facts())}}
}
beforeEach(()=>vi.stubEnv('DATA_ENCRYPTION_KEY','1'.repeat(64)))
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs()})
describe('source-owned frozen birth-month population facts',()=>{
 it('recognizes the declared DOB contract and accepts every Scale slot exactly at 18',async()=>{
  for(const family of families){
   const f=fixture(family,'2008-11')
   expect(f.context.values.ageMonthsAtFreeze).toBe(216)
   expect(new BundleDefinitionProvider([f.entry]).publicationBlockers(family[0],family[1])).toEqual(['BUNDLE_NOT_PUBLISHED'])
   for(const slot of f.scaleSlots)expect(await f.read(slot)).toMatchObject({assessmentContext:slot.admissionContext!.assessmentContext})
  }
 })
 it('rejects one-month-underage at the frozen time even when the current clock and adult checkbox say adult',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2028-11-01T00:00:00.000Z'))
  for(const family of families){
   const f=fixture(family,'2008-12')
   expect(f.context.values.ageMonthsAtFreeze).toBe(215);expect(f.values.adult_confirmed).toBe('true')
   for(const slot of f.scaleSlots)await expect(f.read(slot)).rejects.toThrow('适用范围')
  }
 })
 it('requires the matching frozen demographic age fact rather than deriving an age from a boolean or typed value',async()=>{
  for(const family of families){
   const f=fixture(family,'2008-11'),missing={...f.context.values};delete missing.ageMonthsAtFreeze
   await expect(f.read(undefined,missing)).rejects.toThrow('已冻结的年龄事实')
   f.values.birth_year_month='1990-01';f.rewrite()
   await expect(f.read()).rejects.toThrow('出生年月')
   const malformed=structuredClone(f.entry);malformed.contextDefinition!.fields.find(f=>f.contextKey==='birth_year_month')!.required=false
   expect(new BundleDefinitionProvider([malformed]).publicationBlockers(family[0],family[1])).toContain('AGE_POPULATION_REQUIRES_DECLARED_CONTEXT')
  }
 })
})
