import {randomUUID,randomBytes} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {grantGovernedCatalogFixture} from '../fixtures/governed-catalog'
import {importCatalogDraft} from '../../modules/survey/builder.service'
import {freezeResearchWaveDraft} from '../../modules/survey/publication.service'
import {bindSurveyAttemptContent} from '../../modules/survey/content-binding.service'
import {hashResearchCredential} from '../../modules/survey/identity.service'
import {startSurveySituational,submitSurveySituationalFinal,readSurveySituational} from '../../modules/survey/situational-native.service'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {getSituationPackage} from '../../modules/situational/situation-package.registry'
import {hashSituationRuntimeDefinition} from '../../modules/situational/situation-runtime-definition'
import {createSjtNativeStagedFinalFixture} from '../fixtures/sjt-native-staged.fixture'
import {situationalLegacyFinalSubmitSchema} from '../../modules/situational/situational-final-submit.schema'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
// Test-only publication seam; no file or external review is promoted. Full native
// source/measurement/U/Run/FINAL/report contracts run against disposable PostgreSQL.
vi.mock('../../modules/situational/onboarding/instruments.generated',async original=>{
 const actual=await original<typeof import('../../modules/situational/onboarding/instruments.generated')>()
 const {publicationContentDigest,instrumentSourceSchema}=await import('../../modules/situational/onboarding/schema')
 return {GENERATED_SITUATIONAL_INSTRUMENT_SOURCES:actual.GENERATED_SITUATIONAL_INSTRUMENT_SOURCES.map(source=>instrumentSourceSchema.parse(source)).map(source=>source.content.identity.instrumentKey.startsWith('u4-cjx01-')?{...source,publication:{releaseStatus:'PUBLISHED',review:{kind:'github-review',reviewUrl:'https://github.com/caohuibj/eduK12-new-version/pull/0#pullrequestreview-0',contentDigest:publicationContentDigest(source.content)}}}:source)}
})

const url=integrationDatabaseUrl('U4_SJT_INTEGRATION_DATABASE_URL','SURVEY_NATIVE_SJT_TEST_DATABASE_URL'),suite=url?describe:describe.skip
suite('CJX01 native Survey real PostgreSQL receipt and parent FINAL',()=>{
 let db:PrismaClient,admin:string,owner:string,projectId:string,publicId:string,draftId:string,ordinal=0
 const pkg=getSituationPackage('u4-cjx01-sd','0.3.0')!
 beforeAll(async()=>{
  requireIsolatedReleaseDatabase(url!);vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64));vi.stubEnv('SURVEY_WORKSPACE_ENABLED','true');vi.stubEnv('SURVEY_PUBLICATION_ENABLED','true')
  db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'u4-sjt-admin-'+randomUUID(),passwordHash:'synthetic-only',platformRole:'SYSTEM_ADMIN',role:'ADMIN',accountDomain:'LEGACY'}})).id
  owner=(await db.user.create({data:{username:'u4-sjt-survey-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'SURVEY'}})).id
  const login='u4sjt_'+randomUUID().replace(/-/g,'').slice(0,20)
  await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
  await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
  await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
  const grant=await grantGovernedCatalogFixture(db,admin,owner,{kind:'SJT',sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion})
  projectId=randomUUID();publicId=randomUUID()
  await db.surveyProject.create({data:{id:projectId,publicId,ownerUserId:owner,title:'Synthetic CJX01 unscored',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED'}})
  draftId=(await importCatalogDraft(owner,projectId,grant.id,{requestId:randomUUID(),instrumentKey:'scenario',title:'Synthetic CJX01'})).id
 },120000)
 afterAll(async()=>{await db?.$disconnect();vi.unstubAllEnvs()})
 it.each(['COMPLETE','U','N'])('keeps %s as categorical response fact through native and parent FINAL',async kind=>{
  const waveId=randomUUID()
  await db.surveyWave.create({data:{id:waveId,projectId,ordinal:++ordinal,title:'Synthetic unscored wave',instrumentIds:[draftId],consentText:'Synthetic test only; no real participant data.'}})
  // No score-feedback selection exists for an unscored tool. Native receipt and
  // authorized researcher consumption still retain the saved narrative.
  const published=await freezeResearchWaveDraft({actorUserId:owner,projectId,waveId,revision:0})
  await db.surveyWave.update({where:{id:waveId},data:{status:'OPEN',opensAt:new Date(Date.now()-60000),closesAt:new Date(Date.now()+3600000),finishUntil:new Date(Date.now()+7200000)}})
  const attemptId=randomUUID(),accessCredential=randomBytes(32).toString('base64url')
  await db.$transaction(async tx=>{
   await tx.surveyWaveAttempt.create({data:{id:attemptId,projectId,waveId,status:'STARTED',sessionHash:hashResearchCredential(accessCredential)}})
   await tx.surveyConsent.create({data:{id:randomUUID(),projectId,waveId,attemptId,consentVersion:1,accepted:true}})
   await bindSurveyAttemptContent(tx,{projectId,waveId,attemptId,publicationId:published.publicationId,newAttempt:true})
  })
  const proof={publicId,attemptId,accessCredential},child=await startSurveySituational(proof,'scenario')
  const golden=pkg.goldenCases.find(g=>kind==='COMPLETE'?g.expected.unscored!.responseStatus==='COMPLETE':g.responses.at(-1)!.responseValue===kind)!
  const capture=createSjtNativeStagedFinalFixture(child.attempt.id,golden.name,{package:pkg,definitionHash:hashSituationRuntimeDefinition(pkg.definition)} as never)
  const payload=situationalLegacyFinalSubmitSchema.parse({...capture.finalInput,submissionId:randomUUID()})
  const accepted=await submitSurveySituationalFinal(proof,'scenario',child.attempt.id,payload)
  expect((await submitSurveySituationalFinal(proof,'scenario',child.attempt.id,payload)).receipt).toEqual(accepted.receipt)
  expect((await readSurveySituational(proof,'scenario',child.attempt.id)).receipt).toEqual(accepted.receipt)
  const finalInput={...proof,submissionId:randomUUID(),answers:{scenario:{}},situationalReferences:[accepted.receipt!]}
  expect((await submitResearchFinal(finalInput)).status).toBe('COMPLETED')
  expect((await submitResearchFinal(finalInput)).status).toBe('COMPLETED')
  const stored=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId}}),result=decryptUnifiedRuntimePayload<any>(stored.resultsCipher)
  expect(result.units[0].privateScoring).toMatchObject({mode:'UNSCORED',metrics:[],quality:{status:'unscored'},responseStatus:kind==='COMPLETE'?'COMPLETE':'NONANSWER',narrative:{paragraphs:golden.expected.unscored!.paragraphs}})
  expect(result.units[0].measurement.metrics).toEqual([])
  expect(await db.situationalRawSubmission.count({where:{attemptId:child.attempt.id}})).toBe(1)
 },60000)
})
