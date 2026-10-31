import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupTeacherCompositionExecution} from './educationPrivateCompositionExecutionFixture'
import {readPrivateTool,listPrivateToolVersions,listPrivateTools} from '../../modules/education-tools/private-tool.service'
import {readHuiteacherEventRun} from '../../modules/huiteacher/evaluation.service'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient
suite('ordinary questionnaire editor immutable metadata / real PostgreSQL',()=>{
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!)
  process.env.DATA_ENCRYPTION_KEY||='55'.repeat(32);process.env.DATA_PSEUDONYM_KEY||='56'.repeat(32);process.env.CAMPUS_ELIGIBILITY_HMAC_KEY||='57'.repeat(32)
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('reopens fixed source titles and Run metadata without including question bodies or frozen report policies',async()=>{
  // Author/freeze/publish is fixture setup; no START, answers, FINAL or scoring is run here.
  const f=await setupTeacherCompositionExecution(db),root=await readPrivateTool(f.context,f.fixed.toolId)
  expect(root).toHaveProperty('references');if(!('references' in root))throw new Error('missing immutable reference summaries')
  expect(root.references).toHaveLength(3)
  for(const version of [f.visible,f.form,f.hidden]){
   const summary=root.references.find(row=>row.id===version.id)
   expect(summary).toEqual({id:version.id,toolId:version.toolId,kind:version.kind,title:version.title,sourceRevision:version.sourceRevision,contentHash:version.contentHash,
    sourceProvider:'PRIVATE_VERSION',...(version.kind==='SCALE'?{groupChoice:{versionId:version.id,contentHash:version.contentHash,title:version.title,
     minimumRespondents:10,metrics:[{key:'total',label:'total'}],audiences:{PROFESSIONAL:[],TEACHER:[],ORGANIZATION:['total']}}}:{})})
  }
  const versions=await listPrivateToolVersions(f.context,f.fixed.toolId),catalog=await listPrivateTools(f.context,undefined,'COMPOSITION')
  expect(versions.list[0]).toMatchObject({id:f.fixed.id,title:f.fixed.title,sourceRevision:f.fixed.sourceRevision,contentHash:f.fixed.contentHash})
  expect(versions.list[0]).not.toHaveProperty('definition');expect(catalog.list[0]).not.toHaveProperty('definition')
  const run=await readHuiteacherEventRun({organizationId:f.organizationId,eventId:f.workflow.id,actorUserId:f.managerUserId})
  expect(run.tracks).toHaveLength(1);expect(run.tracks[0]).toMatchObject({title:f.fixed.title,sourceRevision:f.fixed.sourceRevision,resourceFamily:'BUNDLE'})
  for(const field of ['definition','selectors','resourcePolicy','frozenResourcePolicy'])expect(run.tracks[0]).not.toHaveProperty(field)
  await expect(readPrivateTool({...f.context,principal:{userId:f.participantUserId,accountDomain:'SCHOOL'}},f.fixed.toolId))
   .rejects.toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED'})
 })
})
