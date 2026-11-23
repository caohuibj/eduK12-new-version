import {describe,expect,it,vi} from 'vitest'
vi.mock('../../config/database',()=>({prisma:{}}))
import {scaleRuntimeInstrumentKey} from '../../modules/scale/runtime-identity'
import {createScaleAdmissionForRuntime} from '../../modules/scale/scale-admission.service'
import {assertUnifiedScaleDelivery} from '../../modules/scale/unified-final-submit.service'
const scale={id:'installed-row',code:'db-scale:installed-row',name:'Imported',instrumentVersion:'1.0.0',instrumentClass:'STANDARD' as const,
 standardSourceKind:'DB_IMPORTED',standardToolKey:'approved-tool',status:'PUBLISHED'}
const start=(overrides:Record<string,unknown>={})=>createScaleAdmissionForRuntime({db:{} as any,attemptEpoch:1,scale:{...scale,...overrides},
 principal:{userId:'synthetic-student'},parent:null,runtime:{schemaVersion:1,instrumentKey:'approved-tool',instrumentVersion:'1.0.0'} as any,
 requestedMode:'COMPOSITE',contextSnapshotHash:null,contextValues:null,contextFrozenAt:null})
describe('imported Scale storage identity and frozen tool identity',()=>{
 it('admits the approved logical tool while keeping the exact installed row in the admission',async()=>{
  expect(scaleRuntimeInstrumentKey(scale)).toBe('approved-tool')
  const admission=await start();expect(admission.scale).toMatchObject({id:'installed-row',code:'db-scale:installed-row'})
 })
 it.each([null,'another-tool'])('rejects missing or mismatched imported mapping (%s)',async standardToolKey=>{
  await expect(start({standardToolKey})).rejects.toMatchObject({statusCode:409})
 })
 it('keeps code-package and custom identities unchanged despite an unrelated imported key',()=>{
  expect(scaleRuntimeInstrumentKey({...scale,standardSourceKind:'CODE_PACKAGE'})).toBe(scale.code)
  expect(scaleRuntimeInstrumentKey({...scale,instrumentClass:'CUSTOM_DESCRIPTIVE'})).toBe(scale.code)
 })
})

const delivery = async (overrides: Record<string, unknown> = {}) => {
 const admission = await start()
 const child = {scale, runtimeGeneration:'UNIFIED_V1',runtimeSnapshotEncrypted:'frozen',attemptEpoch:1,
  userId:'synthetic-student',deliveryMode:'FINAL_ONLY',status:'IN_PROGRESS',questionnaireAssessmentId:null,
  compositeAttemptId:null,compiledRuntimeHash:'runtime-hash'} as any
 const snapshot = {instrumentKey:'approved-tool',instrumentVersion:'1.0.0',compiledRuntime:{compiledRuntimeHash:'runtime-hash'},
  legacyDefinitionHash:'definition-hash',...overrides} as any
 return assertUnifiedScaleDelivery({assessmentId:'child',submissionId:'submission',attemptEpoch:1,userId:'synthetic-student',
  definitionHash:'definition-hash',answers:[]} as any,child,admission,snapshot)
}
describe('imported standard final delivery checks',()=>{
 it('accepts the logical runtime identity while preserving the physical admission row',async()=>{
  await expect(delivery()).resolves.toBeUndefined()
 })
 it.each([{instrumentKey:'db-scale:installed-row'},{instrumentVersion:'2.0.0'},
  {compiledRuntime:{compiledRuntimeHash:'changed'}},{legacyDefinitionHash:'changed'}])('rejects changed frozen identity or digest: %o',async change=>{
  await expect(delivery(change)).rejects.toMatchObject({statusCode:409})
 })
})
