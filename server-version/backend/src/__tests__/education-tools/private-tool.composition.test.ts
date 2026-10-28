import {beforeEach,describe,expect,it,vi} from 'vitest'
import {privateCompositionDefinitionSchema,educationCompositionBindingSchema,educationCompositionKey} from '../../modules/education-tools/private-tool.composition-contracts'
import {privateToolContentHash,privateToolDefinition,initialPrivateToolDefinition,validatePrivateToolDefinition} from '../../modules/education-tools/private-tool.definition'
import {compilePrivateComposition} from '../../modules/education-tools/private-tool.composition-compiler'
import {loadSealedEducationIdentity} from '../../modules/education-tools/private-tool.composition-runtime'
import {trainingContentSnapshotSchema} from '../../modules/composite/training-content-binding'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import type {Prisma} from '@prisma/client'
import type {PrivateToolContext} from '../../modules/education-tools/private-tool.contracts'

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context:PrivateToolContext={entry:'TEACHER',organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL'}}
const form={schemaVersion:2,pages:[{pageKey:'p',title:'A page',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'A question',required:false,options:[],rows:[]}]}]}
const scale=()=>compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',
 responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],
 items:[{itemKey:'q',prompt:'A scale question',required:true,reverse:false,dimensionKeys:['total']}]})
function version(kind:'SCALE'|'FORM',n:number){
 const definition=kind==='SCALE'?scale():form,title='Synthetic '+kind
 return {id:id(n),toolId:id(n+10),entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),kind,title,definition,
  sourceRevision:2,contentHash:privateToolContentHash(kind,title,definition),createdAt:new Date(0)}
}
const a=version('SCALE',3),b=version('FORM',4)
const definition=()=>({schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'Overall instructions',
 blocks:[a,b].map((source,n)=>({blockId:id(20+n),instruction:'Before block '+n,source:{provider:'PRIVATE_VERSION',kind:source.kind,versionId:source.id,contentHash:source.contentHash}}))})
const m={findMany:vi.fn(),assets:vi.fn(),header:vi.fn()}
const tx={educationPrivateToolVersion:{findMany:m.findMany},storedAsset:{findMany:m.assets},compositeAssessment:{findUnique:m.header}} as unknown as Prisma.TransactionClient
beforeEach(()=>{vi.clearAllMocks();m.findMany.mockResolvedValue([a,b])})

