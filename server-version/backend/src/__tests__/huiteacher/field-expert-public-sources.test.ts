import {afterEach,describe,expect,it,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {toolReference} from '../../modules/survey/tool-reference'
import {compilePrivateComposition} from '../../modules/education-tools/private-tool.composition-compiler'
import {privateToolContentHash} from '../../modules/education-tools/private-tool.definition'
import {privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {compileExpertSourceApplicability,readFrozenExpertApplicability} from '../../modules/education-tools/expert-observation.contract'
import {educationPublicSourceKey} from '../../modules/education-tools/public-source.identity'
import {compileStandardCombinationReport,standardAxisHashes,standardCombinationHash,standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {prepareRelease} from '../../modules/measurement-content/release'
import type {StoredRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {DISCLOSURE_PRESETS} from '../../modules/scale/policy/disclosure'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import * as scalePackages from '../../modules/scale/scale-package.registry'
import {combinationFixture} from '../measurement-content/standard-combination.fixture'

// Synthetic stored rows only. Real compiler, U/issuer checks, frozen declaration,
// C/P/R hashes, native definition and media validators execute without mocks.
// Only this synthetic STANDARD key has a test-local package lookup; actual
// instruments and their declarations are never changed or reinterpreted.
// No DB, instrument registration, approval, grants or publication are written.
const id=(n:number)=>`95000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context={entry:'TEACHER' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const instant=new Date('2026-10-29T10:00:00.000Z'),expiry=new Date('2099-01-01T00:00:00.000Z')
type Provider='PRIVATE_VERSION'|'STANDARD_SCALE'|'LIBRARY_SCALE'|'PUBLIC_FORM'
type Target='PERSON'|'TEAM'|'ORGANIZATION'|'ACTIVITY'|'ARTIFACT'|'PROJECT'
const external=['STANDARD_SCALE','LIBRARY_SCALE','PUBLIC_FORM'] as const
const declaration=(targetKind:Target='PERSON')=>({schemaVersion:2 as const,administrations:[{population:'TEACHER' as const,responseMode:'EXPERT_REPORT' as const,targetKind}]})
const legacySelf={schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]}
const form={schemaVersion:2,pages:[{pageKey:'page',title:'Synthetic page',questions:[{itemKey:'question',type:'SHORT_TEXT',prompt:'Observed evidence',required:false,options:[],rows:[]}]}]}
function scale(respondentType='expert_report'){
 const value=compileResearchScale('Synthetic expert observation',{schemaVersion:1,respondentType:'teacher_self_report',aggregation:'mean',
  responseOptions:[{optionKey:'low',label:'Low',score:0},{optionKey:'high',label:'High',score:2}],
  dimensions:[{dimensionKey:'observed',label:'Observed',direction:'descriptive'}],
  items:[{itemKey:'question',prompt:'Synthetic observable behavior',required:true,reverse:false,dimensionKeys:['observed']}]})
 value.respondentType=respondentType
 value.report.audienceContract={schemaVersion:1,respondent:'OBSERVER_REPORT',audience:'teacher',locale:'en'}
 value.report.reportVersion='synthetic-expert-R-7'
 return value
}
function stored(input:Parameters<typeof prepareRelease>[0],n:number):StoredRelease{
 return {...prepareRelease(input),releaseId:id(n),status:'PUBLISHED',publishedBy:id(3),publishedAt:instant}
}
const releaseRow=(release:StoredRelease)=>({id:release.releaseId,layer:release.layer,family:release.family,content_key:release.key,version:release.version,
 hash_scheme:release.hashScheme,content_hash:release.contentHash,content:release.content,scope:release.scope,provenance:release.provenance,
 asset_refs:release.assetRefs,source_release_id:release.sourceReleaseId,status:release.status,published_by:release.publishedBy,published_at:release.publishedAt})
type Options={declaration?:unknown;respondentType?:string;respondentTypes?:string[];frozenHash?:string;compilerVersion?:string;allowUse?:boolean}
function fixture(options:Options={}){
 const declared=Object.prototype.hasOwnProperty.call(options,'declaration')?options.declaration:declaration()
 const definition=scale(options.respondentType),title='Synthetic exact expert source'
 const privateVersion={id:id(10),toolId:id(11),entry:'TEACHER',organizationId:id(1),ownerUserId:id(2),kind:'SCALE',title,definition,
  contentHash:privateToolContentHash('SCALE',title,definition),sourceRevision:1,createdAt:instant}

 // Reuse the synthetic standard factory, never alter a registered instrument.
 const base=combinationFixture(),{report,referencePolicy,source:_source,license:_license,...content}=definition
 const applicability={schemaVersion:1,policyVersion:'synthetic-observer-C',respondentTypes:options.respondentTypes??['OBSERVER'],requiredContextKeys:[]}
 const metadata={applicability,disclosure:{schemaVersion:1,policyVersion:'synthetic-expert-disclosure',unknownAudience:'DENY',
  audiences:{respondent:DISCLOSURE_PRESETS.SCORES()}},...(declared===undefined?{}:{educationExpertApplicability:declared})}
 const reference=toolReference('SCALE','synthetic-expert-standard',metadata)
 const parts={
  CONTENT:{...base.row.snapshot.parts.CONTENT,payload:content,hash:canonicalHash(content),reference},
  PARAMETERS:{...base.row.snapshot.parts.PARAMETERS,payload:{referencePolicy,references:[]},hash:canonicalHash({referencePolicy,references:[]}),reference},
  REPORT:{...base.row.snapshot.parts.REPORT,version:'synthetic-R-7',payload:report,hash:canonicalHash(report),reference},
 }
 const combinationHash=standardCombinationHash('synthetic-expert-standard',standardAxisHashes(parts))
 const standard={...base.row,id:id(20),tool_key:'synthetic-expert-standard',approved_by:id(3),combination_hash:combinationHash,
  snapshot:{...base.row.snapshot,schemaVersion:1,title,toolKey:'synthetic-expert-standard',parts,definition,references:[],reference,
   template:compileStandardCombinationReport(title,definition,true).template,combinationHash,blockers:[]},measurement_release:null as {releaseId:string;contentHash:string}|null}
 const standardMeasurement=stored(standardCombinationMeasurementInput(standard),21)
 standard.measurement_release={releaseId:standardMeasurement.releaseId,contentHash:standardMeasurement.contentHash}
 const nativeScale={id:id(22),code:standard.tool_key,instrumentVersion:'1.0.0',instrumentClass:'STANDARD',status:'PUBLISHED',libraryEntryId:null,
  creatorId:id(3),measurementReleaseId:standardMeasurement.releaseId,definition,definitionHash:hashScaleDefinition(definition)}
 const originalPackage=scalePackages.getScalePackage
 vi.spyOn(scalePackages,'getScalePackage').mockImplementation((key,version)=>key===standard.tool_key&&version==='1.0.0'
  ?{key,instrumentVersion:version,definition,releaseStatus:'PUBLISHED',references:[],goldenCases:[]}:originalPackage(key,version))

 const libraryMeasurement=stored(scaleMeasurementRelease({localId:'synthetic-approved-library',version:'synthetic-C-3',instrumentVersion:'1.0.0',
  definition,instrumentClass:'CUSTOM_DESCRIPTIVE',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:id(4),resourceId:id(30)},presentationMode:'ONE_BY_ONE'}),31)
 const mediaBody={schemaVersion:1 as const,releaseIds:[libraryMeasurement.releaseId],items:[]}
 const librarySnapshot={title,product:'TRAINING',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,compiledDefinition:definition,
  mediaManifest:{...mediaBody,manifestHash:canonicalHash(mediaBody)},
  ...(declared===undefined?{}:{educationExpertApplicability:declared,
   educationExpertApplicabilityHash:options.frozenHash??canonicalHash({compilerVersion:'EDUCATION_EXPERT_APPLICABILITY_V2',declaration:declared}),
   educationExpertApplicabilityCompilerVersion:options.compilerVersion??'EDUCATION_EXPERT_APPLICABILITY_V2'})}
 const library={entryId:id(30),releaseId:libraryMeasurement.releaseId,authorId:id(4),snapshotHash:canonicalHash(librarySnapshot),snapshot:librarySnapshot,dependencyIds:[]}
 const publicSnapshot={family:'FORM',reference:toolReference('FORM','synthetic-expert-form',{annotations:{
  ...(declared===undefined?{}:{educationExpertApplicability:declared})}}),unit:{ref:{kind:'FORM'},title:'Synthetic public Form',
   instruction:'Exact public observation instructions',displayDefinition:form,compiledDefinition:form,provenance:{}}}
 const publicForm={id:id(40),title:'Synthetic public Form',snapshot_hash:canonicalHash(publicSnapshot),snapshot:publicSnapshot}
 const selections={
  PRIVATE_VERSION:{provider:'PRIVATE_VERSION' as const,kind:'SCALE' as const,versionId:privateVersion.id,contentHash:privateVersion.contentHash},
  STANDARD_SCALE:{provider:'STANDARD_SCALE' as const,kind:'SCALE' as const,versionId:standard.id,contentHash:standard.combination_hash},
  LIBRARY_SCALE:{provider:'LIBRARY_SCALE' as const,kind:'SCALE' as const,versionId:library.entryId,contentHash:library.snapshotHash},
  PUBLIC_FORM:{provider:'PUBLIC_FORM' as const,kind:'FORM' as const,versionId:publicForm.id,contentHash:publicForm.snapshot_hash},
 }
 const useKeys=[selections.STANDARD_SCALE,selections.PUBLIC_FORM].map(selected=>educationPublicSourceKey({kind:selected.provider==='PUBLIC_FORM'?'FORM':'STANDARD_SCALE',id:selected.versionId,hash:selected.contentHash}))
 const use={id:id(50),subject_id:context.principal.userId,issuer_id:id(3),product:context.entry,scope_id:context.organizationId,resource_keys:useKeys,
  valid_from:new Date('2020-01-01'),expires_at:expiry,read_at:instant,version:1,revoked_at:null,parent_grant_id:null,ancestry:[id(50)],
  capabilities:['material.use'],delegable_capabilities:[],remaining_delegation_depth:0}
 const libraryUse={id:id(51),entryId:library.entryId,releaseId:library.releaseId,issuerId:id(3),authorityGrantId:null,version:1,scopeKind:'USER'}
 const reads:Array<{sql:string;values:unknown[]}>=[]
 const tx={
  educationPrivateToolVersion:{findMany:vi.fn(async()=>[privateVersion])},scale:{findMany:vi.fn(async()=>[nativeScale])},
  storedAsset:{findMany:vi.fn(async()=>[])},assetReference:{findMany:vi.fn(async()=>[])},
  $queryRaw:vi.fn(async(query:Prisma.Sql|TemplateStringsArray,...args:unknown[])=>{
   const prepared=query as Prisma.Sql,sql=(Array.isArray(query)?query.join('?'):prepared.sql).replace(/\s+/g,' ').trim()
   const values=Array.isArray(query)?args:[...prepared.values];reads.push({sql,values})
   if(sql.includes('clock_timestamp() AS now'))return [{now:instant}]
   if(sql.includes('FROM content_capability_grants g')&&sql.includes('WHERE g.subject_id='))return options.allowUse===false?[]:[use]
   if(sql.includes('FROM scale_library_use_grants g'))return options.allowUse===false?[]:[libraryUse]
   if(sql.includes('FROM users')&&sql.includes('platform_role::text'))return [{id:id(3),platform_role:'SYSTEM_ADMIN',account_domain:'LEGACY',role:'ADMIN',teacher_approved:true,expires_at:null}]
   if(sql.includes('FROM scale_library_entries e JOIN scale_library_submissions s'))return [library]
   if(sql.includes('FROM scale_library_media'))return []
   if(sql.includes('FROM survey_standard_releases'))return [standard]
   if(sql.includes('FROM survey_governed_tools'))return [publicForm]
   if(sql.includes('FROM measurement_content_releases'))return [standardMeasurement,libraryMeasurement].filter(release=>values.includes(release.releaseId)).map(releaseRow)
   throw Error('Unexpected synthetic source query: '+sql)
  }),
 }
 const composition=(providers:Provider[],targetKind:Target='PERSON')=>({schemaVersion:2,adapterVersion:'2.0.0',
  administration:{population:'TEACHER',responseMode:'EXPERT_REPORT',targetKind},instruction:'Synthetic expert instructions',
  blocks:providers.map((provider,index)=>({blockId:id(70+index),instruction:'Keep exact source',source:{...selections[provider]}}))})
 return {tx:tx as unknown as Prisma.TransactionClient,reads,selections,composition,definition,privateVersion,standard,library,publicForm,publicUse:use,nativeScale,standardMeasurement,libraryMeasurement}
}

afterEach(()=>vi.restoreAllMocks())

describe('Teacher expert sources: explicit V2 declarations and independent exact U',()=>{
 it('compiles all four real adapters together and preserves exact source, C/P/R and original definitions',async()=>{
  const h=fixture(),raw=h.composition(['PRIVATE_VERSION','STANDARD_SCALE','LIBRARY_SCALE','PUBLIC_FORM']),before=structuredClone(raw)
  const compiled=await compilePrivateComposition(h.tx,context,raw)
  expect(compiled.definition).toEqual(before);expect(raw).toEqual(before);expect(compiled.leaves.size).toBe(4)
  for(const selected of Object.values(h.selections))expect(compiled.leaves.get(selected.provider+':'+selected.versionId)?.version).toMatchObject({id:selected.versionId,contentHash:selected.contentHash})
  const standard=compiled.leaves.get('STANDARD_SCALE:'+h.standard.id),library=compiled.leaves.get('LIBRARY_SCALE:'+h.library.entryId)
  expect(standard).toMatchObject({provider:'STANDARD_SCALE',definition:h.definition,standard:{measurement:h.standardMeasurement,
   descriptor:{parametersAxisHash:h.standard.snapshot.parts.PARAMETERS.hash,reportAxisHash:h.standard.snapshot.parts.REPORT.hash,
    reportAudience:'teacher',respondentDisclosure:DISCLOSURE_PRESETS.SCORES()}}})
  expect(library).toMatchObject({provider:'LIBRARY_SCALE',definition:h.definition,library:{measurement:h.libraryMeasurement,
   descriptor:{approvedSnapshotHash:h.library.snapshotHash,reportMode:'NATIVE'}}})
  expect(compiled.leaves.get('PRIVATE_VERSION:'+h.privateVersion.id)).toMatchObject({definition:{report:h.definition.report,scoring:h.definition.scoring}})
  expect(compiled.leaves.get('PUBLIC_FORM:'+h.publicForm.id)).toMatchObject({sourceInstruction:'Exact public observation instructions',form:{definition:form}})
  expect(compiled.publicUseExpiresAt).toEqual(expiry)
  const grantRead=h.reads.find(row=>row.sql.includes('FROM content_capability_grants g')&&row.sql.includes('WHERE g.subject_id='))!
  expect(grantRead.values).toEqual(expect.arrayContaining([context.principal.userId,'TEACHER',context.organizationId]))
  expect(grantRead.sql).toContain("g.capabilities=ARRAY['material.use']")
 })

 it.each(external.flatMap(provider=>[
  {provider,label:'absent',raw:undefined},{provider,label:'legacy SELF V1',raw:legacySelf},
  {provider,label:'expert response smuggled into V1',raw:{...declaration(),schemaVersion:1}},
  {provider,label:'another target',raw:declaration('TEAM')},
 ]))('rejects $provider with $label declaration, even with valid U',async({provider,raw,label})=>{
  const h=fixture({declaration:raw})
  const compiled=compilePrivateComposition(h.tx,context,h.composition([provider]))
  if(provider==='LIBRARY_SCALE'&&(label==='legacy SELF V1'||label==='expert response smuggled into V1'))
   await expect(compiled).rejects.toMatchObject({name:'ZodError'})
  else await expect(compiled).rejects.toMatchObject({code:provider==='STANDARD_SCALE'?'PUBLIC_STANDARD_EXPERT_DECLARATION_REQUIRED':
   provider==='LIBRARY_SCALE'?'LIBRARY_SOURCE_EXPERT_DECLARATION_REQUIRED':'PUBLIC_FORM_EXPERT_DECLARATION_REQUIRED'})
 })

 it.each(['STANDARD_SCALE','LIBRARY_SCALE'] as const)('does not reinterpret %s native SELF as an expert source',async provider=>{
  const h=fixture({respondentType:'participant_self_report'})
  await expect(compilePrivateComposition(h.tx,context,h.composition([provider]))).rejects.toMatchObject({code:provider==='STANDARD_SCALE'?'PUBLIC_STANDARD_EXPERT_DECLARATION_REQUIRED':'LIBRARY_SOURCE_EXPERT_DECLARATION_REQUIRED'})
 })

 it('requires the standard C applicability to permit native OBSERVER in addition to the expert declaration',async()=>{
  const h=fixture({respondentTypes:['SELF']})
  await expect(compilePrivateComposition(h.tx,context,h.composition(['STANDARD_SCALE']))).rejects.toMatchObject({code:'PUBLIC_STANDARD_VARIANT_UNSUPPORTED'})
 })

 it.each(external)('refuses %s when U is absent, before reading the source body',async provider=>{
  const h=fixture({allowUse:false})
  await expect(compilePrivateComposition(h.tx,context,h.composition([provider]))).rejects.toMatchObject({code:provider==='LIBRARY_SCALE'?'LIBRARY_SOURCE_USE_REQUIRED':'PUBLIC_SOURCE_USE_REQUIRED'})
  expect(h.reads.some(row=>row.sql.includes('FROM survey_standard_releases')||row.sql.includes('FROM survey_governed_tools')||row.sql.includes('FROM scale_library_entries e JOIN scale_library_submissions s'))).toBe(false)
 })

 it.each(external)('rejects a changed exact %s hash without using the available latest/source row',async provider=>{
  const h=fixture(),raw=h.composition([provider]);raw.blocks[0].source.contentHash='f'.repeat(64)
  // Give only this hypothetical selected version a synthetic U, so the real
  // source/hash check is reached rather than stopping at the independent U gate.
  if(provider!=='LIBRARY_SCALE')h.publicUse.resource_keys=[educationPublicSourceKey({kind:provider==='PUBLIC_FORM'?'FORM':'STANDARD_SCALE',
   id:raw.blocks[0].source.versionId,hash:raw.blocks[0].source.contentHash})]
  await expect(compilePrivateComposition(h.tx,context,raw)).rejects.toMatchObject({code:provider==='LIBRARY_SCALE'?'LIBRARY_SOURCE_UNAVAILABLE':provider==='PUBLIC_FORM'?'PUBLIC_FORM_SOURCE_UNAVAILABLE':'PUBLIC_STANDARD_SOURCE_UNAVAILABLE'})
 })

 it.each(['STANDARD_SCALE','LIBRARY_SCALE'] as const)('forbids %s for a non-PERSON target before any source reads',async provider=>{
  const h=fixture({declaration:declaration('TEAM')})
  await expect(compilePrivateComposition(h.tx,context,h.composition([provider],'TEAM'))).rejects.toMatchObject({code:'PRIVATE_COMPOSITION_EXPERT_PERSON_TARGET_REQUIRED'})
  expect(h.reads).toEqual([])
 })

 it('compiles a declared non-PERSON public Form without manufacturing a Scale or subject',async()=>{
  const h=fixture({declaration:declaration('TEAM')}),raw=h.composition(['PUBLIC_FORM'],'TEAM')
  const compiled=await compilePrivateComposition(h.tx,context,raw)
  expect(compiled.definition.administration).toEqual(raw.administration)
  expect([...compiled.leaves.values()].map(leaf=>leaf.kind)).toEqual(['FORM'])
  expect(compiled.definition).not.toHaveProperty('subjectUserId')
 })

 it.each(['expert_report','observer_report'])('accepts the explicitly declared %s native standard/shared source without rewriting it',async respondentType=>{
  const h=fixture({respondentType}),compiled=await compilePrivateComposition(h.tx,context,h.composition(['STANDARD_SCALE','LIBRARY_SCALE']))
  for(const leaf of compiled.leaves.values())if(leaf.kind==='SCALE')expect(leaf.definition).toEqual(h.definition)
 })
})

describe('Expert applicability is a separately frozen V2 contract',()=>{
 it('preserves an exact declaration/hash/compiler triplet and leaves old snapshots undeclared',()=>{
  const compiled=compileExpertSourceApplicability(declaration())
  expect(readFrozenExpertApplicability({})).toBeNull()
  expect(readFrozenExpertApplicability({educationExpertApplicability:compiled.declaration,
   educationExpertApplicabilityHash:compiled.contractHash,educationExpertApplicabilityCompilerVersion:compiled.compilerVersion})).toEqual(compiled)
 })
 it.each([{label:'hash',options:{frozenHash:'0'.repeat(64)}},{label:'compiler',options:{compilerVersion:'EDUCATION_APPLICABILITY_V1'}}])('rejects a shared snapshot with a substituted $label',async({options})=>{
  const h=fixture(options)
  await expect(compilePrivateComposition(h.tx,context,h.composition(['LIBRARY_SCALE']))).rejects.toThrow('EDUCATION_EXPERT_APPLICABILITY_FROZEN_CONTRACT_MISMATCH')
 })
 it('rejects duplicate targets, SELF declarations and an expert composition encoded as V1',()=>{
  expect(()=>compileExpertSourceApplicability({...declaration(),administrations:[...declaration().administrations,...declaration().administrations]})).toThrow()
  expect(()=>compileExpertSourceApplicability(legacySelf)).toThrow()
  const h=fixture()
  expect(privateCompositionDefinitionSchema.safeParse({...h.composition(['PUBLIC_FORM']),schemaVersion:1,adapterVersion:'1.0.0'}).success).toBe(false)
 })
})
