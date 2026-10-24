import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { parseFrozenSituationalRuntimeSnapshot } from '../../modules/assessment-runtime/situational-runtime-snapshot'
import { parseSituationalRawSubmissionPayload } from '../../modules/situational/situational-raw-submission'
import { SITUATIONAL_ATTEMPT_SELECT } from '../../modules/situational/situational-runtime.service'
import { prepareSituationalFinalSubmission,deriveSituationalFinalFacts } from '../../modules/situational/situational-final-submit.service'
import { situationalLegacyFinalSubmitSchema } from '../../modules/situational/situational-final-submit.schema'
import { randomUUID,randomBytes } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,it,expect,vi } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { sjtNativeStagedTemplate,createSjtNativeStagedFinalFixture,compileSjtNativeStagedFixture } from '../fixtures/sjt-native-staged.fixture'
import { compileSjtTemplate } from '../../modules/situational/authoring/template'
import { createSjtDraft,requestSjtReview,reviewSjtDraft } from '../../modules/situational/authoring/service'
import { grantCatalogSource,revokeToolGrant } from '../../modules/survey/catalog.service'
import { importCatalogDraft } from '../../modules/survey/builder.service'
import { freezeResearchWaveDraft } from '../../modules/survey/publication.service'
import { bindSurveyAttemptContent } from '../../modules/survey/content-binding.service'
import { hashResearchCredential } from '../../modules/survey/identity.service'
import { startSurveySituational,readSurveySituational,submitSurveySituationalFinal } from '../../modules/survey/situational-native.service'
import { submitResearchFinal,readGeneralForOwnAttempt } from '../../modules/survey/final.service'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { startSituationalAttempt } from '../../modules/situational/situational-runtime.service'
import { submitSituationalAttemptFinal } from '../../modules/situational/situational-final-submit.service'
import { disclosedSurveyConsent } from '../../modules/survey/measurement.notice'
const url=integrationDatabaseUrl('SURVEY_NATIVE_SJT_TEST_DATABASE_URL')
const suite=url?describe:describe.skip
suite('Survey native staged actual author release and shared scientific lifecycle',()=>{
  let db:PrismaClient,admin:string,author:string,owner:string,projectId:string,publicId:string,grantId:string,draftId:string,ordinal=0
  let compiled:ReturnType<typeof compileSjtNativeStagedFixture>
  const runStarted=new Date()
  const oldFlags={workspace:process.env.SURVEY_WORKSPACE_ENABLED,publication:process.env.SURVEY_PUBLICATION_ENABLED}
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    vi.stubEnv('DATA_ENCRYPTION_KEY','a'.repeat(64));vi.stubEnv('DATA_PSEUDONYM_KEY','b'.repeat(64))
    process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
    const user=async(role:'ADMIN'|'STUDENT',domain:'LEGACY'|'SURVEY')=>(await db.user.create({data:{
      username:'native-sjt-'+randomUUID(),passwordHash:'synthetic-only',role,accountDomain:domain,
      ...(role==='ADMIN'?{platformRole:'SYSTEM_ADMIN'}:{})}})).id
    admin=await user('ADMIN','LEGACY');author=await user('STUDENT','LEGACY');owner=await user('STUDENT','SURVEY')
    await db.adminEntryGrant.create({data:{id:randomUUID(),userId:admin,entry:'SURVEY',grantedBy:admin}})
    const login='native_'+randomUUID().replace(/-/g,'').slice(0,24)
    await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
    await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'synthetic-only'}})
    const template={...structuredClone(sjtNativeStagedTemplate),instrumentKey:'synthetic-native-'+randomUUID()}
    compiled=compileSjtTemplate(template) as ReturnType<typeof compileSjtNativeStagedFixture>
    const draft=await createSjtDraft({userId:author,admin:false},template,{authorizationPolicy:null})
    await requestSjtReview({userId:author,admin:false},draft.id,draft.revision,draft.contentDigest)
    await reviewSjtDraft({userId:admin,admin:true},draft.id,draft.revision,draft.contentDigest,true,'Synthetic independent release, no real participant data')
    const release=await db.sjtAuthorRelease.findFirstOrThrow({where:{instrumentKey:template.instrumentKey}})
    expect(release.authorizationPolicy).toBeNull()
    const grant=await grantCatalogSource(admin,owner,{kind:'SJT',sourceId:release.id,sourceVersion:template.instrumentVersion})
    grantId=grant.id;projectId=randomUUID();publicId=randomUUID()
    await db.surveyProject.create({data:{id:projectId,publicId,ownerUserId:owner,title:'Synthetic staged SJT',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED'}})
    const imported=await importCatalogDraft(owner,projectId,grantId,{requestId:randomUUID(),instrumentKey:'staged',title:'Synthetic staged tool'})
    draftId=imported.id
  })
  afterAll(async()=>{
    if(oldFlags.workspace===undefined)delete process.env.SURVEY_WORKSPACE_ENABLED;else process.env.SURVEY_WORKSPACE_ENABLED=oldFlags.workspace
    if(oldFlags.publication===undefined)delete process.env.SURVEY_PUBLICATION_ENABLED;else process.env.SURVEY_PUBLICATION_ENABLED=oldFlags.publication
    await db?.$disconnect();vi.unstubAllEnvs()
  })
  async function fixture(){
    const waveId=randomUUID()
    await db.surveyWave.create({data:{id:waveId,projectId,ordinal:++ordinal,title:'Synthetic wave',instrumentIds:[draftId],
      consentText:'Synthetic research participation consent; no real human information is collected in this test.'}})
    const published=await freezeResearchWaveDraft({actorUserId:owner,projectId,waveId,revision:0,
      participantFeedback:[{instrumentId:draftId,feedback:{policyVersion:'SURVEY_RAW_METRICS_V1',mode:'DESCRIPTIVE',metricKeys:['coordination'],release:'AFTER_FINAL'}}]})
    await db.surveyWave.update({where:{id:waveId},data:{status:'OPEN',opensAt:new Date(Date.now()-60000),
      closesAt:new Date(Date.now()+3600000),finishUntil:new Date(Date.now()+7200000)}})
    const accessCredential=randomBytes(32).toString('base64url'),attemptId=randomUUID()
    await db.$transaction(async tx=>{
      await tx.surveyWaveAttempt.create({data:{id:attemptId,projectId,waveId,status:'STARTED',sessionHash:hashResearchCredential(accessCredential)}})
      await tx.surveyConsent.create({data:{id:randomUUID(),projectId,waveId,attemptId,consentVersion:1,accepted:true}})
      await bindSurveyAttemptContent(tx,{projectId,waveId,attemptId,publicationId:published.publicationId,newAttempt:true})
    })
    return {proof:{publicId,attemptId,accessCredential},waveId,publicationId:published.publicationId}
  }
  const input=(child:string)=>({...situationalLegacyFinalSubmitSchema.parse(createSjtNativeStagedFinalFixture(child,'path-A-A',compiled).finalInput),submissionId:randomUUID()})
  it('uses the same upload definition, scorer, durable raw, replay, parent receipt, report and researcher raw export',async()=>{
    const f=await fixture(),task=await getOwnResearchTask(f.proof)
    expect(task.units[0]).toMatchObject({executionProtocol:'SITUATIONAL_NATIVE_V1'})
    expect(JSON.stringify(task)).not.toContain('expertKey')
    const publication=await db.surveyPublication.findUniqueOrThrow({where:{id:f.publicationId}})
    expect(disclosedSurveyConsent('Consent',publication.compiledSnapshot)).toContain('阶段确认')
    const child=await startSurveySituational(f.proof,'staged')
    expect((await startSurveySituational(f.proof,'staged')).attempt.id).toBe(child.attempt.id)
    const payload=input(child.attempt.id)
    const results=await Promise.all([submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,payload),submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,payload)])
    expect(results[0].receipt).toEqual(results[1].receipt)
    expect(results[0]).not.toHaveProperty('result')
    expect(await db.situationalRawSubmission.count({where:{attemptId:child.attempt.id}})).toBe(1)
    const training=await startSituationalAttempt(author,{instrumentKey:compiled.package.key,instrumentVersion:compiled.package.instrumentVersion})
    const trainingResult=await submitSituationalAttemptFinal({attemptId:training.attempt.id,userId:author,...input(training.attempt.id)})
    const final=await submitResearchFinal({...f.proof,submissionId:randomUUID(),answers:{staged:{}},situationalReferences:[results[0].receipt!]})
    expect(final.status).toBe('COMPLETED')
    const report=await readGeneralForOwnAttempt(f.proof)
    expect(report.kind).toBe('DESCRIPTIVE')
    const source=await loadSurveySource({actorUserId:owner,projectId,waveIds:[f.waveId],includeAttendance:false})
    expect(source.scores[0].value).toBe(trainingResult.result!.metrics.find(metric=>metric.key==='coordination')!.value)
    expect(source.scores[0].value).toBe(5)
    const raw=source.raw.find(row=>row.itemKey==='__native_raw')!
    expect(JSON.parse(raw.value as string).researchCapture.events.length).toBeGreaterThan(0)
    expect((await readSurveySituational(f.proof,'staged',child.attempt.id)).receipt).toEqual(results[0].receipt)
  })
  it.skipIf(process.env.SURVEY_NATIVE_SJT_REQUIRE_PREUPGRADE!=='true')('preserves previously accepted frozen payload hashes and scientific results after dependency upgrade',async()=>{
    // Explicit evidence cutoff, not merely before this test: later Zod4 runs
    // must not accidentally qualify their own new facts as pre-upgrade data.
    const cutoff=new Date(process.env.SURVEY_NATIVE_SJT_PREUPGRADE_BEFORE??'')
    expect(Number.isFinite(cutoff.getTime())&&cutoff<runStarted).toBe(true)
    const rows=await db.situationalAttempt.findMany({where:{surveyAttemptId:{not:null},status:'COMPLETED',
      instrumentKey:{startsWith:'synthetic-native-'},completedAt:{lt:cutoff}},
      select:{...SITUATIONAL_ATTEMPT_SELECT,rawSubmission:true},take:20})
    expect(rows.length).toBeGreaterThan(0)
    console.info('Synthetic pre-upgrade native corpus', {cutoff:cutoff.toISOString(),count:rows.length,
      identityDigest:canonicalHash(rows.map(row=>({id:row.id,completedAt:row.completedAt?.toISOString(),payloadHash:row.submissionPayloadHash})).sort((a,b)=>a.id.localeCompare(b.id)))})
    for(const row of rows){
      const originalSnapshot=decryptUnifiedRuntimePayload(row.runtimeSnapshotEncrypted!)
      const snapshot=parseFrozenSituationalRuntimeSnapshot(originalSnapshot)
      expect(canonicalHash(snapshot)).toBe(canonicalHash(originalSnapshot))
      const raw=parseSituationalRawSubmissionPayload(decryptUnifiedRuntimePayload(row.rawSubmission!.payloadEncrypted))
      const prepared=prepareSituationalFinalSubmission({attemptId:row.id,submissionId:row.submissionId!,
        attemptEpoch:row.attemptEpoch,definitionHash:row.definitionHash!,compiledRuntimeHash:row.compiledRuntimeHash!,
        instrumentVersion:row.instrumentVersion,scoringVersion:row.scoringVersion!,
        responses:raw.responses,...(raw.researchCapture?{researchCapture:raw.researchCapture}:{})},{row,snapshot})
      expect(prepared.payloadHash).toBe(row.submissionPayloadHash)
      const derived=deriveSituationalFinalFacts(prepared,'SITUATIONAL_ATTEMPT')
      expect(derived.result).toEqual(decryptUnifiedRuntimePayload(row.resultEncrypted!))
      const oldCanonical=decryptUnifiedRuntimePayload(row.canonicalResultEncrypted!) as {core:unknown}
      expect(derived.canonicalResult.core).toEqual(oldCanonical.core)
    }
  })
  it('rejects missing stage evidence and foreign proof without facts; a forged parent receipt cannot complete',async()=>{
    const f=await fixture(),child=await startSurveySituational(f.proof,'staged'),payload=input(child.attempt.id)
    await expect(submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,{...payload,researchCapture:undefined})).rejects.toThrow()
    expect(await db.situationalRawSubmission.count({where:{attemptId:child.attempt.id}})).toBe(0)
    await expect(readSurveySituational({...f.proof,accessCredential:randomBytes(32).toString('base64url')},'staged',child.attempt.id)).rejects.toThrow()
    const accepted=await submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,payload)
    await expect(submitResearchFinal({...f.proof,submissionId:randomUUID(),answers:{staged:{}},situationalReferences:[{...accepted.receipt!,payloadHash:'f'.repeat(64)}]})).rejects.toThrow()
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:f.proof.attemptId}})).status).toBe('STARTED')
  })
  it('keeps frozen publication use after future-only grant revoke but honors fresh hard stop even for child replay',async()=>{
    const f=await fixture()
    await revokeToolGrant(admin,grantId)
    const child=await startSurveySituational(f.proof,'staged'),payload=input(child.attempt.id)
    await submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,payload)
    await db.surveyWave.update({where:{id:f.waveId},data:{hardStopAt:new Date()}})
    await expect(submitSurveySituationalFinal(f.proof,'staged',child.attempt.id,payload)).rejects.toThrow('窗口')
    expect(await db.situationalRawSubmission.count({where:{attemptId:child.attempt.id}})).toBe(1)
  })
})
