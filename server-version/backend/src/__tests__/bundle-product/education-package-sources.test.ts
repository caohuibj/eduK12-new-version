import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {generatedPackages} from '../../modules/assessment-bundle/onboarding/catalog'
import {hashDeclarativePackage} from '../../modules/assessment-bundle/onboarding/contract'
import {educationPackageKey,educationPackageReferenceSchema,educationPackageSelectionSchema,parseEducationPackageKey,supportsGovernedPackageSelf} from '../../modules/education-tools/package-reference.contracts'
import {listEducationPackageSources} from '../../modules/education-tools/package-reference.catalog'
import {previewEducationWholePackage} from '../../modules/education-tools/package-reference.source'
import {readEducationPackageHeaders,type EducationPackageHeader} from '../../modules/education-tools/package-reference.headers'
import {adminContentRootRequestSchema} from '../../modules/measurement-content/admin-authority.service'

const m=vi.hoisted(()=>({transaction:vi.fn(),author:vi.fn(),nativeAdmission:vi.fn(),governedOnline:vi.fn(),governedDependencies:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/education-tools/private-tool.access',()=>({authorizePrivateTool:m.author}))
vi.mock('../../modules/bundle-product/package-release',()=>({assertPackageAdmission:m.nativeAdmission}))
vi.mock('../../modules/survey/governed-tool.service',()=>({assertGovernedOnline:m.governedOnline,assertGovernedDependencies:m.governedDependencies}))
const id=(n:number)=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const pack=generatedPackages()[0],hash=hashDeclarativePackage(pack)
const source={provider:'NATIVE_RELEASE' as const,versionId:id(3),contentHash:hash},key=educationPackageKey(source)
const header:EducationPackageHeader={key,provider:source.provider,id:source.versionId,hash,title:pack.manifest.definition.name,
 toolKey:pack.manifest.definition.bundleKey,toolVersion:pack.manifest.definition.bundleVersion,family:'NATIVE_BUNDLE',memberCount:pack.manifest.definition.slots.length,
 reportVersion:pack.report.version,educationApplicability:null,nativeRespondentTypes:['SELF'],nativeInitiationModes:['TEACHER_ASSIGNMENT'],population:pack.manifest.definition.population}
const grant=()=>({id:id(4),subject_id:context.principal.userId,issuer_id:id(5),product:context.entry,scope_id:context.organizationId,resource_keys:[key],
 valid_from:new Date('2026-01-01Z'),expires_at:new Date('2099-01-01Z'),read_at:new Date('2026-10-29Z'),version:1,revoked_at:null,parent_grant_id:null,ancestry:[id(4)],
 capabilities:['material.use'],delegable_capabilities:[],remaining_delegation_depth:0})
const database=()=>({$queryRaw:vi.fn(async(query:{sql:string})=>{
 if(query.sql.includes('WITH authorized_keys AS'))return [header]
 if(query.sql.includes('FROM content_capability_grants g WHERE'))return [grant()]
 if(query.sql.includes('FROM bundle_package_releases p WHERE'))return [header]
 throw new Error('Unexpected metadata query')
}),bundlePackageRelease:{findUnique:vi.fn(async()=>({id:source.versionId,status:'PUBLISHED',contentHash:hash,content:pack}))}})
beforeEach(()=>{vi.resetAllMocks();m.nativeAdmission.mockResolvedValue({id:source.versionId,contentHash:hash})})
afterEach(()=>vi.unstubAllEnvs())
describe('exact whole package source authority and metadata',()=>{
 it('round trips all three exact package source protocols and rejects aliases/wildcards/leaf U',()=>{
  for(const ref of [source,{provider:'GOVERNED_PACKAGE',versionId:id(6),contentHash:hash},
   {provider:'CODE_BUNDLE',bundleKey:'published_example',bundleVersion:'1.0.0',contentHash:hash}] as const)
   expect(parseEducationPackageKey(educationPackageKey(ref))).toEqual(ref)
  for(const value of [key+':extra',key.replace(hash,'*'),key.replace('NATIVE_RELEASE','FORM'),key.replace(source.versionId,'latest'),
   'education-source:FORM:'+source.versionId+':'+hash])expect(parseEducationPackageKey(value)).toBeNull()
  expect(educationPackageReferenceSchema.safeParse({...source,items:[]}).success).toBe(false)
 })
 it.each(['items','overrides','flow','parameters','report','packages'])('rejects editable or mixed %s inputs before any source IO',async field=>{
  const input={sourceRef:source,[field]:[]}
  expect(educationPackageSelectionSchema.safeParse(input).success).toBe(false)
  await expect(previewEducationWholePackage(context,input)).rejects.toThrow()
  expect(m.transaction).not.toHaveBeenCalled()
 })
 it('accepts only exact nondelegable education root U for the whole package',()=>{
  const raw={requestId:id(10),expectedVersion:0,reason:'Exact whole package education use',grant:{subjectId:context.principal.userId,
   scope:{product:'SCHOOL',scopeKind:'ORGANIZATION',scopeId:context.organizationId,resourceKind:'material',resourceKeys:[key]},
   capabilities:['material.use'],delegableCapabilities:[],remainingDelegationDepth:0,validFrom:'2026-10-29T00:00:00Z',expiresAt:'2027-01-01T00:00:00Z'}}
  expect(adminContentRootRequestSchema.safeParse(raw).success).toBe(true)
  expect(adminContentRootRequestSchema.safeParse({...raw,grant:{...raw.grant,delegableCapabilities:['material.use'],remainingDelegationDepth:1}}).success).toBe(false)
  expect(adminContentRootRequestSchema.safeParse({...raw,grant:{...raw.grant,scope:{...raw.grant.scope,resourceKeys:[key.replace(hash,'*')]}}}).success).toBe(false)
 })
 it('requires the precise governed population/SELF declaration; missing metadata never widens applicability',()=>{
  for(const value of [null,undefined,{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]},
   {schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'PARENT_REPORT'}]}])expect(supportsGovernedPackageSelf(value,'SCHOOL')).toBe(false)
  expect(supportsGovernedPackageSelf({schemaVersion:1,administrations:[{population:'STUDENT',responseMode:'SELF'}]},'SCHOOL')).toBe(true)
 })
 it('lists bounded granted metadata after one current author check, without loading package bodies',async()=>{
  const tx=database();m.transaction.mockImplementation(work=>work(tx))
  const result=await listEducationPackageSources(context,{})
  expect(m.author).toHaveBeenCalledExactlyOnceWith(tx,context)
  expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
  expect(tx.bundlePackageRelease.findUnique).not.toHaveBeenCalled()
  expect(result.list[0]).toMatchObject({sourceRef:source,kind:'PACKAGE_REFERENCE',canEditOriginal:false,canSplit:false,canMix:false,memberCount:header.memberCount})
  expect(tx.$queryRaw.mock.calls[0][0].sql).toContain('LIMIT 41')
  expect(tx.$queryRaw.mock.calls[0][0].sql).toContain('g.remaining_delegation_depth=0')
 })
 it('does not materialize, publish or create an editable version during an exact native preview',async()=>{
  const tx=database();m.transaction.mockImplementation(work=>work(tx))
  const result=await previewEducationWholePackage(context,{sourceRef:source})
  expect(m.nativeAdmission).toHaveBeenCalledExactlyOnceWith(tx,pack)
  expect(result).toMatchObject({sourceRef:source,readOnly:true,protocol:'NATIVE_BUNDLE_V3'})
  if(result.protocol!=='NATIVE_BUNDLE_V3')throw new Error('Expected native protocol')
  expect(result.members.map(member=>member.slotKey)).toEqual(pack.manifest.definition.slots.map(slot=>slot.slotKey))
  expect(result.report.key).toBe(pack.report.key)
  expect(result.engine).toEqual(pack.manifest.definition.engine)
  expect(Object.keys(tx)).toEqual(['$queryRaw','bundlePackageRelease'])
 })
 it('requires current whole U before reading any source body or package review',async()=>{
  const tx=database();tx.$queryRaw.mockImplementation(async()=>[]);m.transaction.mockImplementation(work=>work(tx))
  await expect(previewEducationWholePackage(context,{sourceRef:source})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_USE_REQUIRED',statusCode:403})
  expect(tx.bundlePackageRelease.findUnique).not.toHaveBeenCalled();expect(m.nativeAdmission).not.toHaveBeenCalled()
 })
 it('refuses a different physical publication even when its content hash is identical',async()=>{
  const tx=database();m.transaction.mockImplementation(work=>work(tx))
  m.nativeAdmission.mockResolvedValue({id:id(99),contentHash:hash})
  await expect(previewEducationWholePackage(context,{sourceRef:source})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_SOURCE_CHANGED'})
 })
 it('rejects changed content and unpublished status even when metadata was previously discoverable',async()=>{
  const tx=database();m.transaction.mockImplementation(work=>work(tx))
  tx.bundlePackageRelease.findUnique.mockResolvedValueOnce({id:source.versionId,status:'DRAFT',contentHash:hash,content:pack})
  await expect(previewEducationWholePackage(context,{sourceRef:source})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_SOURCE_UNAVAILABLE'})
  const changed=structuredClone(pack);changed.report.states.missing='Different original source report'
  expect(canonicalHash(changed)).not.toBe(canonicalHash(pack))
  tx.bundlePackageRelease.findUnique.mockResolvedValueOnce({id:source.versionId,status:'PUBLISHED',contentHash:hash,content:changed})
  await expect(previewEducationWholePackage(context,{sourceRef:source})).rejects.toMatchObject({code:'EDUCATION_PACKAGE_SOURCE_CHANGED'})
  expect(m.nativeAdmission).not.toHaveBeenCalled()
 })
 it('keeps unpublished code packages unavailable without any database or fake publication',async()=>{
  const headers=await readEducationPackageHeaders({} as never,[{provider:'CODE_BUNDLE',bundleKey:'integrated_gonogo_adexi_adult_zh_cn_v1',bundleVersion:'1.0.0',contentHash:'a'.repeat(64)}])
  expect(headers.size).toBe(0)
 })
})
