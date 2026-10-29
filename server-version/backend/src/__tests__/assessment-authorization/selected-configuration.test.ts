import {describe,it,expect} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {standardCombinationHash,standardAxisHashes} from '../../modules/measurement-content/standard-combination'
import {sealSelectedConfigurationBinding,readSelectedConfigurationBinding,resolveSelectedConfigurationChoice,
  type SelectedConfiguration} from '../../modules/assessment-authorization/selected-configuration'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const hash=(n:number)=>String(n).padStart(64,'0')
const configuration:SelectedConfiguration={kind:'STANDARD_COMBINATION',toolKey:'synthetic-existing-source',instrumentVersion:'1',
  combinationId:id(1),combinationHash:hash(1),measurement:{releaseId:id(2),contentHash:hash(2)},
  axes:{CONTENT:{version:'C1',hash:hash(3)},PARAMETERS:{version:'none-v1',hash:hash(4)},REPORT:{version:'basic',hash:hash(5)}}}
configuration.combinationHash=standardCombinationHash(configuration.toolKey,standardAxisHashes(configuration.axes))
const authorization={kind:'TRAINING_STANDARD_USE' as const,id:id(3),revision:1,issuerId:id(4),recipientId:id(5),organizationId:null,
  authority:[{kind:'ENTRY_ADMIN' as const,id:id(6),revision:2}]}
const make=()=>sealSelectedConfigurationBinding({product:'TRAINING',configuration,authorization})

