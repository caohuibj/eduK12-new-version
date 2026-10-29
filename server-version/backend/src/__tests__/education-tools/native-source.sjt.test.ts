import {afterEach,describe,expect,it,vi} from 'vitest'
import {Prisma} from '@prisma/client'
import onlineExample from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import {compileSjtAuthorDocument} from '../../modules/situational/authoring/dispatcher'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ASSESSMENT_OPERATIONAL_HOLDS,operationalIdentityKey} from '../../modules/assessment-governance/operational-hold'
import {prepareRelease,type PreparedRelease} from '../../modules/measurement-content/release'
import {sjtMeasurementRelease} from '../../modules/measurement-content/sjt'
import {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES} from '../../modules/situational/onboarding/instruments.generated'
import {createSituationalInstrumentRegistry} from '../../modules/situational/onboarding/instrument-registry'
import {publicationContentDigest} from '../../modules/situational/onboarding/schema'
import {readEducationSjtSourceIdentities,readEducationSjtSources} from '../../modules/education-tools/native-source.sjt'

vi.mock('../../config/database',()=>({prisma:{}}))

const authorId='11111111-1111-4111-8111-111111111111',staticId='22222222-2222-4222-8222-222222222222'
const authorMeasurementId='33333333-3333-4333-8333-333333333333',staticMeasurementId='44444444-4444-4444-8444-444444444444'
const deployment={locale:'zh-CN',territory:'CN'},now=new Date('2026-10-29T12:00:00.000Z')
const installed=createSituationalInstrumentRegistry(GENERATED_SITUATIONAL_INSTRUMENT_SOURCES).sources[0]
const sql=(query:any)=>(query.strings??query).join(' ')
const selection=(id:string,contentHash:string)=>({provider:'SJT_RELEASE' as const,kind:'SJT' as const,versionId:id,contentHash})
function stored(id:string,value:PreparedRelease){return {id,layer:value.layer,family:value.family,content_key:value.key,version:value.version,
 hash_scheme:value.hashScheme,content_hash:value.contentHash,content:value.content,provenance:value.provenance,scope:value.scope,
 asset_refs:value.assetRefs,source_release_id:value.sourceReleaseId,published_by:'original-reviewer',published_at:now,status:'PUBLISHED'}}