describe('Private ordinary composition definition and scoped compilation',()=>{
 it('saves incomplete reference-only drafts without granting freeze readiness',()=>{
  for(const entry of ['SCHOOL','TEACHER'] as const){
   const raw=initialPrivateToolDefinition('COMPOSITION',entry)
   expect(privateToolDefinition('COMPOSITION',raw)).toEqual(raw)
   expect(validatePrivateToolDefinition('COMPOSITION',raw).valid).toBe(false)
  }
  expect(privateToolDefinition('COMPOSITION',definition())).toEqual(definition())
 })
 it('rejects formal packages, nested questionnaires, arbitrary configuration and duplicate block identities',()=>{
  const original=definition()
  for(const kind of ['PACKAGE_REFERENCE','BUNDLE','COMPOSITION','COGNITIVE','SJT'])
   expect(privateCompositionDefinitionSchema.safeParse({...original,blocks:[{...original.blocks[0],source:{...original.blocks[0].source,kind}}]}).success).toBe(false)
  expect(privateCompositionDefinitionSchema.safeParse({...original,blocks:[{...original.blocks[0],scoring:{}}]}).success).toBe(false)
  expect(privateCompositionDefinitionSchema.safeParse({...original,blocks:[original.blocks[0],original.blocks[0]]}).success).toBe(false)
  expect(privateCompositionDefinitionSchema.safeParse({...original,flow:{}}).success).toBe(false)
  expect(privateCompositionDefinitionSchema.safeParse({...original,administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'}}).success).toBe(false)
 })
 it('batch loads exact immutable sources once and preserves original ordered definitions and pages',async()=>{
  const raw=definition(),before=structuredClone(raw),compiled=await compilePrivateComposition(tx,context,raw)
  expect(compiled.definition).toEqual(before)
  expect(compiled.leaves.get(a.id)).toMatchObject({kind:'SCALE',definition:a.definition})
  expect(compiled.leaves.get(b.id)).toMatchObject({kind:'FORM',form:{definition:form,sections:[{title:'A page',items:[{formDefinition:form.pages[0].questions[0]}]}]}})
  expect(m.findMany).toHaveBeenCalledExactlyOnceWith({where:{id:{in:[a.id,b.id]},entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),kind:{in:['SCALE','FORM']}}})
  expect(m.assets).not.toHaveBeenCalled();expect(raw).toEqual(before)
 })
 it('rejects missing, foreign, wrong-kind and changed exact source references rather than selecting latest',async()=>{
  m.findMany.mockResolvedValueOnce([b])
  await expect(compilePrivateComposition(tx,context,definition())).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_SOURCE_NOT_FOUND'})
  for(const source of [{...definition().blocks[0].source,kind:'FORM'},{...definition().blocks[0].source,contentHash:'f'.repeat(64)}])
   await expect(compilePrivateComposition(tx,context,{...definition(),blocks:[{...definition().blocks[0],source}]})).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_SOURCE_NOT_FOUND'})
  m.findMany.mockResolvedValueOnce([{...a,definition:{...a.definition,description:'Tampered'}},b])
  await expect(compilePrivateComposition(tx,context,definition())).rejects.toMatchObject({code:'PRIVATE_TOOL_HASH_MISMATCH'})
 })
 it('rejects empty or wrong-population definitions before loading sources',async()=>{
  await expect(compilePrivateComposition(tx,context,{...definition(),blocks:[]})).rejects.toMatchObject({code:'PRIVATE_TOOL_DEFINITION_INCOMPLETE'})
  await expect(compilePrivateComposition(tx,{...context,entry:'SCHOOL'},definition())).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_VARIANT_UNSUPPORTED'})
  expect(m.findMany).not.toHaveBeenCalled()
 })
 it('deduplicates source reads when a leaf is deliberately used twice, keeping two distinct blocks',async()=>{
  const raw=definition();raw.blocks[1].source={...raw.blocks[0].source}
  const compiled=await compilePrivateComposition(tx,context,raw)
  expect(compiled.leaves.size).toBe(1);expect(compiled.definition.blocks).toHaveLength(2)
  expect(m.findMany).toHaveBeenCalledTimes(1)
 })
})

describe('Sealed education identity is a header bound to an independent anchor',()=>{
 const origin={schemaVersion:1 as const,adapterVersion:'1.0.0' as const,mode:'COMPOSITION' as const,entry:'TEACHER' as const,
  organizationId:id(1),ownerUserId:id(2),toolId:id(30),versionId:id(31),contentHash:'a'.repeat(64),variantKey:'TEACHER:SELF' as const}
 const anchor={compositeId:id(32),resourceKey:educationCompositionKey(origin),manifestHash:'b'.repeat(64),origin}
 const header=()=>({id:anchor.compositeId,creationKey:anchor.resourceKey,creationHash:canonicalHash(origin),createdBy:origin.ownerUserId,
  status:'DRAFT',publishedAt:null,productKind:'ORGANIZATION_RESOURCE',publicEnabled:false,copyable:false,trainingContentSnapshotHash:anchor.manifestHash})
 it('reads one bounded header without loading source JSON, snapshot, items, sections, or recompiling',async()=>{
  m.header.mockResolvedValue(header())
  await expect(loadSealedEducationIdentity(tx,anchor)).resolves.toMatchObject({compositeId:id(32),identityOnly:true,canPublish:false,status:'DRAFT'})
  expect(m.header).toHaveBeenCalledTimes(1)
  const selection=m.header.mock.calls[0][0]
  expect(selection).not.toHaveProperty('include')
  for(const field of ['trainingContentSnapshot','items','formSections'])expect(selection.select).not.toHaveProperty(field)
  expect(m.findMany).not.toHaveBeenCalled();expect(m.assets).not.toHaveBeenCalled()
 })
 it.each(['creationKey','creationHash','createdBy','trainingContentSnapshotHash'])('rejects a mismatched %s anchor',async field=>{
  m.header.mockResolvedValue({...header(),[field]:'forged'})
  await expect(loadSealedEducationIdentity(tx,anchor)).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_IDENTITY_INVALID'})
 })
 it('does not accept a loose receipt, incomplete publication or a cross-entry key',async()=>{
  m.header.mockResolvedValue(null)
  await expect(loadSealedEducationIdentity(tx,anchor)).rejects.toThrow('IDENTITY_INVALID')
  m.header.mockResolvedValue({...header(),status:'PUBLISHED'})
  await expect(loadSealedEducationIdentity(tx,anchor)).rejects.toThrow('IDENTITY_INVALID')
  await expect(loadSealedEducationIdentity(tx,{...anchor,origin:{...origin,entry:'SCHOOL',variantKey:'STUDENT:SELF'}})).rejects.toThrow('IDENTITY_INVALID')
 })
 it('keeps legacy Training snapshots exact and permits only the strict typed education extension',()=>{
  const old={schemaVersion:1,compositeId:id(32),units:[]}
  expect(trainingContentSnapshotSchema.parse(old)).toEqual(old)
  const binding={schemaVersion:1,origin,sealed:true,manifest:[{blockId:id(20),instruction:'',kind:'SCALE',versionId:a.id,
   contentHash:a.contentHash,toolId:a.toolId,itemIds:[id(40)],sectionIds:[]}]}
  expect(trainingContentSnapshotSchema.safeParse({...old,educationBinding:binding}).success).toBe(true)
  expect(educationCompositionBindingSchema.safeParse({...binding,sealed:false}).success).toBe(false)
  expect(educationCompositionBindingSchema.safeParse({...binding,origin:{...origin,mode:'PACKAGE_REFERENCE'}}).success).toBe(false)
  expect(educationCompositionBindingSchema.safeParse({...binding,manifest:[...binding.manifest,...binding.manifest]}).success).toBe(false)
 })
})
