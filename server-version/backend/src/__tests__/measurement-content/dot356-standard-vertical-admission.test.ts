import {describe,it,expect,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {createScaleAdmissionForRuntime} from '../../modules/scale/scale-admission.service'
import {getScaleInstrumentSource,getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {registeredSelfAuthoredSourceProof} from '../../modules/scale/onboarding/self-authored'
import {hashScaleDeploymentPolicy,scaleDeploymentPolicyV2Schema,type ScaleDeploymentPolicy} from '../../modules/scale/policy/deployment'
import {hashScaleDefinition,validateScaleDefinition} from '../../modules/scale/scale-definition'
import {parseFrozenUnitAdmissionV2,hashFrozenUnitAdmissionV2,encryptVersionedFrozenUnitAdmission,decryptVersionedFrozenUnitAdmission,type FrozenUnitAdmissionV2} from '../../modules/assessment-runtime/admission-snapshot-v2'

const key='academic_self_concept_biology_zh_cn',version='1.0.0'
const source=getScaleInstrumentSource(key,version)!,compiled=getScaleInstrumentRuntimePolicy(key,version)!
const sourceHash=registeredSelfAuthoredSourceProof(key,version)!
const policy:ScaleDeploymentPolicy={schemaVersion:2,revision:1,locale:'zh-CN',territory:'ZZ',deploymentModes:['COMPOSITE'],runtimePolicyHash:compiled.runtimePolicyHash,
 localizationVersion:version,inFlightCompletion:'FROZEN_DEADLINE'}
const scale={id:'synthetic-scale',code:key,name:'Synthetic biology',instrumentVersion:version,instrumentClass:'STANDARD' as const,status:'PUBLISHED'}
function input(p:ScaleDeploymentPolicy=policy){
 const db={instrumentAuthorization:{findMany:vi.fn(async()=>[])},$queryRaw:vi.fn(async()=>[{id:'deployment',scaleId:scale.id,revision:1,status:'ACTIVE',
  policyJson:p,policyHash:hashScaleDeploymentPolicy(p),authorizationRefs:p.schemaVersion===1?p.authorizationRefs:[],createdByUserId:'system',createdAt:new Date(),activatedAt:new Date(),retiredAt:null}])}
 return {db:db as any,attemptEpoch:1,scale,principal:{userId:'student',questionnaireSessionId:null,recoveryTokenHash:null},parent:null,
  runtime:{schemaVersion:2,instrumentKey:key,instrumentVersion:version,sourceDefinitionHash:hashScaleDefinition(source.executable!.definition),runtimePolicyHash:compiled.runtimePolicyHash,
   compiledPolicy:compiled,compiledRuntime:{compiledRuntimeHash:canonicalHash({fixture:'compiled-runtime'})}} as any,
  requestedMode:'COMPOSITE' as const,contextSnapshotHash:canonicalHash({gradeLevel:'7'}),contextValues:{gradeLevel:'7' as const},contextFrozenAt:'2026-10-25T00:00:00.000Z'}
}
async function frozen(){return await createScaleAdmissionForRuntime(input()) as FrozenUnitAdmissionV2}
function withBinding(snapshot:FrozenUnitAdmissionV2,binding:any){const copy=structuredClone(snapshot);copy.scalePolicy!.deployment=binding;copy.snapshotHash=hashFrozenUnitAdmissionV2(copy);return copy}
describe('dot356 deployment identity without copyright/use-license gate',()=>{
 it('does not reinterpret unknown copyright metadata as approved or block valid Scale publication',()=>{
  const definition=structuredClone(source.executable!.definition)
  definition.license={status:'unknown',redistribution:'unknown'}
  const result=validateScaleDefinition(definition,{instrumentClass:'STANDARD',forPublish:true})
  expect(result.issues.filter(i=>i.severity==='error'&&i.path==='license')).toEqual([])
  expect(definition.license).toEqual({status:'unknown',redistribution:'unknown'})
  definition.report.disclaimer=''
  expect(validateScaleDefinition(definition,{instrumentClass:'STANDARD',forPublish:true}).issues.some(i=>i.path==='report.disclaimer'&&i.severity==='error')).toBe(true)
 })
 it('runs the real evaluator and freezes operational identity without license data',async()=>{
  const snapshot=await frozen(),parsed=parseFrozenUnitAdmissionV2(JSON.parse(JSON.stringify(snapshot)))
  expect(parsed.governance.status).toBe('READY');expect(parsed.scalePolicy!.deployment).toMatchObject({basis:'DEPLOYMENT_IDENTITY',revision:1,policyHash:hashScaleDeploymentPolicy(policy)})
  expect(parsed.scalePolicy!.deployment).not.toHaveProperty('authorizationId');expect(parsed.scalePolicy!.deployment).not.toHaveProperty('authorizationVersion')
  expect(parsed.scalePolicy!.deployment!.completionDeadline).toBeTruthy();expect(parsed.snapshotHash).toBe(snapshot.snapshotHash)
  vi.stubEnv('DATA_ENCRYPTION_KEY','b7'.repeat(32))
  try {expect(decryptVersionedFrozenUnitAdmission(encryptVersionedFrozenUnitAdmission(snapshot),snapshot.snapshotHash)).toEqual(snapshot)}
  finally {vi.unstubAllEnvs()}
 })
 it('admits legacy policy without consulting copyright records and does not copy them into new snapshots',async()=>{
  const legacy={...policy,schemaVersion:1 as const,commercialNature:'NON_COMMERCIAL' as const,requiredRightsActions:['display'] as const,authorizationRefs:['missing-auth']}
  const args=input(legacy as any)
  args.db.instrumentAuthorization.findMany.mockRejectedValue(new Error('License table must not be queried'))
  const snapshot=await createScaleAdmissionForRuntime(args) as FrozenUnitAdmissionV2
  expect(snapshot.governance.status).toBe('READY')
  expect(snapshot.scalePolicy!.deployment!.basis).toBe('DEPLOYMENT_IDENTITY')
  expect(args.db.instrumentAuthorization.findMany).not.toHaveBeenCalled()
 })
 it('rejects retired license fields on the new policy while preserving mode/runtime gates',async()=>{
  for(const field of ['authorizationRefs','requiredRightsActions','selfAuthoredSourceHash','commercialNature'])
   expect(()=>scaleDeploymentPolicyV2Schema.parse({...policy,[field]:field==='authorizationRefs'?[]:'retired'})).toThrow()
  await expect(createScaleAdmissionForRuntime(input({...policy,deploymentModes:['STANDALONE']}))).rejects.toThrow('DEPLOYMENT_MODE_NOT_BOUND')
  await expect(createScaleAdmissionForRuntime(input({...policy,runtimePolicyHash:'0'.repeat(64)}))).rejects.toThrow('RUNTIME_POLICY_HASH_MISMATCH')
 })
 it('accepts the old third-party shape without adding fields or changing its canonical hash',async()=>{
  const original=await frozen(),{basis:_,sourceHash:__,...common}=original.scalePolicy!.deployment as any
  const old=withBinding(original,{...common,authorizationId:'original-auth',authorizationVersion:4})
  const expected=structuredClone(old) as any;delete expected.snapshotHash
  expect(old.snapshotHash).toBe(canonicalHash(expected))
  expect(parseFrozenUnitAdmissionV2(old)).toEqual(old)
  expect(parseFrozenUnitAdmissionV2(old).scalePolicy!.deployment).not.toHaveProperty('basis')
 })
 it('retains prior authored provenance read-only without changing its hash',async()=>{
  const original=await frozen(),{basis:_,...common}=original.scalePolicy!.deployment as any
  const old=withBinding(original,{...common,basis:'SELF_AUTHORED_SOURCE',sourceHash})
  expect(parseFrozenUnitAdmissionV2(old)).toEqual(old)
 })
 it('rejects absent, partial, mixed, unknown or malformed provenance even with recomputed outer hash',async()=>{
  const original=await frozen(),{basis:_,sourceHash:__,...common}=original.scalePolicy!.deployment as any
  const variants=[{}, {basis:'DEPLOYMENT_IDENTITY',authorizationId:'a',authorizationVersion:1}, {basis:'DEPLOYMENT_IDENTITY',sourceHash}, {authorizationId:'a'}, {authorizationVersion:1}, {basis:'SELF_AUTHORED_SOURCE'}, {sourceHash},
   {basis:'SELF_AUTHORED_SOURCE',sourceHash:'bad'}, {basis:'OTHER',sourceHash},
   {basis:'SELF_AUTHORED_SOURCE',sourceHash,authorizationId:'a',authorizationVersion:1},
   {basis:'SELF_AUTHORED_SOURCE',sourceHash,authorizationId:'a'}]
  for(const variant of variants)expect(()=>parseFrozenUnitAdmissionV2(withBinding(original,{...common,...variant}))).toThrow()
 })
 it('rejects provenance tampering without a matching frozen hash',async()=>{
  const snapshot=await frozen();(snapshot.scalePolicy!.deployment as any).policyHash='0'.repeat(64)
  expect(()=>parseFrozenUnitAdmissionV2(snapshot)).toThrow('hash mismatch')
 })
})