function authorFixture(respondentType='student_self_report',rights:Record<string,string>={}){
 const template={...onlineExample,instrumentKey:'education-native-sjt-synthetic',display:{...onlineExample.display,respondentType,...rights}}
 const compiled=compileSjtAuthorDocument(template)
 const author={id:authorId,measurementReleaseId:authorMeasurementId,sourceDraftId:'synthetic-draft',instrumentKey:compiled.package.key,
  instrumentVersion:compiled.package.instrumentVersion,contentDigest:compiled.contentDigest,definitionHash:compiled.definitionHash,
  package:{...compiled.package,releaseStatus:'PUBLISHED'},status:'PUBLISHED',authorizationPolicy:'COURSE_GRANT_V1',authorId:'original-author'}
 const draft={id:author.sourceDraftId,ownerId:author.authorId,status:'PUBLISHED',contentDigest:compiled.contentDigest,
  authorizationPolicy:author.authorizationPolicy,adaptationSource:null,template}
 const measurement=stored(authorMeasurementId,prepareRelease(sjtMeasurementRelease({localId:author.instrumentKey,version:author.instrumentVersion,
  instrumentVersion:author.instrumentVersion,definition:compiled.package.definition,onlineProtocol:compiled.package.online,
  scope:{kind:'PLATFORM',ownerId:author.authorId},provenance:{authorReleaseId:authorId,adaptationSource:null}})))
 return {author,draft,measurement,compiled}
}
function staticFixture(){
 const identity=installed.content.identity,mapping={id:staticId,instrument_key:identity.instrumentKey,instrument_version:identity.instrumentVersion,
  content_digest:publicationContentDigest(installed.content),measurement_release_id:staticMeasurementId,deployment,deployment_hash:canonicalHash(deployment)}
 const input=sjtMeasurementRelease({localId:identity.instrumentKey,version:'registry-v1',instrumentVersion:identity.instrumentVersion,
  definition:installed.content.definition,scope:{kind:'PLATFORM'},provenance:{sourceKind:'STATIC_SJT_REGISTRY',mappingId:staticId,
   contentDigest:mapping.content_digest,instrumentKey:identity.instrumentKey,instrumentVersion:identity.instrumentVersion}})
 if(input.layer!=='MEASUREMENT')throw new Error('Synthetic measurement fixture has wrong layer')
 input.version='registry-v1:'+input.content.measurementHash
 return {mapping,measurement:stored(staticMeasurementId,prepareRelease(input))}
}
function database(author:ReturnType<typeof authorFixture>|null=null,registry:ReturnType<typeof staticFixture>|null=null){
 const db={$queryRaw:vi.fn(),$executeRaw:vi.fn(),sjtAuthorRelease:{findUnique:vi.fn()},sjtAuthorDraft:{findUnique:vi.fn()}}
 db.sjtAuthorRelease.findUnique.mockImplementation(async({where}:any)=>{
  if(!author)return null
  return where.id?where.id===author.author.id?author.author:null:
   where.instrumentKey_instrumentVersion?.instrumentKey===author.author.instrumentKey
    &&where.instrumentKey_instrumentVersion?.instrumentVersion===author.author.instrumentVersion?author.author:null
 })
 db.sjtAuthorDraft.findUnique.mockImplementation(async({where}:any)=>author&&author.draft.id===where.id?author.draft:null)
 db.$executeRaw.mockImplementation(async(query:any)=>{
  if(!sql(query).includes('SELECT pg_advisory_xact_lock_shared'))throw new Error('Unexpected write: '+sql(query))
  return 1
 })
 db.$queryRaw.mockImplementation(async(query:any)=>{
  const text=sql(query),values=query.values as unknown[]
  if(text.includes('UNION ALL')){
   const ids=values.flat() as string[]
   return [
    ...(author&&ids.includes(author.author.id)?[{id:author.author.id,kind:'SJT_AUTHOR_RELEASE',instrumentKey:author.author.instrumentKey,
     instrumentVersion:author.author.instrumentVersion,measurementReleaseId:author.author.measurementReleaseId,ownerId:author.author.authorId}]:[]),
    ...(registry&&ids.includes(registry.mapping.id)?[{id:registry.mapping.id,kind:'STATIC_SJT_REGISTRY',instrumentKey:registry.mapping.instrument_key,
     instrumentVersion:registry.mapping.instrument_version,measurementReleaseId:registry.mapping.measurement_release_id,ownerId:null}]:[]),
   ]
  }
  if(text.includes("provenance ->> 'authorReleaseId'"))return author&&values.includes(author.measurement.id)?[{authorReleaseId:author.measurement.provenance.authorReleaseId}]:[]
  if(text.includes('FROM sjt_author_drafts'))return author&&values.includes(author.draft.id)?[{id:author.draft.id}]:[]
  if(text.includes('FROM sjt_author_releases'))return author&&values.includes(author.author.id)?[{id:author.author.id}]:[]
  if(text.includes('FROM static_sjt_measurement_mappings'))return registry&&values.includes(registry.mapping.instrument_key)&&values.includes(registry.mapping.instrument_version)?[registry.mapping]:[]
  if(text.includes('SELECT * FROM measurement_content_releases'))return [author?.measurement,registry?.measurement].filter(row=>row&&values.includes(row.id))
  throw new Error('Unexpected authority or persistence query: '+text)
 })
 return {db,tx:db as unknown as Prisma.TransactionClient}
}
const ownHoldKeys=new Set<string>()
afterEach(()=>{for(const key of ownHoldKeys)ASSESSMENT_OPERATIONAL_HOLDS.delete(key);ownHoldKeys.clear()})

