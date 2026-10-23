import { simonSequence } from '../../modules/cognitive/tasks/simon/sequence'
import { SURVEY_SIMON_TEMPLATE } from '../../modules/survey/cognitive.protocols'
import { cognitiveTrialRows } from '../../modules/survey/analytics.cognitive'
import { randomBytes,randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it,vi } from 'vitest'
import { integrationDatabaseUrl,requireIsolatedReleaseDatabase } from '../integration/integration-env'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import { compileFrozenResearchUnit,type ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { initialCognitiveDefinition } from '../../modules/survey/cognitive.definition'
import { compileSurveyFlow } from '../../modules/survey/flow.definition'
import { startSurveyCognitive,readSurveyCognitive,readSurveyCognitiveProgress,interruptSurveyCognitive,
  readSurveyCognitiveProgressFromVerifiedAttempt,restartSurveyCognitive,submitSurveyCognitiveFinal,type SurveyCognitiveProof } from '../../modules/survey/cognitive.service'
import { assertSurveyCognitiveLockedAnswers,loadSurveyCognitiveResults,loadSurveyCognitiveResultGroups,verifySurveyCognitiveReferences } from '../../modules/survey/cognitive.results'
import { verifiedSurveyAttempt } from '../../modules/survey/admission.service'
import { submitResearchFinal } from '../../modules/survey/final.service'
import { hashResearchCredential,revokeLinkedResearchAccess,withdrawLinkedResearchData } from '../../modules/survey/identity.service'
import { gonogoSequence } from '../../modules/cognitive/randomization'
import { createTrialEnvelope } from '../../modules/cognitive/v2/trial-envelope'
const url=integrationDatabaseUrl('SURVEY_COGNITIVE_TEST_DATABASE_URL','RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
const provenance={schemaVersion:1 as const,deviceClass:'DESKTOP_LAPTOP' as const,administrationMode:'KEYBOARD_MOUSE' as const}
const priorAnswers={screen:{eligible:'yes'}}
const trialData=(seed:string)=>gonogoSequence(seed,120,0.25).map((trialType,index)=>createTrialEnvelope({
  trialIndex:index,phase:'test',startedAtPerfMs:index*1300,endedAtPerfMs:index*1300+800,
  payload:{trialType,responded:trialType==='go',rtMs:trialType==='go'?320:null,interrupted:false},
}))
type Fixture={projectId:string;waveId:string;publicationId:string;proof:SurveyCognitiveProof;
  snapshot:ResearchFrozenPublication;participantId:string|null}
type Session=Awaited<ReturnType<typeof startSurveyCognitive>>
const finalInput=(session:Session)=>({submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,
  definitionHash:session.definitionHash!,trials:trialData(session.randomSeed),administrationProvenance:provenance})
const nextTurn=()=>new Promise(resolve=>setTimeout(resolve,15))
suite('Survey cognitive PostgreSQL authority, immutability and serialized lifecycle',()=>{
  let db:PrismaClient,owner:string
  const priorFlags={workspace:process.env.SURVEY_WORKSPACE_ENABLED,publication:process.env.SURVEY_PUBLICATION_ENABLED}
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    process.env.SURVEY_WORKSPACE_ENABLED='true';process.env.SURVEY_PUBLICATION_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
    const admin=(await db.user.create({data:{username:'survey-cognitive-admin-'+randomUUID(),passwordHash:'test-fixture-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
    owner=(await db.user.create({data:{username:'survey-cognitive-'+randomUUID(),passwordHash:'test-fixture-only',role:'STUDENT',accountDomain:'SURVEY'}})).id
    const login='cognitive_'+randomUUID().replace(/-/g,'').slice(0,16)
    await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
    await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'test-fixture-only'}})
  })
  afterAll(async()=>{
    process.env.SURVEY_WORKSPACE_ENABLED=priorFlags.workspace
    process.env.SURVEY_PUBLICATION_ENABLED=priorFlags.publication
    await db?.$disconnect()
  })
  async function fixture(options:{linked?:boolean;conditional?:boolean;consentVersion?:number;simon?:boolean}={}):Promise<Fixture>{
    const projectId=randomUUID(),waveId=randomUUID(),publicationId=randomUUID(),publicId=randomUUID(),attemptId=randomUUID()
    const units=[compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'screen',title:'Eligibility',revision:1,kind:'FORM',
      definition:{schemaVersion:1,pages:[{pageKey:'p',title:'Eligibility',questions:[{itemKey:'eligible',type:'SINGLE',
        prompt:'Continue?',required:true,options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}],rows:[]}]}]}}),
      compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'go',title:'Go/No-Go',revision:1,kind:'COGNITIVE',definition:{...initialCognitiveDefinition(),...(options.simon?{templateKey:SURVEY_SIMON_TEMPLATE}:{})}})]
    const mode=options.linked?'LINKED_WAVES':'SINGLE_UNLINKED'
    const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,
      collectionMode:mode,consentVersion:1,linkageNoticeConfirmed:!!options.linked,
      consentDigest:canonicalHash('cognitive pilot consent'),runtimeStatus:'SURVEY_FINAL_V1',units}
    if(options.conditional)snapshot.flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],blocks:[
      {blockKey:'screen',kind:'INSTRUMENT',instrumentKey:'screen'},
      {blockKey:'go',kind:'INSTRUMENT',instrumentKey:'go',when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screen',itemKey:'eligible'},value:'yes'}},
    ]},units,mode)
    await db.surveyProject.create({data:{id:projectId,publicId,ownerUserId:owner,title:'Synthetic cognitive test',status:'ACTIVE',collectionMode:mode}})
    await db.surveyPublication.create({data:{id:publicationId,projectId,definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot as any,consentVersion:1,version:1}})
    await db.surveyWave.create({data:{id:waveId,projectId,publicationId,ordinal:1,title:'Pilot',status:'OPEN',linkageNoticeConfirmed:!!options.linked,consentText:'Synthetic consenting research pilot with cognitive task and one restart.',
      opensAt:new Date(Date.now()-3600000),closesAt:new Date(Date.now()+3600000),finishUntil:new Date(Date.now()+7200000)}})
    const accessCredential=randomBytes(32).toString('base64url')
    const participantId=options.linked?randomUUID():null
    const researchCode=options.linked?'R-'+randomBytes(10).toString('hex').toUpperCase():undefined
    if(participantId)await db.surveyParticipant.create({data:{id:participantId,projectId,researchCode:researchCode!,credentialHash:hashResearchCredential(accessCredential)}})
    await db.surveyWaveAttempt.create({data:{id:attemptId,projectId,waveId,participantId,
      sessionHash:participantId?null:hashResearchCredential(accessCredential)}})
    await db.surveyConsent.create({data:{id:randomUUID(),projectId,waveId,attemptId,participantId,consentVersion:options.consentVersion??1,accepted:true}})
    return {projectId,waveId,publicationId,snapshot,participantId,proof:{publicId,attemptId,accessCredential,...(researchCode?{researchCode}:{})}}
  }
  const start=(f:Fixture)=>startSurveyCognitive(f.proof,'go',{priorAnswers,administrationProvenance:provenance})
  const submit=(f:Fixture,s:Session,input=finalInput(s))=>submitSurveyCognitiveFinal(f.proof,'go',s.sessionId,input)
  async function blockedMutation(f:Fixture,operation:()=>Promise<unknown>,mutation:(tx:any)=>Promise<unknown>){
    let started!:()=>void,release!:()=>void
    const ready=new Promise<void>(resolve=>{started=resolve}),resume=new Promise<void>(resolve=>{release=resolve})
    const hold=db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${f.projectId} FOR UPDATE`
      started();await resume;await mutation(tx)
    },{timeout:10000})
    await ready
    const pending=operation().then(value=>({ok:true,value}),error=>({ok:false,error}))
    try{
      let observed=false
      const deadline=Date.now()+3000
      while(Date.now()<deadline){
        const waits=await db.$queryRaw<Array<{count:bigint}>>`SELECT count(*)::bigint AS count FROM pg_stat_activity
          WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock'
            AND query LIKE '%survey_projects%'`
        if(Number(waits[0].count)>0){observed=true;break}
        await nextTurn()
      }
      expect(observed,'child operation must be observed waiting on real PostgreSQL authority lock').toBe(true)
    }finally{release()}
    await hold
    const outcome=await pending
    expect(outcome.ok).toBe(false)
    expect(await db.surveyCognitiveResult.count({where:{attemptId:f.proof.attemptId}})).toBe(0)
  }
  it('persists Simon 100-trial native results, signed/null metrics, exact parent FINAL and replay without changing Go/No-Go',async()=>{
    const f=await fixture({simon:true}),session=await start(f)
    expect(session.testType).toBe('simon')
    const trials=simonSequence(session.randomSeed,100).map((stimulus,index)=>{
      const {isiMs,...identity}=stimulus
      const congruent=stimulus.stimulusSide===stimulus.requiredSide
      return createTrialEnvelope({trialIndex:index,phase:'test',condition:congruent?'congruent':'incongruent',
        startedAtPerfMs:index*3000,endedAtPerfMs:index*3000+2000,
        payload:{...identity,responseSide:stimulus.requiredSide,rtMs:congruent?500:400,timeout:false,interrupted:false,
          timing:{strategy:'double-raf-performance-v1',onsetPerfMs:index*3000,windowEndPerfMs:index*3000+2000,isiMs}}})
    })
    const input={submissionId:randomUUID(),attemptEpoch:session.attemptEpoch,definitionHash:session.definitionHash!,trials,administrationProvenance:provenance}
    await expect(submitSurveyCognitiveFinal(f.proof,'go',session.sessionId,{...input,trials:trials.slice(0,99)})).rejects.toThrow('试次数')
    const forged=structuredClone(input);forged.trials[0].payload.requiredSide=forged.trials[0].payload.requiredSide==='left'?'right':'left'
    await expect(submitSurveyCognitiveFinal(f.proof,'go',session.sessionId,forged)).rejects.toThrow('冻结任务')
    const receipts=await Promise.all([submitSurveyCognitiveFinal(f.proof,'go',session.sessionId,input),submitSurveyCognitiveFinal(f.proof,'go',session.sessionId,input)])
    expect(receipts.filter(r=>r.replayed)).toHaveLength(1)
    const reference=receipts[0].resultReference
    const loaded=await db.$transaction(tx=>loadSurveyCognitiveResults(tx,{projectId:f.projectId,waveId:f.waveId,attemptId:f.proof.attemptId,publicationId:f.publicationId,references:[reference],includeRaw:true}))
    expect(loaded[0].raw?.trials).toHaveLength(100)
    expect(loaded[0].result.metrics.simonEffectMeanMs).toBe(-100)
    expect(loaded[0].result).not.toHaveProperty('score')
    const final={...f.proof,submissionId:randomUUID(),answers:{...priorAnswers,go:{}},cognitiveReferences:[reference]}
    expect((await submitResearchFinal(final)).status).toBe('COMPLETED')
    expect((await submitResearchFinal(final)).idempotent).toBe(true)
    const parent=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:f.proof.attemptId}})
    const exported=[...cognitiveTrialRows(f.snapshot.units[1],loaded[0] as any,{projectId:f.projectId,waveId:f.waveId,waveOrdinal:1,attemptId:f.proof.attemptId,researchCode:null,publicationId:f.publicationId,publicationVersion:1,completedAt:new Date().toISOString(),sourceFinalHash:parent.payloadHash} as any)]
    expect(exported).toHaveLength(100);expect(exported.every(row=>row.simon?.correct)).toBe(true)
    const stored=await db.surveyCognitiveResult.findUniqueOrThrow({where:{id:reference.resultId}})
    await expect(db.$executeRaw`UPDATE survey_cognitive_results SET trial_count=120 WHERE id=${reference.resultId}`).rejects.toThrow('immutable')
    const wrongParent=await fixture(),wrongSession=await start(wrongParent)
    await expect(db.surveyCognitiveResult.create({data:{...stored,id:randomUUID(),sessionId:wrongSession.sessionId,projectId:wrongParent.projectId,waveId:wrongParent.waveId,attemptId:wrongParent.proof.attemptId,publicationId:wrongParent.publicationId,measurementDigest:wrongSession.surveyBinding.measurementDigest,trialCount:100}})).rejects.toThrow('frozen protocol')
  })
  it('admits once with stable encrypted seed and returns safe recovery without private score/trials',async()=>{
    const f=await fixture(),[a,b]=await Promise.all([start(f),start(f)])
    expect(b.sessionId).toBe(a.sessionId);expect(b.randomSeed).toBe(a.randomSeed)
    expect([a,b].filter(session=>session.freshAdmission)).toHaveLength(1)
    expect(a.lockedPriorAnswers).toEqual(priorAnswers);expect(b.lockedPriorAnswers).toEqual(priorAnswers)
    expect(a.attemptEpoch).toBe(1);expect(b.attemptEpoch).toBe(1)
    expect(await db.surveyCognitiveSession.count({where:{attemptId:f.proof.attemptId}})).toBe(1)
    const read=await readSurveyCognitive(f.proof,'go',a.sessionId)
    expect(read.freshAdmission).toBe(false);expect(read.lockedPriorAnswers).toEqual(priorAnswers)
    const stale=await startSurveyCognitive(f.proof,'go',{priorAnswers:{screen:{eligible:'no'}},administrationProvenance:provenance})
    expect(stale.freshAdmission).toBe(false);expect(stale.lockedPriorAnswers).toEqual(priorAnswers)
    const row=await db.surveyCognitiveSession.findUniqueOrThrow({where:{id:a.sessionId}})
    expect(row.randomSeedCipher).not.toContain(a.randomSeed)
    expect(row.lockedAnswersCipher).not.toContain('eligible')
    expect(row.retentionReviewAt.getTime()-row.startedAt.getTime()).toBeGreaterThan(29*86400000)
    const progress=await readSurveyCognitiveProgress(f.proof)
    expect(progress.lockedPriorAnswers).toEqual(priorAnswers)
    expect(progress.cognitiveSessions[0]).toMatchObject({slotKey:'go',sessionId:a.sessionId,epoch:1,status:'IN_PROGRESS'})
    expect(JSON.stringify(progress)).not.toMatch(/randomSeed|trials|metrics|resultCipher/)
    await expect(readSurveyCognitive({...f.proof,accessCredential:'x'.repeat(43)},'go',a.sessionId)).rejects.toThrow()
    await expect(startSurveyCognitive(f.proof,'go',{priorAnswers,administrationProvenance:{...provenance,deviceClass:'PHONE'}})).rejects.toThrow()
  })
  it('validates ordinary prefix, reachability and original answer locks',async()=>{
    const f=await fixture({conditional:true})
    await expect(startSurveyCognitive(f.proof,'go',{priorAnswers:{screen:{eligible:'no'}},administrationProvenance:provenance})).rejects.toThrow('路径')
    await expect(startSurveyCognitive(f.proof,'go',{priorAnswers:{},administrationProvenance:provenance})).rejects.toThrow('前')
    await start(f)
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${f.proof.attemptId} FOR UPDATE`
      await expect(assertSurveyCognitiveLockedAnswers(tx,f.proof.attemptId,{screen:{eligible:'no'}})).rejects.toThrow('前置答案')
    })
  })
  it('rejects foreign project, participant, slot and invalid/stale epoch bindings',async()=>{
    const a=await fixture(),b=await fixture(),session=await start(a)
    await expect(readSurveyCognitive(b.proof,'go',session.sessionId)).rejects.toThrow()
    await expect(readSurveyCognitive(a.proof,'foreign',session.sessionId)).rejects.toThrow()
    await expect(submitSurveyCognitiveFinal(a.proof,'go',session.sessionId,{...finalInput(session),attemptEpoch:2})).rejects.toThrow()
    const secondAttempt=randomUUID(),secret=randomBytes(32).toString('base64url')
    await db.surveyWaveAttempt.create({data:{id:secondAttempt,projectId:a.projectId,waveId:a.waveId,sessionHash:hashResearchCredential(secret)}})
    await db.surveyConsent.create({data:{id:randomUUID(),projectId:a.projectId,waveId:a.waveId,attemptId:secondAttempt,consentVersion:1,accepted:true}})
    await expect(readSurveyCognitive({...a.proof,attemptId:secondAttempt,accessCredential:secret},'go',session.sessionId)).rejects.toThrow()
  })
  it('commits same sealed FINAL once under concurrent retry, rejects changed payload, preserves raw once',async()=>{
    const f=await fixture(),s=await start(f),input=finalInput(s)
    const receipts=await Promise.all([submit(f,s,input),submit(f,s,input)])
    expect(receipts[0].resultReference).toEqual(receipts[1].resultReference)
    expect(receipts.filter(r=>r.replayed)).toHaveLength(1)
    expect(await db.surveyCognitiveResult.count({where:{attemptId:f.proof.attemptId}})).toBe(1)
    expect(await db.surveyWaveFinal.count({where:{attemptId:f.proof.attemptId}})).toBe(0)
    const changed=structuredClone(input),go=changed.trials.find(t=>t.payload.trialType==='go')!
    go.payload.rtMs=420
    await expect(submit(f,s,changed)).rejects.toThrow('不同')
    const reference=receipts[0].resultReference
    const loaded=await db.$transaction(tx=>loadSurveyCognitiveResults(tx,{projectId:f.projectId,waveId:f.waveId,
      attemptId:f.proof.attemptId,publicationId:f.publicationId,references:[reference],includeRaw:true}))
    expect(loaded[0].raw?.trials).toHaveLength(120);expect(loaded[0].result.metrics.hitRate).toBe(1)
    expect(loaded[0].result.rawHash).toBe(canonicalHash(loaded[0].raw!))
    const read=await readSurveyCognitive(f.proof,'go',s.sessionId)
    expect(read.result).toBeNull();expect(read.feedbackDeferred).toBe(true);expect(read.resultReference).toEqual(reference)
    await expect(db.$executeRaw`UPDATE survey_cognitive_results SET trial_count=119 WHERE id=${reference.resultId}`).rejects.toThrow()
    await expect(db.$executeRaw`DELETE FROM survey_cognitive_results WHERE id=${reference.resultId}`).rejects.toThrow()
  })
  it('permits one interrupted whole-unit restart, rejects late old FINAL and second restart',async()=>{
    const f=await fixture(),s=await start(f)
    await expect(restartSurveyCognitive(f.proof,'go',s.sessionId,1)).rejects.toThrow('中断')
    await interruptSurveyCognitive(f.proof,'go',s.sessionId,1)
    const next=await restartSurveyCognitive(f.proof,'go',s.sessionId,1)
    expect(next.attemptEpoch).toBe(2);expect(next.randomSeed).not.toBe(s.randomSeed)
    const retry=await restartSurveyCognitive(f.proof,'go',s.sessionId,1)
    expect(retry.sessionId).toBe(next.sessionId);expect(retry.randomSeed).toBe(next.randomSeed)
    expect(next.freshAdmission).toBe(true);expect(retry.freshAdmission).toBe(false)
    await expect(submit(f,s)).rejects.toThrow('替换')
    await interruptSurveyCognitive(f.proof,'go',next.sessionId,2)
    await expect(restartSurveyCognitive(f.proof,'go',next.sessionId,2)).rejects.toThrow('一次')
    await submit(f,next)
    await expect(restartSurveyCognitive(f.proof,'go',next.sessionId,2)).rejects.toThrow()
  })
  it('serializes restart versus a sealed old child FINAL to one deterministic winner',async()=>{
    const f=await fixture(),s=await start(f)
    await interruptSurveyCognitive(f.proof,'go',s.sessionId,1)
    const outcomes=await Promise.allSettled([submit(f,s),restartSurveyCognitive(f.proof,'go',s.sessionId,1)])
    expect(outcomes.filter(o=>o.status==='fulfilled')).toHaveLength(1)
    const live=await db.surveyCognitiveSession.findFirstOrThrow({where:{attemptId:f.proof.attemptId},orderBy:{epoch:'desc'}})
    expect(['COMPLETED','IN_PROGRESS']).toContain(live.status)
    if(live.epoch===2){expect(await db.surveyCognitiveResult.count({where:{attemptId:f.proof.attemptId}})).toBe(0);await expect(submit(f,s)).rejects.toThrow()}
    else expect(await db.surveyCognitiveResult.count({where:{attemptId:f.proof.attemptId}})).toBe(1)
  })
  it('references child FINAL only from exact parent, canonical-binds references and blocks parent mutations',async()=>{
    const f=await fixture(),s=await start(f),child=await submit(f,s)
    const reference=child.resultReference
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM survey_wave_attempts WHERE id=${f.proof.attemptId} FOR UPDATE`
      const base={projectId:f.projectId,waveId:f.waveId,attemptId:f.proof.attemptId,publicationId:f.publicationId,snapshot:f.snapshot}
      await expect(verifySurveyCognitiveReferences(tx,{...base,references:[reference]})).resolves.toEqual([reference])
      await expect(verifySurveyCognitiveReferences(tx,{...base,references:[{...reference,resultHash:'0'.repeat(64)}]})).rejects.toThrow()
      await expect(verifySurveyCognitiveReferences(tx,{...base,references:[{...reference,slotKey:'screen'}]})).rejects.toThrow()
    })
    const input={...f.proof,submissionId:randomUUID(),answers:{...priorAnswers,go:{}},cognitiveReferences:[reference]}
    const done=await submitResearchFinal(input)
    expect(done.status).toBe('COMPLETED')
    expect((await submitResearchFinal(input)).idempotent).toBe(true)
    await expect(submitResearchFinal({...input,cognitiveReferences:[{...reference,resultHash:'0'.repeat(64)}]})).rejects.toThrow()
    await expect(start(f)).rejects.toThrow()
    await expect(interruptSurveyCognitive(f.proof,'go',s.sessionId,1)).rejects.toThrow()
    const parent=await db.surveyWaveFinal.findUniqueOrThrow({where:{attemptId:f.proof.attemptId}})
    expect(JSON.stringify(decryptUnifiedRuntimePayload(parent.resultsCipher))).not.toContain('startedAtPerfMs')
  })
  it('requires exact current consent and database rejects mutation of frozen consent',async()=>{
    const f=await fixture(),s=await start(f)
    await expect(db.surveyWave.update({where:{id:f.waveId},data:{consentVersion:2}})).rejects.toThrow('immutable')
    const invalid=await fixture({consentVersion:2})
    await expect(start(invalid)).rejects.toThrow('知情同意')
    // A corrupt pre-existing admission cannot bypass the transactional FINAL consent check.
    const source=await db.surveyCognitiveSession.findUniqueOrThrow({where:{id:s.sessionId}})
    const id=randomUUID()
    await db.surveyCognitiveSession.create({data:{...source,id,projectId:invalid.projectId,waveId:invalid.waveId,
      attemptId:invalid.proof.attemptId,publicationId:invalid.publicationId}})
    await expect(submitSurveyCognitiveFinal(invalid.proof,'go',id,finalInput(s))).rejects.toThrow('知情同意')
  })
  it('rechecks HARD_STOP while child FINAL is waiting for the authority lock',async()=>{
    const f=await fixture(),s=await start(f)
    await blockedMutation(f,()=>submit(f,s),tx=>tx.surveyWave.update({where:{id:f.waveId},data:{hardStopAt:new Date()}}))
  })
  it('rechecks current completion window and closed parent under authority locks',async()=>{
    const f=await fixture(),s=await start(f)
    await blockedMutation(f,()=>submit(f,s),tx=>tx.surveyWave.update({where:{id:f.waveId},data:{finishUntil:new Date(Date.now()-1000)}}))
    const g=await fixture(),t=await start(g)
    await blockedMutation(g,()=>submit(g,t),tx=>tx.surveyWaveAttempt.update({where:{id:g.proof.attemptId},data:{status:'WITHDRAWN',excludedAt:new Date()}}))
  })
  it('serializes actual linked withdrawal and revoke with child access and rejects revoked old bearers',async()=>{
    const f=await fixture({linked:true}),s=await start(f)
    await revokeLinkedResearchAccess({projectId:f.projectId,researchCode:f.proof.researchCode!,accessCredential:f.proof.accessCredential})
    await expect(submit(f,s)).rejects.toThrow();await expect(readSurveyCognitive(f.proof,'go',s.sessionId)).rejects.toThrow()
    const g=await fixture({linked:true}),t=await start(g)
    await withdrawLinkedResearchData({projectId:g.projectId,researchCode:g.proof.researchCode!,accessCredential:g.proof.accessCredential})
    await expect(submit(g,t)).rejects.toThrow();await expect(readSurveyCognitiveProgress(g.proof)).rejects.toThrow()
    expect(await db.surveyCognitiveSession.count({where:{attemptId:g.proof.attemptId}})).toBe(1)
  })
  it('rechecks withdrawal and credential revocation committed during pending child FINAL',async()=>{
    const f=await fixture({linked:true}),s=await start(f)
    await blockedMutation(f,()=>submit(f,s),async tx=>{
      await tx.surveyParticipant.update({where:{id:f.participantId!},data:{status:'WITHDRAWN',credentialRevokedAt:new Date()}})
      await tx.surveyWaveAttempt.update({where:{id:f.proof.attemptId},data:{status:'WITHDRAWN',excludedAt:new Date()}})
    })
    const g=await fixture({linked:true}),t=await start(g)
    await blockedMutation(g,()=>submit(g,t),tx=>tx.surveyParticipant.update({where:{id:g.participantId!},data:{status:'REVOKED',credentialRevokedAt:new Date()}}))
  })
  it('loads two exact parent result groups with one byte preflight and one metrics-only fetch',async()=>{
    const a=await fixture(),b=await fixture(),sa=await start(a),sb=await start(b)
    const ca=await submit(a,sa),cb=await submit(b,sb)
    const inputs=[{projectId:a.projectId,waveId:a.waveId,attemptId:a.proof.attemptId,publicationId:a.publicationId,references:[ca.resultReference]},
      {projectId:b.projectId,waveId:b.waveId,attemptId:b.proof.attemptId,publicationId:b.publicationId,references:[cb.resultReference]}]
    await db.$transaction(async tx=>{
      const query=vi.fn((sql:any)=>tx.$queryRaw(sql)),findMany=vi.fn((args:any)=>tx.surveyCognitiveResult.findMany(args))
      const scoped={$queryRaw:query,surveyCognitiveResult:{findMany}}
      const groups=await loadSurveyCognitiveResultGroups(scoped as any,inputs)
      expect(groups.map(g=>g.map(r=>r.reference))).toEqual(inputs.map(i=>i.references))
      expect(groups.every(g=>g[0].result.metrics.hitRate===1&&g[0].raw===undefined&&g[0].randomSeed===undefined)).toBe(true)
      expect(query).toHaveBeenCalledTimes(1);expect(findMany).toHaveBeenCalledTimes(1)
      expect(findMany.mock.calls[0][0].select).not.toHaveProperty('rawCipher')
      expect(findMany.mock.calls[0][0].select).not.toHaveProperty('session')
      await expect(loadSurveyCognitiveResultGroups(tx,[{...inputs[0],references:inputs[1].references}])).rejects.toThrow('无法匹配')
    })
  })
  it('reused task locators still reject a subsequently revoked credential and hard stop',async()=>{
    const linked=await fixture({linked:true});await start(linked)
    const locator=await verifiedSurveyAttempt(linked.proof)
    await revokeLinkedResearchAccess({projectId:linked.projectId,researchCode:linked.proof.researchCode!,accessCredential:linked.proof.accessCredential})
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(linked.proof,locator)).rejects.toThrow('凭证')
    const single=await fixture();await start(single)
    const beforeStop=await verifiedSurveyAttempt(single.proof)
    await db.surveyWave.update({where:{id:single.waveId},data:{hardStopAt:new Date()}})
    await expect(readSurveyCognitiveProgressFromVerifiedAttempt(single.proof,beforeStop)).rejects.toThrow('窗口')
  })
})
