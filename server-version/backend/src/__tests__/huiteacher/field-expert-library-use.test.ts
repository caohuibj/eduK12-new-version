import {afterEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {compileExpertSourceApplicability} from '../../modules/education-tools/expert-observation.contract'
import {prepareEducationLibraryResources} from '../../modules/scale-library-governance/education-runtime-resources'
import {prepareRelease} from '../../modules/measurement-content/release'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import * as authority from '../../modules/scale-library-governance/authority'
import * as collection from '../../modules/scale-library-governance/collection-guard'
import * as media from '../../modules/scale-library-governance/media'

const id=(n:number)=>`96000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const now=new Date('2026-10-29T11:00:00.000Z')
type Options={product?:'SCHOOL'|'TEACHER';respondentType?:string;targetKind?:'PERSON'|'TEAM';declared?:boolean;badContractHash?:boolean;
 approved?:boolean;issuerActive?:boolean;organizationActive?:boolean;releaseRetired?:boolean;stopped?:boolean;badMediaHash?:boolean}

/** Read-only storage doubles. The actual prepare helper, D/account authority,
 * organization/entitlement locks, exact release decoder, stop and media checks
 * execute unchanged. A preparation never issues a U in this test. */
function fixture(options:Options={}){
 const product=options.product??'TEACHER'
 const native=compileResearchScale('Synthetic expert-only source',{schemaVersion:1,respondentType:'teacher_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'no',label:'No',score:0},{optionKey:'yes',label:'Yes',score:1}],
  dimensions:[{dimensionKey:'observed',label:'Observed',direction:'descriptive'}],
  items:[{itemKey:'one',prompt:'Synthetic observation',required:true,reverse:false,dimensionKeys:['observed']}]})
 const definition={...native,respondentType:options.respondentType??'expert_report'}
 const expert=compileExpertSourceApplicability({schemaVersion:2,administrations:[{
  population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind:options.targetKind??'PERSON'}]})
 const prepared=prepareRelease(scaleMeasurementRelease({localId:'synthetic-expert-only',version:'synthetic-C-1',instrumentVersion:'1.0.0',definition,
  instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:id(4),resourceId:id(5)},presentationMode:'ONE_BY_ONE'}))
 const release={id:id(6),layer:prepared.layer,family:prepared.family,content_key:prepared.key,version:prepared.version,
  hash_scheme:prepared.hashScheme,content_hash:prepared.contentHash,content:prepared.content,scope:prepared.scope,provenance:prepared.provenance,
  asset_refs:prepared.assetRefs,source_release_id:prepared.sourceReleaseId,published_by:id(3),published_at:now,status:options.releaseRetired?'RETIRED':'PUBLISHED'}
 const mediaBody={schemaVersion:1 as const,releaseIds:[release.id],items:[]}
 const snapshot={title:'Synthetic approved expert-only source',product:'TRAINING',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,compiledDefinition:definition,
  mediaManifest:{...mediaBody,manifestHash:options.badMediaHash?'0'.repeat(64):canonicalHash(mediaBody)},
  ...(options.declared===false?{}:{educationExpertApplicability:expert.declaration,
   educationExpertApplicabilityHash:options.badContractHash?'0'.repeat(64):expert.contractHash,
   educationExpertApplicabilityCompilerVersion:expert.compilerVersion})}
 const entry={id:id(7),submission_id:id(8),release_id:release.id,status:'ACTIVE',version:1,release_version:release.version,content_hash:release.content_hash}
 const submission={id:id(8),author_id:id(4),snapshot,snapshot_hash:canonicalHash(snapshot),dependency_release_ids:[],status:options.approved===false?'SUBMITTED':'APPROVED'}
 const reads:Array<{sql:string;values:unknown[]}>=[]
 const forbiddenWrite=vi.fn(async()=>{throw Error('Expert-only U preparation must not write runtime resources')})
 const persistence={
  scale:{findUnique:vi.fn(async()=>{throw Error('Expert-only preparation must not look up a V1 wrapper')}),create:forbiddenWrite},
  compositeAssessment:{findUnique:vi.fn(async()=>{throw Error('Expert-only preparation must not look up a V1 parent')}),create:forbiddenWrite,update:forbiddenWrite},
  registeredAssessmentResource:{create:forbiddenWrite},storedAsset:{findMany:vi.fn(async()=>[])},
  $executeRaw:forbiddenWrite,
  $queryRaw:vi.fn(async(query:Prisma.Sql|TemplateStringsArray,...args:unknown[])=>{
   const preparedQuery=query as Prisma.Sql,sql=(Array.isArray(query)?query.join('?'):preparedQuery.sql).replace(/\s+/g,' ').trim()
   const values=Array.isArray(query)?args:[...preparedQuery.values];reads.push({sql,values})
   if(sql.includes("current_setting('transaction_isolation')"))return [{isolation:'read committed'}]
   if(sql.startsWith('SELECT release_id FROM scale_library_entries'))return [{release_id:release.id}]
   if(sql.includes('FROM users')&&sql.includes('platform_role::text'))return options.issuerActive===false?[]:[{
    id:id(3),platform_role:'SYSTEM_ADMIN',account_domain:'LEGACY',role:'ADMIN',teacher_approved:true,expires_at:null}]
   if(sql.includes('clock_timestamp() AS now'))return [{now}]
   if(sql.includes('FROM organizations'))return options.organizationActive===false?[]:[{id:id(1)}]
   if(sql.includes('FROM education_product_entitlements'))return [{organization_id:id(1)}]
   if(sql.includes('FROM scale_library_entries e JOIN measurement_content_releases'))return [entry]
   if(sql.includes('FROM scale_library_submissions'))return [submission]
   if(sql.startsWith('SELECT * FROM measurement_content_releases'))return [release]
   if(sql.includes('WITH RECURSIVE ancestors'))return [{id:release.id,truncated:false}]
   if(sql.startsWith('SELECT id FROM measurement_content_releases'))return [{id:release.id}]
   if(sql.includes('FROM scale_library_emergency_stops'))return options.stopped?[{target_id:release.id}]:[]
   if(sql.includes('FROM scale_library_media'))return []
   throw Error('Unexpected expert-only source query: '+sql)
  }),
 }
 return {tx:persistence as unknown as Prisma.TransactionClient,persistence,forbiddenWrite,reads,snapshot,release,submission,
  input:{actorId:id(3),organizationId:id(1),entryId:entry.id,product}}
}
function expectNoRuntimeWrites(h:ReturnType<typeof fixture>){
 expect(h.forbiddenWrite).not.toHaveBeenCalled()
 expect(h.persistence.scale.findUnique).not.toHaveBeenCalled()
 expect(h.persistence.compositeAssessment.findUnique).not.toHaveBeenCalled()
 expect(h.reads.some(row=>row.sql.includes('registered_assessment_resources'))).toBe(false)
}
afterEach(()=>vi.restoreAllMocks())

describe('Expert-only library U preparation retains source authority without a V1 runtime',()=>{
 it('prepares the exact Teacher expert/observer source after D, organization, stop and media checks, with no runtime writes',async()=>{
  const distribute=vi.spyOn(authority,'assertLibraryAuthority'),stop=vi.spyOn(collection,'assertScaleLibraryCollectionAllowed'),assets=vi.spyOn(media,'assertLibraryMediaReady')
  for(const respondentType of ['expert_report','observer_report']){
   const h=fixture({respondentType})
   expect(h.snapshot).not.toHaveProperty('educationApplicability')
   await expect(prepareEducationLibraryResources(h.tx,h.input)).resolves.toEqual({resources:[],authority:{grantId:null,version:0},submissionId:h.submission.id})
   expect(distribute).toHaveBeenLastCalledWith(h.tx,h.input.actorId,h.release.id,'material.distribute','TEACHER',undefined)
   expect(stop).toHaveBeenLastCalledWith(h.tx,[h.release.id])
   expect(assets).toHaveBeenLastCalledWith(h.tx,h.input.entryId,h.snapshot.mediaManifest)
   const issuer=h.reads.findIndex(row=>row.sql.includes('FROM users')),org=h.reads.findIndex(row=>row.sql.includes('FROM organizations'))
   expect(issuer).toBeGreaterThan(-1);expect(org).toBeGreaterThan(issuer)
   expect(h.reads.find(row=>row.sql.includes('FROM education_product_entitlements'))?.values).toContain('HUITEACHER')
   expectNoRuntimeWrites(h)
  }
  expect(distribute).toHaveBeenCalledTimes(2);expect(stop).toHaveBeenCalledTimes(2);expect(assets).toHaveBeenCalledTimes(2)
 })

 it('does not turn School, absent or invalid declarations, SELF native content or unapproved sources into expert-only preparation',async()=>{
  const cases:Array<{options:Options;message:string}>=[
   {options:{product:'SCHOOL'},message:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'},
   {options:{declared:false},message:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'},
   {options:{targetKind:'TEAM'},message:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'},
   {options:{respondentType:'teacher_self_report'},message:'EDUCATION_LIBRARY_APPLICABILITY_REQUIRED'},
   {options:{badContractHash:true},message:'EDUCATION_EXPERT_APPLICABILITY_FROZEN_CONTRACT_MISMATCH'},
   {options:{approved:false},message:'EDUCATION_LIBRARY_ENTRY_UNAVAILABLE'},
  ]
  for(const {options,message} of cases){
   const h=fixture(options)
   await expect(prepareEducationLibraryResources(h.tx,h.input),JSON.stringify(options)).rejects.toThrow(message)
   expectNoRuntimeWrites(h)
  }
 })

 it('cannot bypass original D, current organization, exact published release, emergency stop or frozen media checks',async()=>{
  const cases:Array<{options:Options;message:string}>=[
   {options:{issuerActive:false},message:'账号不可用'},
   {options:{organizationActive:false},message:'EDUCATION_LIBRARY_ORGANIZATION_UNAVAILABLE'},
   {options:{releaseRetired:true},message:'EDUCATION_LIBRARY_RELEASE_UNAVAILABLE'},
   {options:{stopped:true},message:'紧急停用'},
   {options:{badMediaHash:true},message:'SCALE_LIBRARY_MEDIA_MANIFEST_MISMATCH'},
  ]
  for(const {options,message} of cases){
   const h=fixture(options)
   await expect(prepareEducationLibraryResources(h.tx,h.input),JSON.stringify(options)).rejects.toThrow(message)
   expectNoRuntimeWrites(h)
  }
 })
})