describe('education exact native SJT original sources',()=>{
 it('freezes the original online author M without borrowing course grants, Survey D or a new owner',async()=>{
  const fixture=authorFixture(),{db,tx}=database(fixture),source=selection(authorId,fixture.measurement.content_hash)
  const result=await readEducationSjtSources(tx,[source,source],'SCHOOL'),leaf=result.get(authorId)!
  expect(result.size).toBe(1)
  expect(leaf).toMatchObject({id:authorId,title:fixture.compiled.package.definition.source.title,contentHash:source.contentHash,
   instrumentKey:fixture.author.instrumentKey,instrumentVersion:fixture.author.instrumentVersion,
   source:{kind:'SJT_AUTHOR_RELEASE',id:authorId,ownerId:'original-author'},
   measurement:{releaseId:authorMeasurementId,contentHash:source.contentHash,scope:{kind:'PLATFORM',ownerId:'original-author'}}})
  expect(leaf.resolved.situationPackage.online).toEqual(fixture.compiled.package.online)
  expect(leaf.measurement.content.executable.onlineProtocol).toBeTruthy()
  expect(leaf.measurement.content.measurementHash).not.toBe(fixture.author.contentDigest)
  const queries=db.$queryRaw.mock.calls.map(([query])=>sql(query))
  expect(queries.filter(query=>query.includes("provenance ->> 'authorReleaseId'"))).toHaveLength(1)
  expect(queries.join('\n')).not.toMatch(/sjt_release_grants|content_capability_grants|material_grants|courses|INSERT|UPDATE|DELETE/)
  expect(db.$executeRaw).not.toHaveBeenCalled()
  const draftLock=queries.findIndex(query=>query.includes('FROM sjt_author_drafts'))
  const authorLock=queries.findIndex(query=>query.includes('FROM sjt_author_releases')&&!query.includes('UNION ALL'))
  expect(draftLock).toBeLessThan(authorLock)
  expect(queries[draftLock]).toContain('FOR SHARE');expect(queries[authorLock]).toContain('FOR SHARE')
 })
 it('retains the native teacher-versus-student SELF boundary',async()=>{
  const student=authorFixture(),teacher=authorFixture('teacher_self_report')
  await expect(readEducationSjtSources(database(student).tx,[selection(authorId,student.measurement.content_hash)],'TEACHER'))
   .rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_SELF_SOURCE_REQUIRED',statusCode:403})
  const teacherSource=selection(authorId,teacher.measurement.content_hash)
  expect((await readEducationSjtSources(database(teacher).tx,[teacherSource],'TEACHER')).get(authorId)?.resolved.situationPackage.definition.respondentType).toBe('teacher_self_report')
  await expect(readEducationSjtSources(database(teacher).tx,[teacherSource],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_SELF_SOURCE_REQUIRED',statusCode:403})
 })
 it('uses the installed static mapping and published M verbatim, with no invented owner or rights grant',async()=>{
  const fixture=staticFixture(),{db,tx}=database(null,fixture),selected=selection(staticId,fixture.measurement.content_hash)
  const leaf=(await readEducationSjtSources(tx,[selected],'TEACHER')).get(staticId)!
  expect(leaf.source).toEqual({kind:'STATIC_SJT_REGISTRY',id:staticId,...installed.content.identity})
  expect(leaf.source).not.toHaveProperty('ownerId');expect(leaf.measurement.scope).not.toHaveProperty('ownerId')
  expect(leaf.measurement.contentHash).toBe(selected.contentHash)
  expect(leaf.resolved.situationPackage.definition).toEqual(installed.content.definition)
  expect(leaf.resolved.situationPackage.definition.license.redistribution).toBe('restricted')
  expect(db.$executeRaw.mock.calls).toHaveLength(1)
  expect(sql(db.$executeRaw.mock.calls[0][0])).toContain('SELECT pg_advisory_xact_lock_shared')
  expect(db.$queryRaw.mock.calls.some(([query])=>/grant|authorization|license|courses/i.test(sql(query)))).toBe(false)
 })
 it('discovers both real source kinds before locking without granting or mutating anything',async()=>{
  const author=authorFixture(),registry=staticFixture(),{db,tx}=database(author,registry)
  const result=await readEducationSjtSourceIdentities(tx,[selection(authorId,author.measurement.content_hash),selection(staticId,registry.measurement.content_hash)])
  expect(result).toEqual(expect.arrayContaining([
   {id:authorId,kind:'SJT_AUTHOR_RELEASE',instrumentKey:author.author.instrumentKey,instrumentVersion:author.author.instrumentVersion},
   {id:staticId,kind:'STATIC_SJT_REGISTRY',...installed.content.identity},
  ]))
  expect(result.map(row=>JSON.stringify([row.instrumentKey,row.instrumentVersion]))).toEqual(result.map(row=>JSON.stringify([row.instrumentKey,row.instrumentVersion])).sort((a,b)=>a.localeCompare(b)))
  expect(db.$executeRaw).not.toHaveBeenCalled();expect(db.sjtAuthorRelease.findUnique).not.toHaveBeenCalled()
  expect(db.$queryRaw.mock.calls).toHaveLength(1);expect(sql(db.$queryRaw.mock.calls[0][0])).not.toContain('FOR SHARE')
 })
 it('rejects a source digest or another M hash instead of substituting a selected exact M',async()=>{
  const author=authorFixture(),registry=staticFixture()
  await expect(readEducationSjtSources(database(author).tx,[selection(authorId,author.author.contentDigest)],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_NATIVE_MISMATCH'})
  await expect(readEducationSjtSources(database(null,registry).tx,[selection(staticId,'f'.repeat(64))],'TEACHER')).rejects.toMatchObject({code:'EDUCATION_SJT_NATIVE_MISMATCH'})
 })
 it('reuses original publication and immutable-template checks before admitting an author source',async()=>{
  const retired=authorFixture();retired.author.status='RETIRED'
  await expect(readEducationSjtSources(database(retired).tx,[selection(authorId,retired.measurement.content_hash)],'SCHOOL')).rejects.toMatchObject({code:'SOURCE_SJT_ENTRY_SOURCE_INVALID',statusCode:403})
  const changed=authorFixture();changed.draft.template={...changed.draft.template,title:'changed original'}
  await expect(readEducationSjtSources(database(changed).tx,[selection(authorId,changed.measurement.content_hash)],'SCHOOL')).rejects.toMatchObject({code:'SOURCE_SJT_ENTRY_SOURCE_INVALID',statusCode:403})
 })
 it('retains the existing known-rights restriction without inventing a native license or opening unknown rights',async()=>{
  const unknown=authorFixture('student_self_report',{licenseStatus:'unknown'})
  await expect(readEducationSjtSources(database(unknown).tx,[selection(authorId,unknown.measurement.content_hash)],'SCHOOL'))
   .rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_SOURCE_RIGHTS_UNKNOWN',statusCode:403})
 })
 it('checks static deployment and installed content digests without publishing a replacement',async()=>{
  const stale=staticFixture();stale.mapping.content_digest='f'.repeat(64)
  await expect(readEducationSjtSources(database(null,stale).tx,[selection(staticId,stale.measurement.content_hash)],'TEACHER')).rejects.toThrow('CONTENT_STATIC_SJT_SOURCE_CHANGED')
  const deploymentChanged=staticFixture();deploymentChanged.mapping.deployment_hash='e'.repeat(64)
  await expect(readEducationSjtSources(database(null,deploymentChanged).tx,[selection(staticId,deploymentChanged.measurement.content_hash)],'TEACHER')).rejects.toThrow('CONTENT_STATIC_SJT_DEPLOYMENT_INVALID')
 })
 it('honors the exact native operational hold rather than selecting an older release',async()=>{
  const fixture=authorFixture(),identity={family:'SITUATIONAL' as const,key:fixture.author.instrumentKey,version:fixture.author.instrumentVersion},key=operationalIdentityKey(identity)
  ASSESSMENT_OPERATIONAL_HOLDS.set(key,{...identity,reasonCode:'SYNTHETIC_TEST',effectiveAt:now.toISOString()});ownHoldKeys.add(key)
  await expect(readEducationSjtSources(database(fixture).tx,[selection(authorId,fixture.measurement.content_hash)],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_ASSESSMENT_SJT_SOURCE_REQUIRED'})
 })
 it('fails closed for absent M, absent native UUID and an ambiguous author/static UUID',async()=>{
  const missing=authorFixture();(missing.author as any).measurementReleaseId=null
  await expect(readEducationSjtSources(database(missing).tx,[selection(authorId,missing.measurement.content_hash)],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_SOURCE_UNAVAILABLE',statusCode:404})
  await expect(readEducationSjtSources(database().tx,[selection(authorId,'a'.repeat(64))],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_SOURCE_UNAVAILABLE',statusCode:404})
  const author=authorFixture(),registry=staticFixture();registry.mapping.id=authorId
  await expect(readEducationSjtSources(database(author,registry).tx,[selection(authorId,author.measurement.content_hash)],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_SOURCE_UNAVAILABLE',statusCode:404})
 })
 it('bounds and validates exact selections before doing source or permission work',async()=>{
  const {db,tx}=database(),source=selection(authorId,'a'.repeat(64))
  await expect(readEducationSjtSources(tx,[],'SCHOOL')).resolves.toEqual(new Map())
  await expect(readEducationSjtSources(tx,[source,{...source,contentHash:'b'.repeat(64)}],'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_SOURCE_CONFLICT'})
  await expect(readEducationSjtSources(tx,Array.from({length:51},()=>source),'SCHOOL')).rejects.toMatchObject({code:'EDUCATION_SJT_SOURCE_LIMIT',statusCode:400})
  await expect(readEducationSjtSources(tx,[{...source,versionId:'not-a-uuid'}],'SCHOOL')).rejects.toThrow()
  expect(db.$queryRaw).not.toHaveBeenCalled();expect(db.$executeRaw).not.toHaveBeenCalled()
 })
})
