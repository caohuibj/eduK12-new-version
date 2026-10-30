import {describe,expect,it,vi,beforeEach} from 'vitest'
const guards=vi.hoisted(()=>({author:vi.fn(),legacy:vi.fn(),headers:vi.fn(),uses:vi.fn(),libraries:vi.fn(),libraryHeaders:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:guards.author}))
vi.mock('../../modules/education-tools/native-source.cognitive',()=>({assertEducationCognitiveOriginalUse:guards.legacy}))
vi.mock('../../modules/education-tools/public-source.headers',()=>({readEducationPublicSourceHeaders:guards.headers}))
vi.mock('../../modules/education-tools/public-source.catalog',()=>({readEducationPublicUse:guards.uses}))
vi.mock('../../modules/education-tools/library-source.use',()=>({assertEducationLibraryUses:guards.libraries}))
vi.mock('../../modules/education-tools/library-source.catalog',()=>({assertEducationLibraryHeaders:guards.libraryHeaders}))
import {assertCompositionCollection} from '../../modules/assessment-run/educationCompositionExecution'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,hash='a'.repeat(64),artifactHash='b'.repeat(64)
function fixture(precise=false){
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'SCHOOL' as const,organizationId:id(1),ownerUserId:id(2),toolId:id(3),versionId:id(4),contentHash:hash,variantKey:'STUDENT:SELF' as const}
 const manifest=[{sourceProvider:'COGNITIVE_CONFIG',versionId:id(5),contentHash:hash,...(precise?{profileArtifactHash:artifactHash}:{})}]
 const tx={$queryRaw:vi.fn(async()=>[{stopped:false,unavailable:false}])},identity={origin,units:[],manifest}
 const key=`education-source:${precise?'COGNITIVE_PROFILE':'COGNITIVE_CONFIG'}:${id(5)}:${precise?artifactHash:hash}`
 guards.headers.mockResolvedValue(new Map([[key,{}]]));guards.uses.mockResolvedValue(new Map([[key,{}]]))
 return {tx,identity,key}
}
describe('formal education START distinguishes precise profiles from existing legacy Cognitive use',()=>{
 beforeEach(()=>vi.resetAllMocks())
 it('retains the original Cognitive MaterialGrant requirement for an untyped legacy manifest',async()=>{
  const f=fixture();guards.legacy.mockRejectedValueOnce(Object.assign(new Error('original use absent'),{code:'COGNITIVE_CONFIG_USE_REQUIRED'}))
  await expect(assertCompositionCollection(f.tx as any,f.identity,'NEW_START')).rejects.toMatchObject({code:'COGNITIVE_CONFIG_USE_REQUIRED'})
  expect(guards.legacy).toHaveBeenCalledWith(f.tx,expect.objectContaining({entry:'SCHOOL'}),[id(5)],false)
  expect(guards.uses).not.toHaveBeenCalled()
 })
 it('requires the exact profile use and entry-scoped source header rather than accepting a legacy config use',async()=>{
  const f=fixture(true)
  await assertCompositionCollection(f.tx as any,f.identity,'NEW_START')
  expect(guards.legacy).toHaveBeenCalledWith(f.tx,expect.anything(),[],false)
  expect(guards.headers).toHaveBeenCalledWith(f.tx,[{kind:'COGNITIVE_PROFILE',id:id(5),hash:artifactHash}],false,'SCHOOL')
  expect(guards.uses).toHaveBeenCalledWith(f.tx,expect.anything(),[f.key],false,undefined,true)
  guards.uses.mockResolvedValueOnce(new Map())
  await expect(assertCompositionCollection(f.tx as any,f.identity,'NEW_START')).rejects.toMatchObject({code:'PUBLIC_SOURCE_USE_REQUIRED'})
 })
 it('retains admitted collection independently of ordinary use withdrawal while preserving emergency stops',async()=>{
  const f=fixture(true);await assertCompositionCollection(f.tx as any,f.identity,'BOUND_COLLECTION')
  expect(guards.author).not.toHaveBeenCalled();expect(guards.legacy).not.toHaveBeenCalled();expect(guards.uses).not.toHaveBeenCalled()
  f.tx.$queryRaw.mockResolvedValueOnce([{stopped:true,unavailable:false}])
  await expect(assertCompositionCollection(f.tx as any,f.identity,'BOUND_COLLECTION')).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_COLLECTION_UNAVAILABLE'})
 })
})
