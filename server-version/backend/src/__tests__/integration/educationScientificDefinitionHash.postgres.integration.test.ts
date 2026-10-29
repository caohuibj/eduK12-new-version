import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {prisma as db} from '../../config/database'
import {canonicalHash,canonicalJsonString} from '../../modules/assessment-runtime/canonical'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import {publishRegisteredScaleFixture} from './registered-resource-fixture'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {submit,review} from '../../modules/scale-library-governance/service'
import {grantEducationLibraryUseInTransaction} from '../../modules/scale-library-governance/education-distribution'
import * as tools from '../../modules/education-tools/private-tool.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
suite('Scientific source JSON / exact Node-PostgreSQL seal identity',()=>{
 beforeAll(()=>requireIsolatedReleaseDatabase(url!))
 afterAll(()=>db.$disconnect())
 it('matches canonicalJsonString bytes for fractions, signed values, exponent boundaries and actual JS numeric/UTF-16 key order without rounding',async()=>{
  const values=[0,-0,0.1,-0.5,0.1+0.2,1e-6,1e-7,1e20,1e21,1.0000000000000001e21,Number.MIN_VALUE,Number.MAX_VALUE,
   {map:{'10':0.25,'2':-0.5,'01':1e-7,'4294967294':1e21,'4294967295':1e-6,'😀':'汉字\n"quoted"','\uE000':true},array:[null,false,-0.25]}]
  const rows=await db.$queryRaw<Array<{ordinal:bigint;encoded:string;hash:string}>>(Prisma.sql`SELECT ordinal,
   education_scientific_definition_json(value) AS encoded,education_scientific_definition_hash(value) AS hash
   FROM jsonb_array_elements(${JSON.stringify(values)}::jsonb) WITH ORDINALITY samples(value,ordinal) ORDER BY ordinal`)
  expect(rows).toHaveLength(values.length)
  for(const [index,row] of rows.entries()){
   expect(row.encoded,String(values[index])).toBe(canonicalJsonString(values[index]))
   expect(row.hash).toBe(canonicalHash(values[index]))
  }
 })
 it('freezes an actually published, approved and granted Library Scale with a legal negative fractional score and preserves its exact C/R',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  const definition=structuredClone(f.definition)
  definition.responseSets[0].options[0].score=-0.5
  definition.report.rawScoreFeedback!.rules[0].ranges[0].min=-0.5
  const scale=await db.scale.create({data:{code:'scientific_fraction_'+randomUUID(),name:'Exact fractional library source',creatorId:f.authorUserId,
   status:'PUBLISHED',instrumentClass:'CUSTOM_DESCRIPTIVE',definition,definitionHash:hashScaleDefinition(definition)}})
  const measurement=await publishRegisteredScaleFixture(db,scale.id)
  const application=await submit(f.authorUserId,'TRAINING',{requestId:randomUUID(),releaseId:measurement.releaseId,
   metadata:{title:scale.name,author:'Synthetic author',copyright:'Self authored',applicability:'Synthetic isolated SELF',scoringDescription:'Exact -0.5 option',reportDescription:'Exact native feedback'},
   educationApplicability:{schemaVersion:1,administrations:[{population:'TEACHER',responseMode:'SELF'}]}})
  const approved=await review(f.libraryAdminUserId,application.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Synthetic exact fractional approval'})
  const entryId=approved.entryId!
  await db.$transaction(tx=>grantEducationLibraryUseInTransaction(tx,f.libraryAdminUserId,entryId,{requestId:randomUUID(),product:'TEACHER',organizationId:f.organizationId,scopeKind:'ORGANIZATION',userId:null}))
  const [source]=await db.$queryRaw<Array<{hash:string}>>`SELECT s.snapshot_hash AS hash FROM scale_library_entries e JOIN scale_library_submissions s ON s.id=e.submission_id WHERE e.id=${entryId}`
  const context={entry:'TEACHER' as const,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const draft=await tools.createPrivateTool(context,{kind:'COMPOSITION',title:'Exact scientific source'})
  const saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition:{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'SELF'},instruction:'',
   blocks:[0,1].map(()=>({blockId:randomUUID(),instruction:'',source:{provider:'LIBRARY_SCALE',kind:'SCALE',versionId:entryId,contentHash:source.hash}}))}})
  const fixed=await tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  if(!('runtime'in fixed)||!fixed.runtime)throw new Error('Missing actual sealed source')
  const parent=await db.compositeAssessment.findUniqueOrThrow({where:{id:fixed.runtime.compositeId}}),snapshot=parent.trainingContentSnapshot as any
  expect(snapshot.units).toHaveLength(2)
  expect(snapshot.units[0].source.educationLibrary.nativeDefinitionHash).toBe(canonicalHash(definition))
  const actual=await db.scale.findUniqueOrThrow({where:{id:snapshot.units[0].source.id}})
  expect(actual.definition).toEqual(definition)
  expect((actual.definition as any).responseSets[0].options[0].score).toBe(-0.5)
  expect((actual.definition as any).report.rawScoreFeedback.rules[0].ranges[0].min).toBe(-0.5)
 },60000)
})
