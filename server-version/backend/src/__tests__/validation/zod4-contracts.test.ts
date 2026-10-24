import {describe,it,expect} from 'vitest'
import golden from './fixtures/zod3-contracts.json'
import {z} from 'zod'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createFrozenUnitAdmission,parseFrozenUnitAdmission} from '../../modules/assessment-runtime/admission-snapshot'
import {createFrozenScaleRuntimeSnapshot,parseFrozenScaleRuntimeSnapshot} from '../../modules/assessment-runtime/runtime-snapshot'
import {getScaleInstrumentSource} from '../../modules/scale/onboarding/instrument-registry'
import {createFrozenActiveSlotSet,parseFrozenActiveSlotSet} from '../../modules/assessment-runtime/slot-set'
import {freezeSituationalRuntimeAtAttemptStart,parseFrozenSituationalRuntimeSnapshot} from '../../modules/assessment-runtime/situational-runtime-snapshot'
import {SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE as sjt} from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import {finalScaleSubmitSchema} from '../../services/scale-final-submit.schema'
const frozenAt=new Date('2026-09-21T00:00:00.000Z'), source=getScaleInstrumentSource('adexi_v1','2.0.0')!
const values={
 admission:parseFrozenUnitAdmission(createFrozenUnitAdmission({attemptEpoch:1,scale:{id:'scale-1',code:'adexi_v1',name:'ADEXI',instrumentVersion:'2.0.0'},contextValues:{arbitrary:'value',nested:{a:1}},frozenAt})),
 runtime:parseFrozenScaleRuntimeSnapshot(createFrozenScaleRuntimeSnapshot({instrumentKey:source.identity.instrumentKey,instrumentVersion:source.identity.instrumentVersion,definition:source.executable!.definition,frozenAt})),
 sjt:parseFrozenSituationalRuntimeSnapshot(freezeSituationalRuntimeAtAttemptStart({instrumentKey:sjt.key,instrumentVersion:sjt.instrumentVersion,definition:sjt.definition,frozenAt})),
 slots:createFrozenActiveSlotSet({schemaVersion:1,runtimeGeneration:'UNIFIED_V1',attemptEpoch:1,slots:[{slotKey:'scale:11111111-1111-4111-8111-111111111111',unitType:'SCALE',required:true,sourceDefinitionIdentity:{key:'synthetic',version:'1.0.0',hash:'d'.repeat(64)},sourceBinding:{scaleCode:'synthetic',compiledRuntimeHash:'c'.repeat(64)}}]}),
 final:finalScaleSubmitSchema.parse({submissionId:'synthetic-golden-submit',attemptEpoch:1,definitionHash:'definition',itemTimings:{freeKey:{ms:2}},answers:[{itemCode:'A',responseValue:1}]})
}
// Captured from the actual Zod 3.25.76 parsers before the dependency upgrade.
describe('Zod 4 preserves persisted assessment contracts',()=>{
 it('reconstructs byte-equivalent scientific and admission facts',()=>{
  expect(JSON.parse(JSON.stringify(values))).toEqual(golden)
  for(const key of Object.keys(values) as Array<keyof typeof values>)expect(canonicalHash(values[key])).toBe(canonicalHash(golden[key]))
 })
 it('reads historical Zod 3 frozen payloads without rehashing or rewriting',()=>{
  expect(parseFrozenUnitAdmission(golden.admission)).toEqual(golden.admission)
  expect(parseFrozenScaleRuntimeSnapshot(golden.runtime)).toEqual(golden.runtime)
  expect(parseFrozenSituationalRuntimeSnapshot(golden.sjt)).toEqual(golden.sjt)
  expect(parseFrozenActiveSlotSet(golden.slots)).toEqual(golden.slots)
  expect(finalScaleSubmitSchema.parse(golden.final)).toEqual(golden.final)
 })
 it('preserves legacy UUID-like acceptance instead of imposing new RFC variant restrictions',()=>{
  // Zod 3.25.76 v3/types.cjs uuidRegex accepted all hexadecimal 8-4-4-4-12 IDs.
  const old=/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i
  for(const value of ['11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff','ABCDEFAB-1234-1234-1234-ABCDEFABCDEF','11111111-1111-4111-8111-111111111111','bad','11111111-1111-1111-1111-11111111111g'])expect(z.string().guid().safeParse(value).success).toBe(old.test(value))
 })
 it('keeps arbitrary record keys and absence while rejecting malformed FINAL input',()=>{
  expect(finalScaleSubmitSchema.parse({...golden.final,itemTimings:{}}).itemTimings).toEqual({})
  const {itemTimings,...withoutTiming}=golden.final
  expect(finalScaleSubmitSchema.parse(withoutTiming)).not.toHaveProperty('itemTimings')
  const invalid=finalScaleSubmitSchema.safeParse({...golden.final,attemptEpoch:0})
  expect(invalid.success).toBe(false)
  if(!invalid.success)expect(invalid.error.issues[0].path).toEqual(['attemptEpoch'])
 })
 it('rejects oversized containers before parsing any untrusted element',()=>{
  let visits=0
  const element=z.unknown().transform(value=>{visits++;return value})
  expect(z.array(element).max(1).safeParse([1,2]).success).toBe(false)
  expect(visits).toBe(0)
 })
})
