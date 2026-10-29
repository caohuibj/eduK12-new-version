import {beforeAll,describe,expect,it,vi} from 'vitest'
import type {Prisma,CognitiveTestConfig} from '@prisma/client'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {prepareRelease} from '../../modules/measurement-content/release'
import {readFrozenReport,hashResolvedConfig} from '../../modules/cognitive/profile-freeze'
import {readEducationCognitiveSources,assertEducationCognitiveOriginalUse} from '../../modules/education-tools/native-source.cognitive'
import {privateCompositionDefinitionSchema} from '../../modules/education-tools/private-tool.composition-contracts'
import {educationPublicSourceKey,parseEducationPublicSourceKey} from '../../modules/education-tools/public-source.identity'

const id=(n:number)=>`97100000-0000-4000-8000-${String(n).padStart(12,'0')}`
const context={entry:'SCHOOL' as const,organizationId:id(1),principal:{userId:id(2),accountDomain:'SCHOOL' as const}}
const base={totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,report:{reportVersion:'1.0.0',referenceMode:'none'}}
beforeAll(()=>{process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)})
function fixture(options:{accessPolicy?:'OPEN'|'GRANT';grant?:boolean;status?:'PUBLISHED'|'RETIRED';tamper?:boolean}={}){
 const original=prepareRelease(cognitiveMeasurementRelease({localId:'reaction',version:'native-exact-1',testType:'reaction',configVersion:'native-exact-1',engineVersion:'1.0.0',scoringVersion:'1.0.0',config:base,scope:{kind:'PLATFORM'}}))
 const config={id:id(10),testType:'reaction',configVersion:'native-exact-1',name:'Existing published reaction',instruction:'Native instruction',config:options.tamper?{...base,totalTrials:21}:base,
  status:options.status??'PUBLISHED',engineVersion:'1.0.0',scoringVersion:'1.0.0',accessPolicy:options.accessPolicy??'OPEN',measurementReleaseId:id(11)} as unknown as CognitiveTestConfig
 const row={id:id(11),layer:original.layer,family:original.family,content_key:original.key,version:original.version,hash_scheme:original.hashScheme,content_hash:original.contentHash,
  content:original.content,scope:original.scope,provenance:original.provenance,asset_refs:original.assetRefs,source_release_id:original.sourceReleaseId,status:'PUBLISHED',published_by:id(3),published_at:new Date()}
 const db={cognitiveTestConfig:{findMany:vi.fn(async()=>[config])},$queryRaw:vi.fn(async(query:Prisma.Sql)=>{
  const text=query.sql
  if(text.includes('FROM cognitive_test_configs'))return [{id:config.id,accessPolicy:config.accessPolicy}]
  if(text.includes('FROM material_grants'))return options.grant?[{resource_id:config.id}]:[]
  if(text.includes('FROM measurement_content_releases'))return [row]
  throw Error('Unexpected source or authority read '+text)
 })}
 return {db,tx:db as unknown as Prisma.TransactionClient,config,row,source:{provider:'COGNITIVE_CONFIG' as const,kind:'COGNITIVE' as const,versionId:config.id,contentHash:original.contentHash,profile:'experience' as const}}
}
describe('direct education native Cognitive config/profile',()=>{
 it.each([['experience',8],['standard',20],['research',60]] as const)('freezes actual %s config and report without a Training assignment',async(profile,trials)=>{
  const f=fixture(),source={...f.source,profile},result=await readEducationCognitiveSources(f.tx,context,[source,source]),leaf=result.get(source.versionId+':'+profile)!
  expect(result.size).toBe(1);expect(leaf.freeze.resolvedConfig).toMatchObject({totalTrials:trials});expect(leaf.descriptor.sourceMeasurementReleaseId).toBe(id(11))
  expect(leaf.descriptor).toMatchObject({sourceId:source.versionId,contentHash:source.contentHash,profile,resolvedConfigHash:hashResolvedConfig(leaf.freeze.resolvedConfig)})
  const report=readFrozenReport(leaf.freeze.resolvedReportSnapshotEncrypted)!
  expect(report.profile).toBe(profile);expect(leaf.descriptor.reportHash).toBe(canonicalHash(report));expect(report.participantPresentation).toBeDefined()
  expect(f.db.cognitiveTestConfig.findMany).toHaveBeenCalledTimes(1)
  expect(f.db.$queryRaw.mock.calls.map(([query])=>query.sql).join(' ')).not.toMatch(/course_students|cognitive_assignments|training_|survey_/)
 })
 it('keeps two explicit profiles of one config separate',async()=>{
  const f=fixture(),result=await readEducationCognitiveSources(f.tx,context,[f.source,{...f.source,profile:'research'}])
  expect(result.size).toBe(2);expect(new Set([...result.values()].map(leaf=>leaf.descriptor.resolvedConfigHash)).size).toBe(2)
 })
 it('never substitutes standard for a missing or unknown profile',async()=>{
  const f=fixture(),{profile:_profile,...missing}=f.source
  await expect(readEducationCognitiveSources(f.tx,context,[missing as typeof f.source])).rejects.toThrow()
  await expect(readEducationCognitiveSources(f.tx,context,[{...f.source,profile:'other'} as unknown as typeof f.source])).rejects.toThrow()
 })
 it.each([{status:'RETIRED' as const},{tamper:true}])('rejects a stopped or changed original instead of selecting latest',async options=>{
  const f=fixture(options);await expect(readEducationCognitiveSources(f.tx,context,[f.source])).rejects.toThrow()
 })
 it('requires the original GRANT independently from the new education U, including publication and START recheck',async()=>{
  const denied=fixture({accessPolicy:'GRANT'})
  await expect(readEducationCognitiveSources(denied.tx,context,[denied.source])).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_ORIGINAL_AUTHORITY_REQUIRED'})
  await expect(assertEducationCognitiveOriginalUse(denied.tx,context,[denied.source.versionId],true)).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_ORIGINAL_AUTHORITY_REQUIRED'})
  const allowed=fixture({accessPolicy:'GRANT',grant:true})
  expect((await readEducationCognitiveSources(allowed.tx,context,[allowed.source])).size).toBe(1)
  await assertEducationCognitiveOriginalUse(allowed.tx,context,[allowed.source.versionId],true)
 })
 it('rejects a wrong exact hash and roundtrips only exact non-wildcard native U keys',async()=>{
  const f=fixture();await expect(readEducationCognitiveSources(f.tx,context,[{...f.source,contentHash:'f'.repeat(64)}])).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_SOURCE_UNAVAILABLE'})
  for(const kind of ['COGNITIVE_CONFIG','SJT_RELEASE'] as const){const source={kind,id:f.source.versionId,hash:f.source.contentHash};expect(parseEducationPublicSourceKey(educationPublicSourceKey(source))).toEqual(source)}
  expect(parseEducationPublicSourceKey('education-source:COGNITIVE_CONFIG:*:'+f.source.contentHash)).toBeNull()
  await expect(readEducationCognitiveSources(f.tx,context,[f.source,{...f.source,contentHash:'f'.repeat(64)}])).rejects.toMatchObject({code:'EDUCATION_COGNITIVE_SOURCE_CONFLICT'})
 })
 it('rejects Cognitive and SJT proxy answering before native source reads',()=>{
  const f=fixture(),common={schemaVersion:1,adapterVersion:'1.0.0',instruction:'',blocks:[{blockId:id(15),instruction:'',source:f.source}]}
  for(const administration of [{population:'STUDENT',responseMode:'PARENT_REPORT'},{population:'STUDENT',responseMode:'TEACHER_REPORT'},{population:'TEACHER',responseMode:'STUDENT_REPORT'}])
   for(const source of [f.source,{provider:'SJT_RELEASE',kind:'SJT',versionId:id(17),contentHash:f.source.contentHash}])expect(privateCompositionDefinitionSchema.safeParse({...common,administration,blocks:[{...common.blocks[0],source}]}).success).toBe(false)
  expect(privateCompositionDefinitionSchema.safeParse({...common,administration:{population:'STUDENT',responseMode:'SELF'}}).success).toBe(true)
 })
})
