import {writeFile} from 'node:fs/promises'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {requireIsolatedReleaseDatabase} from '../integration/integration-env'
const suite=process.env.PRECISE_COGNITIVE_PROFILE_ARTIFACT==='1'?describe:describe.skip
suite('Cognitive profile content on a migrated local clone under actual runtime identity',()=>{
 let db:any,before:any,templates:any,actor:any,config:any,measurement:any,experience:any,research:any,first:any,second:any,ready=false
 const observations:any[]=[]
 beforeAll(async()=>{
  const url=process.env.PRECISE_COGNITIVE_PROFILE_DATABASE_URL;if(!url)throw Error('Explicit new local profile clone required')
  requireIsolatedReleaseDatabase(url);const parsed=new URL(url)
  if(process.env.NODE_ENV!=='test'||parsed.hostname!=='127.0.0.1'||parsed.port!=='55439'
   ||parsed.pathname!=='/precise_cognitive_profile_artifact_test_20261030'||parsed.username!=='precise_task1_runtime')throw Error('Exact isolated runtime identity required')
  db=(await import('../../config/database')).prisma
  expect(await db.$queryRaw`SELECT current_user,session_user`).toEqual([{current_user:'precise_task1_runtime',session_user:'precise_task1_runtime'}])
  const [{count}]=await db.$queryRaw`SELECT count(*)::int AS count FROM _prisma_migrations`;expect(count).toBe(256)
  if(await db.user.count()!==6||await db.materialGrant.count()!==4||await db.compositeAssessment.count()!==13||await db.cognitiveTestConfig.count()!==0)
   throw Error('Read retained outcome before retry; never reset or repeat source publication')
  actor=await db.user.findFirstOrThrow({where:{platformRole:'SYSTEM_ADMIN',isActive:true,isFrozen:false}})
  before={users:await db.user.findMany({orderBy:{id:'asc'}}),grants:await db.materialGrant.findMany({orderBy:{id:'asc'}}),
   tasks:await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}}),attempts:await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}})}
  templates=await db.$queryRaw`SELECT * FROM assessment_public_templates ORDER BY template_hash`
 },60000)
 afterAll(async()=>{
  await writeFile(process.env.PRECISE_COGNITIVE_PROFILE_EVIDENCE??'/tmp/cognitive-profile-artifact-postgres.json',JSON.stringify({productionAccessed:false,
   scope:'One registered main reaction source installed DRAFT and explicitly published on a new synthetic clone; content artifacts only, no profile grant or assignment/START.',
   observations,configId:config?.id,measurement,artifacts:ready?[first,second]:[]},null,2)+'\n')
  if(db){await(await import('../../config/queue')).closeQueues(true);await db.$disconnect()}
 })
 it('uses normal source installation/publication and appends two exact nonpersonal profile artifacts',async()=>{
  const {cognitiveSeeds}=await import('../../modules/cognitive/generated/seeds')
  const seed=cognitiveSeeds.find(row=>row.testType==='reaction'&&row.configVersion==='1.1.0'&&row.engineVersion==='1.0.0'&&row.scoringVersion==='1.1.0')
  if(!seed)throw Error('Exact committed main seed missing; no latest fallback')
  const {installCognitiveConfigs}=await import('../../modules/cognitive/onboarding/install')
  const installed=await installCognitiveConfigs(db,{schemaVersion:1,items:[{testType:seed.testType,configVersion:seed.configVersion,engineVersion:seed.engineVersion,scoringVersion:seed.scoringVersion}]},actor.id)
  expect(installed.hasBlocked).toBe(false);expect(installed.rows[0]).toMatchObject({action:'CREATED_DRAFT',status:'DRAFT'})
  config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:installed.rows[0].configId}});expect(config).toMatchObject({status:'DRAFT',accessPolicy:'GRANT'})
  observations.push({normalInstallCreatedDraft:true,source:{testType:config.testType,configVersion:config.configVersion,engineVersion:config.engineVersion,scoringVersion:config.scoringVersion}})
  const published=await(await import('../../modules/cognitive/release.service')).publishCognitiveConfig(config.id,actor.id)
  expect(published.status).toBe('PUBLISHED');config=await db.cognitiveTestConfig.findUniqueOrThrow({where:{id:config.id}})
  const release=await db.$transaction((tx:any)=>(import('../../modules/measurement-content/repository')).then(module=>module.getContentRelease(tx,config.measurementReleaseId)))
  expect(release).toMatchObject({family:'COGNITIVE',layer:'MEASUREMENT',status:'PUBLISHED',scope:{kind:'PLATFORM'}})
  measurement={releaseId:release.releaseId,contentHash:release.contentHash}
  const entry=(await import('../../modules/cognitive/cognitive.registry')).requireCognitiveRegistryEntry(config.testType,config.engineVersion,config.scoringVersion)
  const api=await import('../../modules/assessment-authorization/cognitive-profile-artifact')
  experience=api.buildCognitiveProfileArtifact({config,measurement,entry,profile:'experience'})
  research=api.buildCognitiveProfileArtifact({config,measurement,entry,profile:'research'})
  expect(experience.resolvedConfig.totalTrials).toBe(8);expect(research.resolvedConfig.totalTrials).toBe(60)
  expect(experience.identity.configId).toBe(research.identity.configId);expect(experience.identity.testType).toBe('reaction')
  first=await api.saveCognitiveProfileArtifact(experience);second=await api.saveCognitiveProfileArtifact(research)
  expect(first.artifactHash).not.toBe(second.artifactHash)
  expect(await api.saveCognitiveProfileArtifact(experience)).toEqual(first)
  expect(await db.$queryRaw`SELECT template_hash FROM assessment_public_templates WHERE template_kind='COGNITIVE_PROFILE_CONFIGURATION'`).toHaveLength(2)
  ready=true;observations.push({normalExplicitLocalPublication:true,sharedConfigId:config.id,distinctExactProfiles:2,artifactRetryAddsNoRow:true,
   profileTrials:{experience:8,research:60},noUserRightsGranted:true})
 },30000)
 it('reads exact encrypted definitions with a fresh store and preserves existing rows and append-only runtime boundaries',async()=>{
  if(!ready)throw Error('Prior content append incomplete; dependent writes forbidden')
  const {Prisma}=await import('@prisma/client'),{createPublicTemplateStore}=await import('../../modules/assessment-runtime/public-templates')
  let reads=0
  const store=createPublicTemplateStore({read:async hashes=>{reads++;return db.$queryRaw`SELECT template_hash AS "templateHash",template_kind AS "templateKind",plaintext_bytes AS "plaintextBytes",payload_encrypted AS "payloadEncrypted"
   FROM assessment_public_templates WHERE template_hash IN (${Prisma.join(hashes)})`},append:async()=>{throw Error('Readback cannot append')}})
  const {loadCognitiveProfileArtifact}=await import('../../modules/assessment-authorization/cognitive-profile-artifact')
  expect(await loadCognitiveProfileArtifact(first.artifactHash,experience.identity,store)).toEqual(experience)
  expect(await loadCognitiveProfileArtifact(second.artifactHash,research.identity,store)).toEqual(research)
  expect(reads).toBe(2)
  await expect(db.$executeRaw`UPDATE assessment_public_templates SET plaintext_bytes=plaintext_bytes WHERE template_hash=${first.artifactHash}`).rejects.toMatchObject({meta:{code:'55000'}})
  await expect(db.$executeRaw`DELETE FROM assessment_public_templates WHERE template_hash=${first.artifactHash}`).rejects.toMatchObject({meta:{code:'55000'}})
  expect(await db.user.findMany({orderBy:{id:'asc'}})).toEqual(before.users)
  expect(await db.materialGrant.findMany({orderBy:{id:'asc'}})).toEqual(before.grants)
  expect(await db.compositeAssessment.findMany({orderBy:{id:'asc'},include:{items:true}})).toEqual(before.tasks)
  expect(await db.compositeAssessmentAttempt.findMany({orderBy:{id:'asc'}})).toEqual(before.attempts)
  expect(await db.$queryRaw`SELECT * FROM assessment_public_templates WHERE template_kind<>'COGNITIVE_PROFILE_CONFIGURATION' ORDER BY template_hash`).toEqual(templates)
  observations.push({freshEncryptedProfileReads:2,actualRuntimeRole:true,immutableUpdateDeleteDenied55000:true,originalSixUsersFourGrantsThirteenTasksAndAttemptsUnchanged:true,
   originalPublicTemplatesUnchanged:true,noAssignmentOrSeedCreated:true})
 },20000)
})
