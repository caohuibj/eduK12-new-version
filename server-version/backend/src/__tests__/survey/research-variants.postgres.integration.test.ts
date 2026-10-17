import {randomBytes,randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {compileFrozenResearchUnit,type ResearchFrozenPublication} from '../../modules/survey/publication.service'
import {compileSurveyFlow} from '../../modules/survey/flow.definition'
import type {SurveyFlowAssignment} from '../../modules/survey/flow.assignment'
import {initialCognitiveDefinition} from '../../modules/survey/cognitive.definition'
import {hashResearchCredential} from '../../modules/survey/identity.service'
import {startLinkedWave} from '../../modules/survey/admission.service'
import {getOwnResearchTask} from '../../modules/survey/task.public'
import {saveSurveyCheckpoint,readSurveyCheckpoint} from '../../modules/survey/checkpoint.service'
import {startSurveyCognitive,readSurveyCognitive,interruptSurveyCognitive,restartSurveyCognitive} from '../../modules/survey/cognitive.service'
import {submitResearchFinal} from '../../modules/survey/final.service'
import {loadSurveySource} from '../../modules/survey/analytics.source'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
const provenance={schemaVersion:1 as const,deviceClass:'DESKTOP_LAPTOP' as const,administrationMode:'KEYBOARD_MOUSE' as const}
suite('Questionnaire variants PostgreSQL authorization and concurrent allocation',()=>{
  let db:PrismaClient,owner:string
  const flags={publication:process.env.SURVEY_PUBLICATION_ENABLED,workspace:process.env.SURVEY_WORKSPACE_ENABLED}
  beforeAll(async()=>{
    requireIsolatedReleaseDatabase(url!)
    process.env.SURVEY_PUBLICATION_ENABLED='true';process.env.SURVEY_WORKSPACE_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
    const admin=await db.user.create({data:{username:'variants-admin-'+randomUUID(),passwordHash:'test-only',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
    owner=(await db.user.create({data:{username:'variants-'+randomUUID(),passwordHash:'test-only',role:'STUDENT',accountDomain:'SURVEY'}})).id
    const login='variants_'+randomBytes(8).toString('hex')
    await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin.id}})
    await db.surveyMfaCredential.create({data:{userId:owner,enabled:true,secretCipher:'test-only'}})
  })
  afterAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED=flags.publication;process.env.SURVEY_WORKSPACE_ENABLED=flags.workspace
    await db?.$disconnect()
  })
  async function fixture(cognitive=false,linked=false){
    const mode=linked?'LINKED_WAVES':'SINGLE_UNLINKED'
    const projectId=randomUUID(),waveId=randomUUID(),publicationId=randomUUID(),publicId=randomUUID(),attemptId=randomUUID()
    const units=['a','b'].flatMap(arm=>[
      compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'form_'+arm,kind:'FORM',title:'Questionnaire '+arm,revision:1,
        definition:{schemaVersion:1,pages:[{pageKey:'p',title:'Page',questions:[{itemKey:'answer',type:'SINGLE',prompt:'Version '+arm,
          required:true,rows:[],options:[{optionKey:'yes',label:'Yes'},{optionKey:'no',label:'No'}]}]}]}}),
      ...(cognitive?[compileFrozenResearchUnit({id:randomUUID(),instrumentKey:'cog_'+arm,kind:'COGNITIVE',title:'Task '+arm,revision:1,
        definition:initialCognitiveDefinition()})]:[]),
    ])
    const flow=compileSurveyFlow({schemaVersion:1,embeddedData:[],experiment:{experimentKey:'questionnaires',
      mode:'QUESTIONNAIRE_VARIANTS',linkedPolicy:'RERANDOMIZE',groups:['a','b'].map(arm=>({groupKey:arm,variantLabel:arm.toUpperCase(),
        weight:arm==='a'?1:3,materialTitle:'',materialBody:'',instrumentKeys:['form_'+arm,...(cognitive?['cog_'+arm]:[])]}))},
      blocks:units.map(u=>({blockKey:u.instrumentKey,kind:'INSTRUMENT',instrumentKey:u.instrumentKey}))},units,mode)
    const snapshot:ResearchFrozenPublication={schemaVersion:1,purpose:'RESEARCH_ONLY',projectId,waveId,collectionMode:mode,
      consentVersion:1,linkageNoticeConfirmed:linked,consentDigest:canonicalHash('consent'),units,flow,
      checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:1},runtimeStatus:'SURVEY_FINAL_V1'}
    await db.surveyProject.create({data:{id:projectId,publicId,ownerUserId:owner,title:'Variant fixture',status:'ACTIVE',collectionMode:mode}})
    await db.surveyPublication.create({data:{id:publicationId,projectId,version:1,consentVersion:1,definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot as any}})
    await db.surveyWave.create({data:{id:waveId,projectId,publicationId,ordinal:1,title:'Wave',status:'OPEN',linkageNoticeConfirmed:linked,consentText:'Synthetic questionnaire variant research consent only.',
      opensAt:new Date(Date.now()-3600000),closesAt:new Date(Date.now()+3600000),finishUntil:new Date(Date.now()+7200000)}})
    const accessCredential=randomBytes(32).toString('base64url')
    const participantId=linked?randomUUID():null,researchCode=linked?'R-'+randomBytes(8).toString('hex').toUpperCase():undefined
    if(participantId)await db.surveyParticipant.create({data:{id:participantId,projectId,researchCode:researchCode!,credentialHash:hashResearchCredential(accessCredential)}})
    await db.surveyWaveAttempt.create({data:{id:attemptId,projectId,waveId,participantId,sessionHash:linked?null:hashResearchCredential(accessCredential)}})
    await db.surveyConsent.create({data:{id:randomUUID(),projectId,waveId,attemptId,participantId,consentVersion:1,accepted:true}})
    return {projectId,waveId,snapshot,participantId,proof:{publicId,attemptId,accessCredential,...(researchCode?{researchCode}:{})}}
  }
  it('concurrent first task requests persist one immutable choice, hide other arm, checkpoint and FINAL reject hostile answers',async()=>{
    const f=await fixture()
    const tasks=await Promise.all(Array.from({length:4},()=>getOwnResearchTask(f.proof)))
    expect(new Set(tasks.map(t=>JSON.stringify(t.units))).size).toBe(1)
    const task=tasks[0],selected=task.units[0].instrumentKey,other=selected==='form_a'?'form_b':'form_a'
    expect(task.units).toHaveLength(1)
    expect(JSON.stringify(task)).not.toContain(other)
    const record=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:f.proof.attemptId}})
    const assigned=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(record.flowAssignmentCipher!)
    expect(assigned.variant?.totalWeight).toBe(4)
    expect(assigned.variant?.variantKey).toBe(selected.slice(-1))
    await expect(saveSurveyCheckpoint(f.proof,{revision:0,answers:{[other]:{answer:'yes'}}})).rejects.toThrow()
    await saveSurveyCheckpoint(f.proof,{revision:0,answers:{[selected]:{answer:'yes'}}})
    expect((await readSurveyCheckpoint(f.proof)).checkpoint?.answers).toEqual({[selected]:{answer:'yes'}})
    await expect(submitResearchFinal({...f.proof,submissionId:randomUUID(),answers:{[selected]:{answer:'yes'},[other]:{answer:'no'}},
      presentation:{shownBlocks:[selected]}})).rejects.toThrow()
    await submitResearchFinal({...f.proof,submissionId:randomUUID(),answers:{[selected]:{answer:'yes'}},presentation:{shownBlocks:[selected]}})
    const again=await getOwnResearchTask(f.proof)
    expect(again.units).toEqual(task.units)
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:f.proof.attemptId}})).flowAssignmentCipher).toBe(record.flowAssignmentCipher)
    const source=await loadSurveySource({actorUserId:owner,projectId:f.projectId,waveIds:[f.waveId],maxFinals:250,includeWideSchema:true})
    expect(source.raw.find(r=>r.instrumentKey===other)?.missingReason).toBe('NOT_SHOWN')
    expect(source.raw.every(r=>r.experimentGroup===assigned.groupKey)).toBe(true)
  })
  it('foreign arm cognitive start/read/restart/interrupt cannot create or access sessions',async()=>{
    const f=await fixture(true),task=await getOwnResearchTask(f.proof)
    const selected=task.units.find(u=>u.kind==='FORM')!.instrumentKey
    const cognitive=task.units.find(u=>u.kind==='COGNITIVE')!.instrumentKey
    const foreign=cognitive==='cog_a'?'cog_b':'cog_a'
    await expect(startSurveyCognitive(f.proof,foreign,{priorAnswers:{[selected]:{answer:'yes'}},administrationProvenance:provenance})).rejects.toThrow()
    const active=await startSurveyCognitive(f.proof,cognitive,{priorAnswers:{[selected]:{answer:'yes'}},administrationProvenance:provenance})
    await expect(readSurveyCognitive(f.proof,foreign,active.sessionId)).rejects.toThrow()
    await expect(interruptSurveyCognitive(f.proof,foreign,active.sessionId,1)).rejects.toThrow()
    await expect(restartSurveyCognitive(f.proof,foreign,active.sessionId,1)).rejects.toThrow()
    expect(await db.surveyCognitiveSession.count({where:{attemptId:f.proof.attemptId,slotKey:foreign}})).toBe(0)
    expect(await db.surveyCognitiveSession.count({where:{attemptId:f.proof.attemptId,slotKey:cognitive}})).toBe(1)
  })
  it('recovers one linked identity per wave and rerandomizes independently across waves',async()=>{
    const f=await fixture(false,true),researchCode=f.proof.researchCode!,participantId=f.participantId!
    const proof={...f.proof,researchCode}
    await getOwnResearchTask(proof)
    const first=decryptUnifiedRuntimePayload<SurveyFlowAssignment>((await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:proof.attemptId}})).flowAssignmentCipher!)
    const nextWave=randomUUID(),publicationId=randomUUID()
    const snapshot={...f.snapshot,waveId:nextWave,collectionMode:'LINKED_WAVES',linkageNoticeConfirmed:true}
    await db.surveyPublication.create({data:{id:publicationId,projectId:f.projectId,version:2,consentVersion:1,
      definitionDigest:canonicalHash(snapshot),compiledSnapshot:snapshot as any}})
    await db.surveyWave.create({data:{id:nextWave,projectId:f.projectId,publicationId,ordinal:2,title:'Next wave',status:'OPEN',
      linkageNoticeConfirmed:true,consentText:'Synthetic linked questionnaire variant consent.',
      opensAt:new Date(Date.now()-3600000),closesAt:new Date(Date.now()+3600000),finishUntil:new Date(Date.now()+7200000)}})
    const reentry={publicId:proof.publicId,waveId:nextWave,researchCode,accessCredential:proof.accessCredential,consentVersion:1,consent:true}
    const [start,recovered]=await Promise.all([startLinkedWave(reentry),startLinkedWave(reentry)])
    expect(start.attemptId).toBe(recovered.attemptId)
    const second=decryptUnifiedRuntimePayload<SurveyFlowAssignment>((await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:start.attemptId}})).flowAssignmentCipher!)
    expect(first.algorithm).toBe('CRYPTO_RANDOM_INT_V1')
    expect(second.algorithm).toBe('CRYPTO_RANDOM_INT_V1')
    expect(second.inheritedFromAttemptId).toBeUndefined()
    expect(await db.surveyWaveAttempt.count({where:{waveId:nextWave,participantId}})).toBe(1)
    expect(await getOwnResearchTask({...proof,attemptId:start.attemptId})).toMatchObject({attemptId:start.attemptId,waveId:nextWave})
  })

})