describe('exact selected configuration identity at the existing entry boundaries',()=>{
 it('keeps equal C/P with different R as two different immutable selections',()=>{
  const a=make(),other=structuredClone(configuration)
  other.axes.REPORT={version:'fun',hash:hash(6)};other.combinationId=id(7)
  other.combinationHash=standardCombinationHash(other.toolKey,standardAxisHashes(other.axes))
  const b=sealSelectedConfigurationBinding({product:'TRAINING',configuration:other,authorization:{...authorization,id:id(8)}})
  if(a.binding.configuration.kind!=='STANDARD_COMBINATION'||b.binding.configuration.kind!=='STANDARD_COMBINATION')throw new Error('Expected scale')
  expect(a.binding.configuration.axes.CONTENT).toEqual(b.binding.configuration.axes.CONTENT)
  expect(a.binding.configuration.axes.PARAMETERS).toEqual(b.binding.configuration.axes.PARAMETERS)
  expect(a.binding.configurationHash).not.toBe(b.binding.configurationHash)
  expect(a.bindingHash).not.toBe(b.bindingHash)
 })
 it('binds the old grant revision while a later revision has its own identity',()=>{
  const a=make(),b=sealSelectedConfigurationBinding({product:'TRAINING',configuration,authorization:{...authorization,revision:2}})
  expect(a.binding.authorization.revision).toBe(1)
  expect(b.bindingHash).not.toBe(a.bindingHash)
  expect(()=>readSelectedConfigurationBinding(a,{authorizationRevision:2})).toThrow('CONTEXT_MISMATCH')
 })
 it('does not accept a replacement report with either or both stale envelope hashes',()=>{
  const a=structuredClone(make());if(a.binding.configuration.kind!=='STANDARD_COMBINATION')throw new Error('Expected scale')
  a.binding.configuration.axes.REPORT.hash=hash(8)
  expect(()=>readSelectedConfigurationBinding(a)).toThrow()
  a.bindingHash=canonicalHash(a.binding)
  expect(()=>readSelectedConfigurationBinding(a)).toThrow('CONFIGURATION_HASH_MISMATCH')
  a.binding.configurationHash=canonicalHash(a.binding.configuration);a.bindingHash=canonicalHash(a.binding)
  expect(()=>readSelectedConfigurationBinding(a)).toThrow('COMBINATION_HASH_MISMATCH')
 })
 it.each(['product','recipientId','organizationId','authorizationId'] as const)('rejects another %s context',key=>{
  const wrong={product:'SURVEY',recipientId:id(7),organizationId:id(8),authorizationId:id(9)}
  expect(()=>readSelectedConfigurationBinding(make(),{[key]:wrong[key]} as any)).toThrow('CONTEXT_MISMATCH')
 })
 it('preserves absent legacy bindings without filling a current default and rejects corrupt provided data',()=>{
  expect(readSelectedConfigurationBinding(undefined)).toBeNull()
  expect(readSelectedConfigurationBinding(null)).toBeNull()
  for(const raw of [{},'',{...make(),schemaVersion:99}])expect(()=>readSelectedConfigurationBinding(raw)).toThrow()
 })
 it('retains the sealed identity when the original caller later changes its input',()=>{
  const input=structuredClone(configuration),a=sealSelectedConfigurationBinding({product:'TRAINING',configuration:input,authorization})
  input.axes.REPORT.version='latest'
  if(a.binding.configuration.kind!=='STANDARD_COMBINATION')throw new Error('Expected scale')
  expect(a.binding.configuration.axes.REPORT.version).toBe('basic')
  expect(readSelectedConfigurationBinding(JSON.parse(JSON.stringify(a)))).toEqual(a)
 })
 it('permits a self-grant identity without treating it as an authority decision',()=>{
  const a=sealSelectedConfigurationBinding({product:'TRAINING',configuration,authorization:{...authorization,recipientId:authorization.issuerId}})
  expect(a.binding.authorization.recipientId).toBe(a.binding.authorization.issuerId)
  // Service adapters must independently verify BOTH roles; no bypass is returned.
  expect(Object.keys(a)).toEqual(['binding','bindingHash'])
 })
 it('rejects an education source without its school and a Training binding with an education authority kind',()=>{
  expect(()=>sealSelectedConfigurationBinding({product:'SCHOOL',configuration,authorization:{...authorization,kind:'EDUCATION_SOURCE_USE'}})).toThrow('SCOPE_MISMATCH')
  expect(()=>sealSelectedConfigurationBinding({product:'TRAINING',configuration,authorization:{...authorization,kind:'EDUCATION_SOURCE_USE'}})).toThrow('KIND_MISMATCH')
 })
 it('rejects duplicate authority identities and unknown per-attempt seed fields',()=>{
  expect(()=>sealSelectedConfigurationBinding({product:'TRAINING',configuration,authorization:{...authorization,authority:[...authorization.authority,...authorization.authority]}})).toThrow('DUPLICATE_CONFIGURATION_AUTHORITY')
  expect(()=>sealSelectedConfigurationBinding({product:'TRAINING',configuration:{...configuration,seed:'shared-across-subjects'} as any,authorization})).toThrow()
 })
 it('resolves a single administrator default and never chooses a latest ambiguous version',()=>{
  expect(resolveSelectedConfigurationChoice([])).toBeNull()
  expect(resolveSelectedConfigurationChoice([{id:'old',isDefault:false}])?.id).toBe('old')
  expect(resolveSelectedConfigurationChoice([{id:'old',isDefault:true},{id:'new',isDefault:false}])?.id).toBe('old')
  expect(()=>resolveSelectedConfigurationChoice([{id:'old',isDefault:false},{id:'new',isDefault:false}])).toThrow('ADMIN_CONFIGURATION_SELECTION_REQUIRED')
  expect(()=>resolveSelectedConfigurationChoice([{id:'old',isDefault:true},{id:'new',isDefault:true}])).toThrow('ADMIN_CONFIGURATION_SELECTION_REQUIRED')
 })
 it('distinguishes the same cognitive profile name with a new frozen definition',()=>{
  const c:SelectedConfiguration={kind:'COGNITIVE_PROFILE',testType:'existing-task',configId:id(10),configVersion:'1',engineVersion:'1',scoringVersion:'1',
   measurement:{releaseId:id(11),contentHash:hash(11)},profile:'experience',profileDefinitionVersion:'1',resolvedConfigHash:hash(12),protocolSignature:hash(13),
   metricDefinitionVersion:'1',qualityDefinitionVersion:'1',reportDefinitionVersion:'1',reportHash:hash(14),presentationVersion:null}
  const auth={...authorization,kind:'COGNITIVE_PROFILE_USE' as const}
  const a=sealSelectedConfigurationBinding({product:'TRAINING',configuration:c,authorization:auth})
  const b=sealSelectedConfigurationBinding({product:'TRAINING',configuration:{...c,profileDefinitionVersion:'2',resolvedConfigHash:hash(15)},authorization:auth})
  expect(a.binding.configurationHash).not.toBe(b.binding.configurationHash)
 })
})
