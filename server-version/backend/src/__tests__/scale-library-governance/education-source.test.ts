import {randomUUID} from 'node:crypto'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
const m=vi.hoisted(()=>({identity:vi.fn(),authorize:vi.fn(),actor:vi.fn()}))
vi.mock('../../modules/education-tools/private-tool.runtime-source',async()=>{
 const actual=await vi.importActual<typeof import('../../modules/education-tools/private-tool.runtime-source')>('../../modules/education-tools/private-tool.runtime-source')
 return {...actual,readPrivateScaleVersionIdentity:m.identity}
})
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.authorize}))
vi.mock('../../modules/scale-library-governance/authority',()=>({libraryActor:m.actor}))
import {educationSubmissionSource} from '../../modules/scale-library-governance/education-source'
import {privateScaleMeasurementInput} from '../../modules/education-tools/private-tool.runtime-source'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {entryView,submissionView,type SubmissionRow} from '../../modules/scale-library-governance/service'
import {legacyDistributionInput,librarySourceProduct,legacyLibraryProduct} from '../../modules/scale-library-governance/contracts'
const definition=compileResearchScale('Synthetic',{schemaVersion:1,presentationMode:'ONE_BY_ONE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'q',prompt:'Synthetic',required:true,reverse:false,dimensionKeys:['total']}]})
const version={id:randomUUID(),entry:'SCHOOL' as const,organizationId:randomUUID(),ownerUserId:randomUUID(),toolId:randomUUID(),title:'Synthetic',contentHash:'a'.repeat(64)}
function fixture(entry:'SCHOOL'|'TEACHER'='SCHOOL'){
 const v={...version,entry}
 const release:StoredRelease={...prepareRelease(privateScaleMeasurementInput(v,definition)),releaseId:randomUUID(),status:'PUBLISHED',publishedBy:v.ownerUserId,publishedAt:new Date()}
 const findFirst=vi.fn().mockResolvedValue(v),tx={educationPrivateToolVersion:{findFirst}} as unknown as Prisma.TransactionClient
 m.identity.mockResolvedValue({version:v,definition})
 return {v,release,tx,findFirst}
}
beforeEach(()=>{vi.clearAllMocks();m.actor.mockResolvedValue({account_domain:'SCHOOL'});m.authorize.mockResolvedValue(undefined)})
describe('Education authoring source is an exact private version, not a Training alias',()=>{
 it.each(['SCHOOL','TEACHER'] as const)('preserves %s source, tool and immutable version provenance',async entry=>{
  const f=fixture(entry),original=structuredClone(f.release.provenance)
  const result=await educationSubmissionSource(f.tx,f.v.ownerUserId,entry,f.release)
  expect(result).toMatchObject({sourceId:f.v.toolId,snapshot:{product:entry,definition,compiledDefinition:definition,educationSource:{toolId:f.v.toolId,versionId:f.v.id,organizationId:f.v.organizationId,contentHash:f.v.contentHash}}})
  expect(f.release.provenance).toEqual(original)
  expect(m.authorize).toHaveBeenCalledWith(f.tx,{principal:{userId:f.v.ownerUserId,accountDomain:'SCHOOL'},entry,organizationId:f.v.organizationId})
 })
 it('rejects absent/wrong-owner/wrong-entry/FORM scoped source before identity read',async()=>{
  const f=fixture();f.findFirst.mockResolvedValue(null)
  await expect(educationSubmissionSource(f.tx,f.v.ownerUserId,'SCHOOL',f.release)).rejects.toMatchObject({statusCode:403})
  expect(f.findFirst).toHaveBeenCalledWith({where:{id:f.v.id,ownerUserId:f.v.ownerUserId,entry:'SCHOOL',kind:'SCALE'}})
  expect(m.identity).not.toHaveBeenCalled()
 })
 it('rejects retired releases and provenance identity tampering',async()=>{
  for(const patch of [{status:'RETIRED'},{key:'forged'},{contentHash:'b'.repeat(64)},{sourceReleaseId:randomUUID()},{provenance:{...fixture().release.provenance,toolId:randomUUID()}}]){
   const f=fixture()
   await expect(educationSubmissionSource(f.tx,f.v.ownerUserId,'SCHOOL',{...f.release,...patch} as StoredRelease)).rejects.toThrow()
  }
 })
 it('requires current real education identity and current author capability',async()=>{
  const f=fixture();m.actor.mockResolvedValue({account_domain:'TRAINING'})
  await expect(educationSubmissionSource(f.tx,f.v.ownerUserId,'SCHOOL',f.release)).rejects.toMatchObject({statusCode:403})
  m.actor.mockResolvedValue({account_domain:'SCHOOL'});m.authorize.mockRejectedValue(new Error('revoked'))
  await expect(educationSubmissionSource(f.tx,f.v.ownerUserId,'SCHOOL',f.release)).rejects.toThrow('revoked')
 })
 it('catalog projections never expose exact attachment manifests or authored content, while protected submission views preserve consent identity',()=>{
  const manifest={schemaVersion:1 as const,manifestHash:'c'.repeat(64),releaseIds:[randomUUID()],items:[{assetId:randomUUID(),
   contentHash:'d'.repeat(64),mimeType:'image/png',sizeBytes:42,assetVersion:'2026-10-22T00:00:00.000Z',
   usages:['compiledDefinition.report.rawScoreFeedback.rules.0.ranges.0.images.0.asset'],
   rights:'AUTHOR_SHARED_FOR_BOUND_SCALE' as const,dependencyReleaseIds:[]}]}
  for(const product of ['TRAINING','SURVEY','SCHOOL','TEACHER'] as const){
   const application={id:randomUUID(),release_id:manifest.releaseIds[0],product,source_id:version.toolId,author_id:version.ownerUserId,
    metadata:{title:'Synthetic'},dependency_release_ids:[],snapshot:{title:'Synthetic',product,instrumentClass:'CUSTOM_DESCRIPTIVE',
     definition,compiledDefinition:definition,mediaManifest:manifest},snapshot_hash:'e'.repeat(64),status:'APPROVED',version:2,
    reason:null,created_at:new Date(),updated_at:new Date()} as SubmissionRow
   const catalog=entryView({id:randomUUID(),submission_id:application.id,release_id:application.release_id,status:'ACTIVE',version:1,
    reason:null,created_at:new Date(),updated_at:new Date()},application)
   expect(catalog.mediaManifest).toBeUndefined()
   expect(catalog).not.toHaveProperty('snapshot')
   expect(JSON.stringify(catalog)).not.toContain('compiledDefinition')
   expect(JSON.stringify(catalog)).not.toContain(manifest.items[0].assetId)
   expect(submissionView(application).mediaManifest).toEqual(manifest)
   expect(application.snapshot.mediaManifest).toEqual(manifest)
  }
 })
 it('expands source products without expanding organization-free distribution',()=>{
  for(const product of ['SCHOOL','TEACHER']){
   expect(librarySourceProduct.safeParse(product).success).toBe(true)
   expect(legacyLibraryProduct.safeParse(product).success).toBe(false)
   expect(legacyDistributionInput.safeParse({requestId:randomUUID(),userId:randomUUID(),product}).success).toBe(false)
  }
 })
})
