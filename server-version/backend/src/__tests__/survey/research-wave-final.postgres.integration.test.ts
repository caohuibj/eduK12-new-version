import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { createDraft,getDraft,updateDraft } from '../../modules/survey/builder.service'
import { createWave,getWave } from '../../modules/survey/waves.service'
import { prepareWave,openWave } from '../../modules/survey/waves.publish'
import { joinLinkedStudy,startLinkedWave,getPublicResearchInfo } from '../../modules/survey/admission.service'
import { submitResearchFinal,readGeneralForOwnAttempt } from '../../modules/survey/final.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { matchedWaveCounts,waveOverview } from '../../modules/survey/analytics.read'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { rawLongExport,rawWideExport } from '../../modules/survey/analytics.raw-export'
import { describePairedScores } from '../../modules/survey/analytics.descriptive'
import { createSurveyExport,downloadSurveyExport } from '../../modules/survey/analytics.export.service'
import { withdrawLinkedResearchData } from '../../modules/survey/identity.service'
import { generateToken } from '../../utils/jwt'
import type { Request } from 'express'

import type { FormDraft,ScaleDraft,SjtDraft } from '../../modules/survey/builder.definition'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient,ownerId='',projectId='',adminId=''
let wave1='',publicId='',entrySecret=''
let link:{researchCode:string;accessCredential:string}
const key=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,18)
const consent='本次研究旨在了解学习与课堂体验。各轮作答会使用研究编号进行关联，您可自愿停止参加。'
const form:FormDraft={schemaVersion:1,pages:[{pageKey:'page',title:'学习背景',questions:[
  {itemKey:'subject',type:'SINGLE',prompt:'当前学习科目',required:true,options:[
    {optionKey:'math',label:'数学'},{optionKey:'chemistry',label:'化学'},
  ],rows:[]},
  {itemKey:'reflection',type:'SHORT_TEXT',prompt:'学习反思',required:false,
    options:[],rows:[],displayIf:{itemKey:'subject',operator:'EQUALS',optionKey:'math'}},
]}]}
const scale:ScaleDraft={
  schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
  responseOptions:[1,2,3,4,5].map(x=>({optionKey:'o'+x,label:String(x),score:x})),
  dimensions:[{dimensionKey:'motivation',label:'动机',direction:'descriptive'},
    {dimensionKey:'strategy',label:'学习策略',direction:'descriptive'}],
  items:[
    {itemKey:'itemone',prompt:'我喜欢学习',required:true,reverse:false,dimensionKeys:['motivation']},
    {itemKey:'itemtwo',prompt:'我从不愿意学习',required:true,reverse:true,dimensionKeys:['strategy']},
  ],
}
const sjt:SjtDraft={
  schemaVersion:1,respondentType:'student_self_report',scenarioKey:'sceneone',
  title:'课堂互动情境',stimulus:'你发现课堂中出现新的讨论机会。',
  author:'课题负责人',sourceNote:'本人原创探索性场景',licenseStatus:'self_authored',redistribution:'allowed',
  metrics:[{metricKey:'effort',label:'投入',direction:'descriptive'},
    {metricKey:'support',label:'互助',direction:'descriptive'}],
  questions:[
    {questionKey:'first',prompt:'你首先会怎么做？',options:[
      {optionKey:'aone',label:'分享自己的观点',contributions:{effort:2,support:1}},
      {optionKey:'atwo',label:'先倾听',contributions:{effort:0,support:0}},
    ]},
    {questionKey:'second',prompt:'另一位同学需要帮助时？',options:[
      {optionKey:'bone',label:'帮助整理思路',contributions:{effort:3,support:2}},
      {optionKey:'btwo',label:'不参与',contributions:{effort:0,support:0}},
    ]},
  ],
}
let toolIds:{form:string;scale:string;sjt:string}
async function instrument(kind:'FORM'|'SCALE'|'SJT',definition:FormDraft|ScaleDraft|SjtDraft){
  const id=randomUUID()
  await createDraft(ownerId,projectId,{requestId:id,kind,instrumentKey:key('res'),title:kind+' 自编研究'})
  await updateDraft(ownerId,projectId,id,{revision:0,title:kind+' 自编研究',definition})
  return id
}
async function wave(title:string,ids:string[]){
  const w=await createWave(ownerId,projectId,{
    requestId:randomUUID(),title,consentText:consent,
    generalText:'感谢完成本轮研究。本研究结果将汇总分析，不提供个人诊断。',
    linkageNoticeConfirmed:true,
    instrumentIds:ids,
  })
  const prepared=await prepareWave(ownerId,projectId,w.id,w.revision)
  expect(prepared.runtimeReady).toBe(true)
  const frozen=await getWave(ownerId,projectId,w.id)
  const opened=await openWave(ownerId,projectId,w.id,frozen.revision)
  return {id:w.id,publicId:opened.publicId,entrySecret:opened.entrySecret}
}
const answers={
  form:{subject:'chemistry'},
  scale:{itemone:'o5',itemtwo:'o5'},
  sjt:{first:'aone',second:'bone'},
}
suite('Survey ResearchOnly T1/T2 real PostgreSQL FINAL contract',()=>{
  const previousFlags={publication:process.env.SURVEY_PUBLICATION_ENABLED,workspace:process.env.SURVEY_WORKSPACE_ENABLED}
  beforeAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED='true'
    process.env.SURVEY_WORKSPACE_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
    const admin=await db.user.create({data:{
      username:key('platform'),passwordHash:'synthetic-test',role:'ADMIN',
      platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY',
    }})
    adminId=admin.id
    const researcher=await db.user.create({data:{
      username:key('research'),passwordHash:'synthetic-test',role:'STUDENT',
      accountDomain:'SURVEY',
    }})
    ownerId=researcher.id
    const alias=key('alias')
    await db.surveyAccount.create({data:{
      userId:ownerId,loginName:alias,normalizedLogin:alias,
    }})
    await db.surveyResearcherGrant.create({data:{userId:ownerId,status:'ACTIVE',grantedBy:adminId}})
    await db.surveyMfaCredential.create({data:{userId:ownerId,enabled:true,secretCipher:'synthetic-enrollment'}})
    projectId=randomUUID()
    await db.surveyProject.create({data:{
      id:projectId,ownerUserId:ownerId,title:'多轮校园学习研究',
      collectionMode:'LINKED_WAVES',status:'DRAFT',description:'T1/T2',
    }})
    toolIds={
      form:await instrument('FORM',form),
      scale:await instrument('SCALE',scale),
      sjt:await instrument('SJT',sjt),
    }
  })
  afterAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED=previousFlags.publication
    process.env.SURVEY_WORKSPACE_ENABLED=previousFlags.workspace
    await db?.$disconnect()
  })
  it('publishes a real immutable ResearchOnly Form/Scale/SJT wave and issues separate linked proof',async()=>{
    const w=await wave('T1 前测',[toolIds.form,toolIds.scale,toolIds.sjt])
    wave1=w.id;publicId=w.publicId;entrySecret=w.entrySecret
    const info=await getPublicResearchInfo(publicId)
    expect(info.waves.some(item=>item.id===wave1)).toBe(true)
    link=await joinLinkedStudy({
      publicId,waveId:wave1,entryToken:entrySecret,
      consentVersion:1,consent:true,
    })
    expect(link.researchCode).toMatch(/^R-[A-Z0-9]{8,32}$/)
    expect(link.accessCredential).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(link.accessCredential).not.toBe(link.researchCode)
    const participant=await db.surveyParticipant.findFirstOrThrow({
      where:{projectId,researchCode:link.researchCode},
    })
    expect(participant.credentialHash).not.toContain(link.accessCredential)
    expect(participant.id).not.toBe(link.researchCode)
  })
  it('finalizes one parent attempt and recovers idempotently without personalized report',async()=>{
    const input={publicId,waveId:wave1,...link,consent:true,consentVersion:1}
    const started=await startLinkedWave(input)
    const same=await startLinkedWave(input)
    expect(same.attemptId).toBe(started.attemptId)
    expect(same.recovered).toBe(true)
    const task=await getOwnResearchTask({publicId,attemptId:started.attemptId,...link})
    expect(task.units.map(x=>x.kind)).toEqual(['FORM','SCALE','SJT'])
    expect(JSON.stringify(task)).not.toContain('contributions')
    const submissionId=randomUUID()
    const complete=await submitResearchFinal({
      publicId,attemptId:started.attemptId,...link,submissionId,
      answers:{
        [task.units[0].instrumentKey]:answers.form,
        [task.units[1].instrumentKey]:answers.scale,
        [task.units[2].instrumentKey]:answers.sjt,
      },
    })
    expect(complete.status).toBe('COMPLETED')
    expect(complete.idempotent).toBe(false)
    const repeat=await submitResearchFinal({
      publicId,attemptId:started.attemptId,...link,submissionId,
      answers:{
        [task.units[0].instrumentKey]:answers.form,
        [task.units[1].instrumentKey]:answers.scale,
        [task.units[2].instrumentKey]:answers.sjt,
      },
    })
    expect(repeat.idempotent).toBe(true)
    await expect(submitResearchFinal({
      publicId,attemptId:started.attemptId,...link,submissionId:randomUUID(),
      answers:{
        [task.units[0].instrumentKey]:answers.form,
        [task.units[1].instrumentKey]:answers.scale,
        [task.units[2].instrumentKey]:answers.sjt,
      },
    })).rejects.toThrow()
    const general=await readGeneralForOwnAttempt({
      publicId,attemptId:started.attemptId,...link,
    })
    expect(general.kind).toBe('GENERAL_ONLY')
    expect(JSON.stringify(general)).not.toContain('itemone')
    expect(JSON.stringify(general)).not.toContain('effort')
    await expect(getOwnResearchTask({publicId,attemptId:started.attemptId,
      researchCode:link.researchCode,accessCredential:'Z'.repeat(43)})).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({where:{attemptId:started.attemptId}})).toBe(1)
  })
  it('enables T2 with same research code but another frozen attempt and correctly scoped exports',async()=>{
    const w2=await wave('T2 后测',[toolIds.scale])
    expect(w2.publicId).toBe(publicId)
    const started=await startLinkedWave({
      publicId,waveId:w2.id,...link,consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({publicId,attemptId:started.attemptId,...link})
    expect(task.units).toHaveLength(1)
    await submitResearchFinal({publicId,attemptId:started.attemptId,...link,
      submissionId:randomUUID(),answers:{[task.units[0].instrumentKey]:{
        itemone:'o4',itemtwo:'o4',
      }},
    })
    const overview=await waveOverview(ownerId,projectId)
    expect(overview.waves.find(x=>x.id===wave1)?.finalCompleted).toBe(1)
    expect(overview.waves.find(x=>x.id===w2.id)?.finalCompleted).toBe(1)
    const cohort=await matchedWaveCounts({
      actorUserId:ownerId,projectId,baselineWaveId:wave1,followupWaveId:w2.id,
    })
    expect(cohort).toMatchObject({baselineN:1,followupN:1,matchedN:1})
    const source=await loadSurveySource({actorUserId:ownerId,projectId})
    expect(source.completeAttempts).toBe(2)
    expect(source.scores.some(x=>x.measurement.scoreKey==='motivation')).toBe(true)
    expect(source.raw.some(x=>x.itemKey==='subject'&&x.value==='chemistry')).toBe(true)
    expect(rawLongExport(projectId,source).manifest.rowCount).toBeGreaterThan(1)
    expect(rawWideExport(projectId,source).manifest.rowCount).toBe(1)
    const foreign=await db.user.create({data:{
      username:key('outsider'),passwordHash:'test',role:'STUDENT',accountDomain:'SURVEY',
    }})
    const alias=key('other')
    await db.surveyAccount.create({data:{
      userId:foreign.id,loginName:alias,normalizedLogin:alias,
    }})
    await db.surveyResearcherGrant.create({data:{
      userId:foreign.id,status:'ACTIVE',grantedBy:adminId,
    }})
    await db.surveyMfaCredential.create({data:{userId:foreign.id,enabled:true,secretCipher:'synthetic'}})
    await expect(loadSurveySource({actorUserId:foreign.id,projectId})).rejects.toThrow()
  })
  it('supports T3 draft revisions under ACTIVE project without mutating old FINAL; marks incompatible scoring',async()=>{
    const earlier=await db.surveyWaveFinal.findMany({where:{projectId},orderBy:{id:'asc'},select:{
      id:true,definitionDigest:true,resultsHash:true,
    }})
    expect(earlier.length).toBe(2)
    const scaleBefore=await getDraft(ownerId,projectId,toolIds.scale)
    const revised=structuredClone(scaleBefore.definition) as unknown as ScaleDraft
    revised.items[1].reverse=false
    await updateDraft(ownerId,projectId,toolIds.scale,{
      revision:scaleBefore.revision,title:scaleBefore.title,definition:revised,
    })
    const formBefore=await getDraft(ownerId,projectId,toolIds.form)
    const withRefusal=structuredClone(formBefore.definition) as unknown as FormDraft
    withRefusal.pages[0].questions[1].allowRefusal=true
    await updateDraft(ownerId,projectId,toolIds.form,{
      revision:formBefore.revision,title:formBefore.title,definition:withRefusal,
    })
    const sjtBefore=await getDraft(ownerId,projectId,toolIds.sjt)
    const sjtChanged=structuredClone(sjtBefore.definition) as unknown as SjtDraft
    sjtChanged.questions[0].responseType='MULTIPLE'
    sjtChanged.questions[0].aggregationPolicy='SUM'
    sjtChanged.questions[0].minSelections=2
    sjtChanged.questions[0].maxSelections=2
    sjtChanged.questions[0].options.push({
      optionKey:'athree',label:'先记下要点',contributions:{effort:1,support:2},
    })
    await updateDraft(ownerId,projectId,toolIds.sjt,{
      revision:sjtBefore.revision,title:sjtBefore.title,definition:sjtChanged,
    })
    const w3=await wave('T3 再测',[toolIds.form,toolIds.scale,toolIds.sjt])
    const started=await startLinkedWave({
      publicId,waveId:w3.id,...link,consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({publicId,attemptId:started.attemptId,...link})
    expect(task.units.map(u=>u.kind)).toEqual(['FORM','SCALE','SJT'])
    expect((task.units[2] as {questions:{responseType:string}[]}).questions[0].responseType).toBe('MULTIPLE')
    const general=await submitResearchFinal({
      publicId,attemptId:started.attemptId,...link,submissionId:randomUUID(),
      answers:{
        [task.units[0].instrumentKey]:{subject:'math',reflection:'REFUSED'},
        [task.units[1].instrumentKey]:{itemone:'o5',itemtwo:'o5'},
        [task.units[2].instrumentKey]:{first:['aone','athree'],second:'bone'},
      },
    })
    expect(general.status).toBe('COMPLETED')
    const source=await loadSurveySource({actorUserId:ownerId,projectId})
    expect(source.completeAttempts).toBe(3)
    const explicitRefusal=source.raw.find(r=>r.waveId===w3.id&&r.itemKey==='reflection')
    expect(explicitRefusal?.missingReason).toBe('REFUSED')
    const allCode=new Set(source.raw.map(r=>r.researchCode).filter(Boolean))
    expect([...allCode]).toEqual([link.researchCode])
    const dimension=source.scores.find(r=>r.waveId===wave1&&r.measurement.scoreKey==='strategy')
    expect(dimension).toBeDefined()
    const incompatible=describePairedScores(source,{
      baselineWaveId:wave1,followupWaveId:w3.id,
      instrumentKey:dimension!.measurement.instrumentKey,scoreKey:'strategy',
    })
    expect(incompatible).toMatchObject({
      matchedN:1,comparability:'NOT_COMPARABLE',meanPairedChange:null,
    })
    const after=await db.surveyWaveFinal.findMany({where:{
      id:{in:earlier.map(x=>x.id)},
    },orderBy:{id:'asc'},select:{id:true,definitionDigest:true,resultsHash:true}})
    expect(after).toEqual(earlier)
  })
  it('refuses frozen LINKED publication unless explicit linkage disclosure is confirmed',async()=>{
    const pending=await createWave(ownerId,projectId,{
      requestId:randomUUID(),title:'未确认关联告知的草稿',
      consentText:consent,instrumentIds:[toolIds.form],linkageNoticeConfirmed:false,
    })
    await expect(prepareWave(ownerId,projectId,pending.id,pending.revision))
      .rejects.toThrow(/关联|告知/)
    expect((await getWave(ownerId,projectId,pending.id)).publicationId).toBeNull()
  })
  it('requires fresh Survey TOTP for bounded raw exports and verifies encrypted tickets on download',async()=>{
    const token=(secondsOld:number)=>generateToken({
      userId:ownerId,username:'synthetic-researcher',role:'STUDENT',
      accountDomain:'SURVEY',tokenVersion:0,
      mfaVerifiedAt:Math.floor(Date.now()/1000)-secondsOld,
    })
    const req=(secondsOld:number)=>({
      headers:{cookie:'huisurvey_research_session='+token(secondsOld)},
      user:{userId:ownerId,tokenVersion:0,username:'synthetic-researcher',
        role:'STUDENT',platformRole:'STANDARD',mustChangePassword:false,accountDomain:'SURVEY'},
    }) as unknown as Request
    await expect(createSurveyExport(req(900),{projectId,format:'RAW_WAVE',waveId:wave1}))
      .rejects.toThrow(/TOTP/)
    const grant=await createSurveyExport(req(1),{projectId,format:'RAW_WAVE',waveId:wave1})
    expect(grant.status).toBe('READY')
    expect(grant.manifest.rowCount).toBeGreaterThan(0)
    expect(grant.manifest.selectedVersions.length).toBeGreaterThan(0)
    expect(grant.manifest.sourceCutOff).toMatch(/^\d{4}-\d\d-\d\dT/)
    const artifact=await downloadSurveyExport(req(1),{projectId,exportId:grant.id})
    expect(artifact.format).toBe('RAW_WAVE')
    expect(artifact.csv).toContain('research_code_or_attempt')
    expect(JSON.stringify(artifact)).not.toContain(link.accessCredential)
    expect((artifact.codebook as unknown[]).length).toBeGreaterThan(0)
    expect((artifact.codebook as {responseType:string}[]).some(c=>c.responseType==='SHORT_TEXT')).toBe(false)
    const explicit=await createSurveyExport(req(1),{
      projectId,format:'RAW_WAVE',waveId:wave1,includeFreeText:true,
    })
    expect(explicit.manifest.selection.freeTextIncluded).toBe(true)
    expect(explicit.manifest.selection.freeTextExcludedRows).toBe(0)
    await expect(downloadSurveyExport(req(1000),{projectId,exportId:grant.id}))
      .rejects.toThrow(/TOTP/)
  })

  it('revokes outstanding encrypted export tickets upon linked data withdrawal',async()=>{
    expect(await db.surveyExportTicket.count({where:{projectId,status:'READY'}})).toBeGreaterThan(0)
    const result=await withdrawLinkedResearchData({projectId,...link})
    expect(result.status).toBe('WITHDRAWN')
    expect(result.excludedAttempts).toBe(3)
    expect(await db.surveyExportTicket.count({where:{projectId,status:'READY'}})).toBe(0)
    const remaining=await loadSurveySource({actorUserId:ownerId,projectId})
    expect(remaining.completeAttempts).toBe(0)
    expect(remaining.raw).toHaveLength(0)
    expect(remaining.scores).toHaveLength(0)
  })

})
