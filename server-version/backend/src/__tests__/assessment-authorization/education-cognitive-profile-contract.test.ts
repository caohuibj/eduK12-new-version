import {beforeAll,describe,it,expect} from 'vitest'
import {educationCognitiveSourceSchema} from '../../modules/education-tools/native-source.contracts'
import {readSelectedSourceBindings,selectedSourceBindingChanges} from '../../modules/education-tools/selected-source-binding'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const pointer={authorizationId:id(2),authorizationRevision:1,bindingHash:'b'.repeat(64),configurationHash:'c'.repeat(64)}
const source={provider:'COGNITIVE_CONFIG' as const,kind:'COGNITIVE' as const,versionId:id(1),contentHash:'a'.repeat(64),profile:'experience' as const,artifactHash:'d'.repeat(64),selectedBinding:pointer}
beforeAll(()=>{process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)})
describe('Education exact native profile identity contract, not authority',()=>{
 it('requires a paired artifact and original pointer while retaining the explicit old config/profile format',()=>{
  expect(educationCognitiveSourceSchema.parse(source)).toEqual(source)
  const {artifactHash:_,selectedBinding:__,...legacy}=source;expect(educationCognitiveSourceSchema.parse(legacy)).toEqual(legacy)
  for(const bad of [{...legacy,artifactHash:source.artifactHash},{...legacy,selectedBinding:pointer},{...source,profile:'latest'},{...source,selectedBinding:{...pointer,arbitraryGrant:true}}])expect(educationCognitiveSourceSchema.safeParse(bad).success).toBe(false)
 })
 it('uses the artifact identity for current use and audits rather than collapsing two profiles onto the same global M',()=>{
  const {kind:_,profile:__,...projection}=source
  const key=educationPublicSourceKey({kind:'COGNITIVE_PROFILE',id:source.versionId,hash:source.artifactHash})
  expect(readSelectedSourceBindings([projection]).get(key)).toEqual([pointer])
  const a={blockId:id(3),source},b={blockId:id(4),source:{...source,profile:'research',artifactHash:'e'.repeat(64)}}
  const delta=selectedSourceBindingChanges([a],[b])!;expect(delta.removed[0].artifactHash).toBe(source.artifactHash);expect(delta.added[0].artifactHash).toBe('e'.repeat(64))
 })
 it('prevents the generic system root API from creating an untyped exact profile use and leaves legacy native U parsing intact',()=>{
  const raw={requestId:id(3),expectedVersion:0,reason:'Synthetic exact source boundary',grant:{subjectId:id(4),scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:id(5),resourceKind:'material',resourceKeys:[educationPublicSourceKey({kind:'COGNITIVE_PROFILE',id:source.versionId,hash:source.artifactHash})]},capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2020-01-01T00:00:00Z',expiresAt:'2099-01-01T00:00:00Z'}}
  expect(adminContentRootRequestSchema.safeParse(raw).success).toBe(false)
  expect(adminContentRootRequestSchema.safeParse({...raw,grant:{...raw.grant,scope:{...raw.grant.scope,resourceKeys:[educationPublicSourceKey({kind:'COGNITIVE_CONFIG',id:source.versionId,hash:source.contentHash})]}}}).success).toBe(true)
 })
})
