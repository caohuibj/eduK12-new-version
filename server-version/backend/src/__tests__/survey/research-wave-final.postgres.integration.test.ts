import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { createDraft,getDraft,updateDraft } from '../../modules/survey/builder.service'
import { createWave,getWave,updateWave } from '../../modules/survey/waves.service'
import { transitionResearchProject } from '../../modules/survey/project-lifecycle'
import { prepareWave,openWave,updateWaveEntryToken,transitionWave } from '../../modules/survey/waves.publish'
import { joinLinkedStudy,startLinkedWave,getPublicResearchInfo,listOwnLinkedWaves } from '../../modules/survey/admission.service'
import { submitResearchFinal,readGeneralForOwnAttempt } from '../../modules/survey/final.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { matchedWaveCounts,waveOverview } from '../../modules/survey/analytics.read'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { describeSurveyWaveItemPaged } from '../../modules/survey/analytics.paged'
import {listSampleQuality,listSampleQualityHistory,setSampleQuality} from '../../modules/survey/sample-quality.service'
import { rawLongExport,rawWideExport } from '../../modules/survey/analytics.raw-export'
import { exportWide,exportLong } from '../../modules/survey/analytics.export-format'
import { describePairedScores } from '../../modules/survey/analytics.descriptive'
import { createSurveyExport,downloadSurveyExport } from '../../modules/survey/analytics.export.service'
import { withdrawLinkedResearchData,revokeLinkedResearchAccess,recoverLinkedResearchIdentity } from '../../modules/survey/identity.service'
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
async function wave(title:string,ids:string[],allowNewParticipants=false){
  const w=await createWave(ownerId,projectId,{
    requestId:randomUUID(),title,consentText:consent,
    generalText:'感谢完成本轮研究。本研究结果将汇总分析，不提供个人诊断。',
    linkageNoticeConfirmed:true,
    instrumentIds:ids,allowNewParticipants,
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
    const enrolled=await joinLinkedStudy({
      publicId,waveId:wave1,entryToken:entrySecret,
      consentVersion:1,consent:true,
    })
    // Preserve only the code and its private proof for future Waves. The
    // enrollment response also contains T1 attemptId, which must never
    // override the explicit T2/T3 attemptId in later object spreads.
    link={researchCode:enrolled.researchCode,accessCredential:enrolled.accessCredential}
    expect(enrolled.attemptId).toMatch(/^[a-f0-9-]{36}$/i)
    expect(link.researchCode).toMatch(/^R-[A-Z0-9]{8,32}$/)
    expect(link.accessCredential).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(link.accessCredential).not.toBe(link.researchCode)
    const participant=await db.surveyParticipant.findFirstOrThrow({
      where:{projectId,researchCode:link.researchCode},
    })
    expect(participant.credentialHash).not.toContain(link.accessCredential)
    expect(participant.id).not.toBe(link.researchCode)
    expect(await db.surveyWaveAttempt.count({where:{waveId:wave1}})).toBe(1)
    expect((await db.surveyWave.findUniqueOrThrow({where:{id:wave1}})).startsCount).toBe(1)
  })
  it('finalizes one parent attempt and recovers idempotently without personalized report',async()=>{
    const input={publicId,waveId:wave1,...link,consent:true,consentVersion:1}
    const started=await startLinkedWave(input)
    const same=await startLinkedWave(input)
    expect(same.attemptId).toBe(started.attemptId)
    expect(same.recovered).toBe(true)
    expect(started.recovered).toBe(true)
    expect((await db.surveyWave.findUniqueOrThrow({where:{id:wave1}})).startsCount).toBe(1)
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
        [task.units[0].instrumentKey]:{subject:'math',reflection:{_surveyRefusal:true}},
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
  it('does not reveal frozen or future-scheduled T2 content before participant admission opens',async()=>{
    const draft=await createWave(ownerId,projectId,{
      requestId:randomUUID(),title:'未开放的后测内容不能提前显示',
      consentText:consent,instrumentIds:[toolIds.scale],linkageNoticeConfirmed:true,
    })
    await prepareWave(ownerId,projectId,draft.id,draft.revision)
    const frozenList=await listOwnLinkedWaves({publicId,...link})
    expect(frozenList.waves.some(w=>w.id===draft.id)).toBe(false)
    const starting=new Date(Date.now()+600_000).toISOString()
    const closing=new Date(Date.now()+3_600_000).toISOString()
    const scheduled=await createWave(ownerId,projectId,{
      requestId:randomUUID(),title:'未来时窗的后测尚不可显示',
      consentText:consent,instrumentIds:[toolIds.scale],
      linkageNoticeConfirmed:true,opensAt:starting,closesAt:closing,
    })
    await prepareWave(ownerId,projectId,scheduled.id,scheduled.revision)
    const current=await getWave(ownerId,projectId,scheduled.id)
    await openWave(ownerId,projectId,scheduled.id,current.revision)
    const futureList=await listOwnLinkedWaves({publicId,...link})
    expect(futureList.waves.some(w=>w.id===scheduled.id)).toBe(false)
    const publicInfo=await getPublicResearchInfo(publicId)
    expect(publicInfo.waves.some(w=>w.id===scheduled.id)).toBe(false)
    expect(publicInfo.waves.some(w=>w.id===draft.id)).toBe(false)
    expect(futureList.waves.some(w=>w.id===wave1)).toBe(true)
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

  it('rejects unbounded in-flight completion windows and mismatched replay payloads',async()=>{
    const id=randomUUID()
    const closesAt=new Date(Date.now()+86400000).toISOString()
    await expect(createWave(ownerId,projectId,{
      requestId:id,title:'不合法超长在途完成窗口',
      consentText:consent,instrumentIds:[toolIds.scale],
      closesAt,finishUntil:new Date(Date.now()+4*86400000).toISOString(),
    })).rejects.toThrow(/两小时/)
    const good=await createWave(ownerId,projectId,{
      requestId:id,title:'合法创建',
      consentText:consent,instrumentIds:[toolIds.scale],
    })
    expect(good.id).toBe(id)
    await expect(createWave(ownerId,projectId,{
      requestId:id,title:'同一ID却修改同意资料',
      consentText:consent,instrumentIds:[toolIds.form],
    })).rejects.toThrow(/冲突|不同内容/)
  })
  it('atomically reserves exactly one T4 parent Attempt when last research slot is contested',async()=>{
    const created=await createWave(ownerId,projectId,{
      requestId:randomUUID(),title:'T4 有限名额',
      consentText:consent,generalText:'谢谢参与',
      instrumentIds:[toolIds.scale],linkageNoticeConfirmed:true,quotaStarts:1,
      allowNewParticipants:true,
    })
    await prepareWave(ownerId,projectId,created.id,created.revision)
    const frozen=await getWave(ownerId,projectId,created.id)
    await expect(updateWave(ownerId,projectId,created.id,{
      revision:frozen.revision,title:frozen.title,consentText:frozen.consentText,
      instrumentIds:[toolIds.scale],linkageNoticeConfirmed:true,
    })).rejects.toThrow(/发布|版本/)
    const opened=await openWave(ownerId,projectId,created.id,frozen.revision)
    const requests=await Promise.allSettled(Array.from({length:2},()=>joinLinkedStudy({
      publicId:opened.publicId,waveId:created.id,entryToken:opened.entrySecret,
      consentVersion:1,consent:true,
    })))
    const winners=requests.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof joinLinkedStudy>>>=>r.status==='fulfilled')
    expect(winners).toHaveLength(1)
    expect(requests.filter(r=>r.status==='rejected')).toHaveLength(1)
    const identity=winners[0].value
    const recovered=await startLinkedWave({
      publicId:opened.publicId,waveId:created.id,
      researchCode:identity.researchCode,accessCredential:identity.accessCredential,
      consentVersion:1,consent:true,
    })
    expect(recovered).toMatchObject({attemptId:identity.attemptId,recovered:true})
    expect((await db.surveyWave.findUniqueOrThrow({where:{id:created.id}})).startsCount).toBe(1)
    expect(await db.surveyWaveAttempt.count({where:{waveId:created.id}})).toBe(1)
    expect(await db.surveyParticipant.count({where:{
      projectId,researchCode:identity.researchCode,
    }})).toBe(1)
  })
  it('serializes project PAUSE before linked recruitment and rejects expired publisher access',async()=>{
    const fresh=await wave('T5 项目状态并发验证',[toolIds.scale],true)
    let racing:Promise<boolean>|undefined
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM survey_projects WHERE id=${projectId} FOR UPDATE`
      racing=joinLinkedStudy({
        publicId:fresh.publicId,waveId:fresh.id,entryToken:fresh.entrySecret,
        consentVersion:1,consent:true,
      }).then(()=>true,()=>false)
      // Recruitment waits for the project lock and cannot commit a new Attempt
      // after PAUSED was committed.
      await new Promise(resolve=>setTimeout(resolve,75))
      await tx.surveyProject.update({where:{id:projectId},data:{
        status:'PAUSED',revision:{increment:1},
      }})
    })
    if(!racing)throw new Error('Recruitment admission task not started')
    expect(await racing).toBe(false)
    expect(await db.surveyWaveAttempt.count({where:{waveId:fresh.id}})).toBe(0)
    const current=await db.surveyProject.findUniqueOrThrow({where:{id:projectId}})
    await transitionResearchProject({
      actorUserId:ownerId,projectId,revision:current.revision,action:'RESUME',
    })
    await db.user.update({where:{id:ownerId},data:{expiresAt:new Date(Date.now()-60000)}})
    await expect(joinLinkedStudy({
      publicId:fresh.publicId,waveId:fresh.id,entryToken:fresh.entrySecret,
      consentVersion:1,consent:true,
    })).rejects.toThrow()
    await db.user.update({where:{id:ownerId},data:{expiresAt:null}})
  })
  it('serializes simultaneous Wave creation without upgrading two shared project locks',async()=>{
    const requests=Array.from({length:3},(_,i)=>({
      requestId:randomUUID(),title:'并行创建波次 '+i,
      consentText:consent,instrumentIds:[toolIds.scale],linkageNoticeConfirmed:true,
    }))
    const result=await Promise.all(requests.map(body=>createWave(ownerId,projectId,body)))
    expect(new Set(result.map(w=>w.id)).size).toBe(3)
    const ordinals=result.map(w=>w.ordinal).sort((a,b)=>a-b)
    expect(ordinals[1]).toBe(ordinals[0]+1)
    expect(ordinals[2]).toBe(ordinals[1]+1)
    expect(await db.surveyWave.count({where:{id:{in:result.map(w=>w.id)}}})).toBe(3)
  })
  it('serializes an in-flight FINAL behind a committed Wave HARD_STOP',async()=>{
    const w=await wave('紧急终止与提交并发',[toolIds.scale],true)
    const person=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:person.attemptId,
      researchCode:person.researchCode,accessCredential:person.accessCredential,
    })
    let finalized:Promise<boolean>|undefined
    await db.$transaction(async tx=>{
      // A second connection holds the Wave write lock. FINAL must not read a
      // pre-stop Wave while completing its separate Attempt transaction.
      await tx.$queryRaw`SELECT id FROM survey_waves WHERE id=${w.id} FOR UPDATE`
      finalized=submitResearchFinal({
        publicId:w.publicId,attemptId:person.attemptId,
        researchCode:person.researchCode,accessCredential:person.accessCredential,
        submissionId:randomUUID(),
        answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
      }).then(()=>true,()=>false)
      await new Promise(resolve=>setTimeout(resolve,100))
      const stopped=new Date()
      await tx.surveyWave.update({where:{id:w.id},data:{
        status:'CLOSED',hardStopAt:stopped,finishUntil:stopped,
        revision:{increment:1},
      }})
    })
    expect(finalized).toBeDefined()
    expect(await finalized).toBe(false)
    expect(await db.surveyWaveFinal.count({where:{attemptId:person.attemptId}})).toBe(0)
    expect((await db.surveyWaveAttempt.findUniqueOrThrow({
      where:{id:person.attemptId},
    })).status).toBe('STARTED')
  })
  it('can HARD_STOP after ordinary CLOSE while in-flight FINAL remains possible',async()=>{
    const w=await wave('关闭后再紧急终止',[toolIds.scale],true)
    const participant=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
    })
    const current=await getWave(ownerId,projectId,w.id)
    const closed=await transitionWave(ownerId,projectId,w.id,current.revision,'CLOSE')
    expect(closed.status).toBe('CLOSED')
    const withinGrace=await getWave(ownerId,projectId,w.id)
    expect(withinGrace.finishUntil!.getTime()).toBeGreaterThan(Date.now())
    const stopped=await transitionWave(ownerId,projectId,w.id,withinGrace.revision,'HARD_STOP')
    expect(stopped.status).toBe('CLOSED')
    const latest=await getWave(ownerId,projectId,w.id)
    expect(latest.hardStopAt).not.toBeNull()
    await expect(transitionWave(ownerId,projectId,w.id,latest.revision,'HARD_STOP'))
      .rejects.toThrow()
    await expect(submitResearchFinal({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
      submissionId:randomUUID(),
      answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
    })).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({where:{attemptId:participant.attemptId}})).toBe(0)
  })
  it('derives raw and score Wide variables from a frozen Wave with zero FINALs',async()=>{
    const w=await wave('冻结变量但没有完成答卷',[toolIds.scale],true)
    const person=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const source=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],includeWideSchema:true,
    })
    expect(source.completeAttempts).toBe(0)
    expect(source.raw).toHaveLength(0)
    expect(source.scores).toHaveLength(0)
    expect(source.codebook.map(x=>x.itemKey).sort()).toEqual(['itemone','itemtwo'])
    expect(source.scoreColumns.map(x=>x.measurement.scoreKey).sort()).toEqual(['motivation','strategy'])
    expect(source.attendance).toMatchObject([{
      researchCode:person.researchCode,waveId:w.id,status:'STARTED',
    }])
    const raw=rawWideExport(projectId,source)
    const score=exportWide(projectId,source.scores,source.attendance,source.scoreColumns)
    const rawLong=rawLongExport(projectId,source)
    const scoreLong=exportLong(projectId,source.scores,source.attendance,source.scoreColumns)
    for(const item of [rawLong,scoreLong]){
      expect(item.manifest.rowCount).toBe(2)
      expect(item.csv).toContain(person.researchCode)
      expect(item.csv).toContain('ABANDONED')
    }
    for(const result of [raw,score]){
      expect(result.manifest.rowCount).toBe(1)
      expect(result.manifest.columnCount).toBe(5)
      expect(result.csv).toContain(person.researchCode)
      expect(result.csv).toContain('"ABANDONED"')
      expect(result.csv).not.toContain('"NO_WAVE"')
    }
    // A Wave with zero FINALs must still export the participant's incomplete
    // status in a separate, signed attendance page; it cannot vanish at page 1.
    const token=generateToken({
      userId:ownerId,username:'synthetic-researcher',role:'STUDENT',
      accountDomain:'SURVEY',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),
    })
    const req={headers:{cookie:'huisurvey_research_session='+token},
      user:{userId:ownerId,tokenVersion:0,username:'synthetic-researcher',
        role:'STUDENT',platformRole:'STANDARD',mustChangePassword:false,
        accountDomain:'SURVEY'}} as unknown as Request
    const initial=await createSurveyExport(req,{projectId,format:'RAW_WAVE',waveId:w.id})
    expect(initial.manifest.batch.phase).toBe('VERIFIED_FINAL')
    expect(initial.nextCursor).toBeTruthy()
    const missing=await createSurveyExport(req,{
      projectId,format:'RAW_WAVE',waveId:w.id,cursor:initial.nextCursor!,
    })
    expect(missing.manifest.batch.phase).toBe('NON_FINAL_PARTICIPATION')
    expect(missing.nextCursor).toBeNull()
    const artifact=await downloadSurveyExport(req,{projectId,exportId:missing.id})
    expect(artifact.csv).toContain(person.researchCode)
    expect(artifact.csv).toContain('ABANDONED')
    expect(missing.manifest.rowCount).toBe(2)
  })

  it('projects multiple verified FINALs from one frozen Publication without duplicated schema columns',async()=>{
    const w=await wave('同一冻结定义下的多份 FINAL',[toolIds.scale],true)
    const attempts:string[]=[]
    for(let i=0;i<2;i++){
      const person=await joinLinkedStudy({
        publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
        consent:true,consentVersion:1,
      })
      attempts.push(person.attemptId)
      const task=await getOwnResearchTask({publicId:w.publicId,attemptId:person.attemptId,
        researchCode:person.researchCode,accessCredential:person.accessCredential})
      await submitResearchFinal({
        publicId:w.publicId,attemptId:person.attemptId,
        researchCode:person.researchCode,accessCredential:person.accessCredential,
        submissionId:randomUUID(),
        answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
      })
    }
    const source=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],includeWideSchema:true,
    })
    expect(source.completeAttempts).toBe(2)
    // The same tested FINALs can be read across a stable keyset/snapshot
    // without skipping or duplicating equal completion timestamps.
    const first=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],maxFinals:1,pageMode:true,
      includeWideSchema:true,includeAttendance:false,
    })
    expect(first.completeAttempts).toBe(1)
    expect(first.nextFinalCursor).not.toBeNull()
    const second=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],maxFinals:1,pageMode:true,
      includeWideSchema:true,includeAttendance:false,
      afterFinal:{id:first.nextFinalCursor!.id,
        completedAt:new Date(first.nextFinalCursor!.completedAt)},
      snapshotCutOff:new Date(first.cutOff),
      expectedSourceRevision:first.sourceRevision,
      expectedFinalCount:first.sourceFinalCount??undefined,
    })
    expect(second.completeAttempts).toBe(1)
    expect(second.nextFinalCursor).toBeNull()
    expect(new Set([...first.raw,...second.raw].map(row=>row.attemptId)))
      .toEqual(new Set(attempts))
    expect(new Set(source.scores.map(s=>s.attemptId))).toEqual(new Set(attempts))
    expect(source.codebook).toHaveLength(2)
    expect(source.scoreColumns).toHaveLength(2)
    expect(rawWideExport(projectId,source).manifest.rowCount).toBe(2)
    expect(exportWide(projectId,source.scores,source.attendance,source.scoreColumns).manifest.rowCount).toBe(2)
  })


  it('rotates and revokes project-scoped recruitment without revoking the participant secret',async()=>{
    const current=await wave('招募密钥管理',[toolIds.scale],true)
    const open=await db.surveyWave.findUniqueOrThrow({where:{id:current.id}})
    const rotated=await updateWaveEntryToken({
      actorUserId:ownerId,projectId,waveId:current.id,
      revision:open.revision,action:'ROTATE',
    })
    expect(rotated.entrySecret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await expect(updateWaveEntryToken({
      actorUserId:randomUUID(),projectId,waveId:current.id,
      revision:rotated.revision,action:'ROTATE',
    })).rejects.toThrow()
    await expect(updateWaveEntryToken({
      actorUserId:ownerId,projectId,waveId:current.id,
      revision:open.revision,action:'ROTATE',
    })).rejects.toThrow()
    expect(rotated.researchUrl).toContain('#entry='+rotated.entrySecret)
    expect(rotated.entrySecret).not.toBe(current.entrySecret)
    await expect(joinLinkedStudy({
      publicId:current.publicId,waveId:current.id,entryToken:current.entrySecret,
      consent:true,consentVersion:1,
    })).rejects.toThrow()
    const participant=await joinLinkedStudy({
      publicId:current.publicId,waveId:current.id,entryToken:rotated.entrySecret!,
      consent:true,consentVersion:1,
    })
    const revoked=await updateWaveEntryToken({
      actorUserId:ownerId,projectId,waveId:current.id,
      revision:rotated.revision,action:'REVOKE',
    })
    expect(revoked.revoked).toBe(true)
    await expect(joinLinkedStudy({
      publicId:current.publicId,waveId:current.id,entryToken:rotated.entrySecret!,
      consent:true,consentVersion:1,
    })).rejects.toThrow()
    expect(await recoverLinkedResearchIdentity({
      projectId,researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })).toHaveProperty('researchCode',participant.researchCode)
    // Client is still able to request withdrawal after explicitly revoking
    // future access. The revoked proof cannot read tasks or other answers.
    await revokeLinkedResearchAccess({
      projectId,researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })
    await expect(getOwnResearchTask({
      publicId:current.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })).rejects.toThrow()
    const withdrawn=await withdrawLinkedResearchData({
      projectId,researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })
    expect(withdrawn).toMatchObject({status:'WITHDRAWN',excludedAttempts:1})
    const attempt=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:participant.attemptId}})
    expect(attempt.status).toBe('WITHDRAWN')
    const evidence=await db.surveyEvent.findMany({
      where:{projectId,action:{in:['WAVE_ENTRY_TOKEN_ROTATED','WAVE_ENTRY_TOKEN_REVOKED',
        'PARTICIPANT_ACCESS_REVOKED','PARTICIPANT_DATA_WITHDRAWAL']}},
    })
    expect(evidence.map(e=>e.action)).toEqual(expect.arrayContaining([
      'WAVE_ENTRY_TOKEN_ROTATED','WAVE_ENTRY_TOKEN_REVOKED',
      'PARTICIPANT_ACCESS_REVOKED','PARTICIPANT_DATA_WITHDRAWAL',
    ]))
    expect(JSON.stringify(evidence)).not.toContain(participant.accessCredential)
  })


  it('retains valid FINAL and linked code after REVOKE_ACCESS, not after WITHDRAW_DATA',async()=>{
    const w=await wave('访问撤销但保留有效样本',[toolIds.scale],true)
    const participant=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
    })
    await submitResearchFinal({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
      submissionId:randomUUID(),
      answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
    })
    const before=(await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id)
    expect(before).toMatchObject({finalCompleted:1,uniqueLinkedCodes:1})
    await revokeLinkedResearchAccess({
      projectId,researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })
    const kept=(await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id)
    expect(kept).toMatchObject({finalCompleted:1,uniqueLinkedCodes:1})
    expect((await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],
    })).completeAttempts).toBe(1)
    await withdrawLinkedResearchData({
      projectId,researchCode:participant.researchCode,
      accessCredential:participant.accessCredential,
    })
    const excluded=(await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id)
    expect(excluded).toMatchObject({finalCompleted:0,uniqueLinkedCodes:0,excluded:1})
    expect((await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],
    })).completeAttempts).toBe(0)
    // Immutable source remains auditable; withdrawal excludes without deleting FINAL.
    expect(await db.surveyWaveFinal.count({where:{attemptId:participant.attemptId}})).toBe(1)
  })
  it('reviews sample quality with durable reasons, exact cohort exclusion and immutable FINAL',async()=>{
    const w=await wave('研究样本质量可审计复核',[toolIds.scale],true)
    const person=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consentVersion:1,consent:true,
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:person.attemptId,
      researchCode:person.researchCode,accessCredential:person.accessCredential,
    })
    await submitResearchFinal({
      publicId:w.publicId,attemptId:person.attemptId,
      researchCode:person.researchCode,accessCredential:person.accessCredential,
      submissionId:randomUUID(),
      answers:{[task.units[0].instrumentKey]:{itemone:'o3',itemtwo:'o4'}},
    })
    const before=(await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id)!
    expect(before).toMatchObject({finalCompleted:1,analysisIncluded:1,qualityExcluded:0})
    const initial=await listSampleQuality(ownerId,projectId,1)
    expect(initial.list.find(x=>x.attemptId===person.attemptId))
      .toMatchObject({verdict:'INCLUDED',revision:0})
    await expect(setSampleQuality({actorUserId:randomUUID(),projectId,
      attemptId:person.attemptId,revision:0,verdict:'EXCLUDED',reason:'资格不符'}))
      .rejects.toThrow()
    const excluded=await setSampleQuality({actorUserId:ownerId,projectId,
      attemptId:person.attemptId,revision:0,verdict:'EXCLUDED',reason:'预定质量标准未通过'})
    expect(excluded.revision).toBe(1)
    const after=(await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id)!
    expect(after).toMatchObject({finalCompleted:1,analysisIncluded:0,qualityExcluded:1,uniqueLinkedCodes:0})
    const filtered=await loadSurveySource({actorUserId:ownerId,projectId,
      waveIds:[w.id],includeWideSchema:true})
    expect(filtered.completeAttempts).toBe(0)
    expect(rawWideExport(projectId,filtered).csv).toContain('QUALITY_EXCLUDED')
    await expect(setSampleQuality({actorUserId:ownerId,projectId,
      attemptId:person.attemptId,revision:0,verdict:'INCLUDED',reason:'旧版本冲突'}))
      .rejects.toThrow()
    await setSampleQuality({actorUserId:ownerId,projectId,
      attemptId:person.attemptId,revision:1,verdict:'INCLUDED',reason:'复核后满足纳入标准'})
    expect((await waveOverview(ownerId,projectId)).waves.find(x=>x.id===w.id))
      .toMatchObject({finalCompleted:1,analysisIncluded:1,qualityExcluded:0})
    expect(await db.surveyEvent.count({where:{
      projectId,action:'RESEARCH_SAMPLE_QUALITY_REVIEWED',
      metadata:{path:['attemptId'],equals:person.attemptId},
    }})).toBe(2)
    const history=await listSampleQualityHistory(ownerId,projectId,person.attemptId,1)
    expect(history.list).toMatchObject([
      {revision:2,previousVerdict:'EXCLUDED',verdict:'INCLUDED',reason:'复核后满足纳入标准'},
      {revision:1,previousVerdict:'INCLUDED',verdict:'EXCLUDED',reason:'预定质量标准未通过'},
    ])
    await expect(listSampleQualityHistory(randomUUID(),projectId,person.attemptId,1))
      .rejects.toThrow()
    expect(await db.surveyWaveFinal.count({where:{attemptId:person.attemptId}})).toBe(1)
  })
  it('bounds one-Wave FINAL exports by half-open completion window and records selection',async()=>{
    const w=await wave('单波次分段导出',[toolIds.scale],true)
    const participant=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
    })
    await submitResearchFinal({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
      submissionId:randomUUID(),
      answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
    })
    const future=new Date(Date.now()+60_000)
    const included=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],includeWideSchema:true,
      completedBefore:future,
    })
    expect(included.completeAttempts).toBe(1)
    const excluded=await loadSurveySource({
      actorUserId:ownerId,projectId,waveIds:[w.id],includeWideSchema:true,
      completedFrom:future,
    })
    expect(excluded.completeAttempts).toBe(0)
    expect(excluded.codebook).toHaveLength(2)
    const token=generateToken({
      userId:ownerId,username:'synthetic-researcher',role:'STUDENT',
      accountDomain:'SURVEY',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),
    })
    const req={headers:{cookie:'huisurvey_research_session='+token},
      user:{userId:ownerId,tokenVersion:0,username:'synthetic-researcher',
        role:'STUDENT',platformRole:'STANDARD',mustChangePassword:false,
        accountDomain:'SURVEY'}} as unknown as Request
    const ticket=await createSurveyExport(req,{
      projectId,format:'RAW_WAVE',waveId:w.id,completedBefore:future.toISOString(),
    })
    expect(ticket.manifest.selection.completedBefore).toBe(future.toISOString())
    expect(ticket.manifest.completedFinalCount).toBe(1)
    await expect(createSurveyExport(req,{
      projectId,format:'SCORE_LONG',completedBefore:future.toISOString(),
    })).rejects.toThrow(/单波次/)
  })


  it('freezes, answers, audits and privacy-filters an actual V2 Form FINAL in PostgreSQL',async()=>{
    const professional:FormDraft={schemaVersion:2,pages:[{pageKey:'formv2',title:'研究任务',questions:[
      {itemKey:'date',type:'DATE',prompt:'日期',required:true,options:[],rows:[]},
      {itemKey:'rank',type:'RANK_ORDER',prompt:'排序',required:true,rows:[],
        options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}]},
      {itemKey:'slider',type:'SLIDER',prompt:'滑块',required:true,rows:[],
        options:[],min:0,max:10,step:2,integerOnly:true},
      {itemKey:'total',type:'CONSTANT_SUM',prompt:'总和',required:true,rows:[],
        total:10,integerOnly:true,options:[{optionKey:'a',label:'A'},{optionKey:'b',label:'B'}]},
      {itemKey:'choice',type:'MULTIPLE',prompt:'选项',required:true,rows:[],
        options:[{optionKey:'a',label:'A'},{optionKey:'other',label:'其他'},
          {optionKey:'none',label:'无'}],
        otherOptionKey:'other',otherMaxLength:100,exclusiveOptionKeys:['none']},
    ]}]}
    const iid=await instrument('FORM',professional)
    const w=await wave('Form V2 真实 PostgreSQL 作答',[iid],true)
    const person=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,consent:true,consentVersion:1,
    })
    const proof={publicId:w.publicId,attemptId:person.attemptId,
      researchCode:person.researchCode,accessCredential:person.accessCredential}
    const task=await getOwnResearchTask(proof)
    const unit=task.units[0]
    expect(unit.kind).toBe('FORM')
    expect(JSON.stringify(unit)).toContain('otherOptionKey')
    expect(JSON.stringify(unit)).not.toContain('privateScoring')
    const baseline={
      date:'2024-02-29',rank:['b','a'],slider:2,total:{a:0,b:10},
      choice:['a','other'],'choice:other':'个人敏感自由文字',
    }
    await expect(submitResearchFinal({
      ...proof,submissionId:randomUUID(),answers:{[unit.instrumentKey]:{
        ...baseline,choice:['none','a'],
      }},
    })).rejects.toThrow()
    expect(await db.surveyWaveFinal.count({where:{attemptId:person.attemptId}})).toBe(0)
    const complete=await submitResearchFinal({
      ...proof,submissionId:randomUUID(),answers:{[unit.instrumentKey]:baseline},
    })
    expect(complete.status).toBe('COMPLETED')
    expect(await db.surveyWaveFinal.count({where:{attemptId:person.attemptId}})).toBe(1)
    const source=await loadSurveySource({actorUserId:ownerId,projectId,
      waveIds:[w.id],includeWideSchema:true})
    // Item paging must never materialize all unrelated V2 questions or scores.
    const projected=await loadSurveySource({actorUserId:ownerId,projectId,
      waveIds:[w.id],maxFinals:1,pageMode:true,stableIdCursor:true,
      includeWideSchema:true,includeAttendance:false,
      selectRaw:{instrumentKey:unit.instrumentKey,itemKey:'rank'},selectScore:false})
    expect(projected.completeAttempts).toBe(1)
    expect(projected.raw.map(r=>r.itemKey)).toEqual(['rank'])
    expect(projected.scores).toEqual([])
    expect(projected.codebook.some(r=>r.itemKey==='choice:other')).toBe(true)
    const other=source.raw.find(r=>r.itemKey==='choice:other')
    expect(other?.value).toBe('个人敏感自由文字')
    expect(source.codebook.find(row=>row.itemKey==='choice:other'))
      .toMatchObject({formSchemaVersion:2,responseType:'OTHER_TEXT',valueEncoding:'TEXT'})
    expect(source.codebook.find(row=>row.itemKey==='rank'))
      .toMatchObject({formSchemaVersion:2,valueEncoding:'JSON_STRING_ARRAY'})
    expect(source.codebook.find(row=>row.itemKey==='total'))
      .toMatchObject({formSchemaVersion:2,valueEncoding:'JSON_NUMBER_OBJECT'})
    // PR4 page aggregation must understand PR2's typed Form V2 encodings.
    const rankPaged=await describeSurveyWaveItemPaged({
      actorUserId:ownerId,projectId,waveId:w.id,
      instrumentKey:unit.instrumentKey,itemKey:'rank',
    })
    expect(rankPaged).toMatchObject({analysisFinalCount:1,respondentN:1,complete:true})
    expect(rankPaged.frequencies).toContainEqual({value:'b@rank1',count:1})
    const totalPaged=await describeSurveyWaveItemPaged({
      actorUserId:ownerId,projectId,waveId:w.id,
      instrumentKey:unit.instrumentKey,itemKey:'total',
    })
    expect(totalPaged).toMatchObject({analysisFinalCount:1,respondentN:1,
      frequencies:[],numericMean:null})
    const sliderPaged=await describeSurveyWaveItemPaged({
      actorUserId:ownerId,projectId,waveId:w.id,
      instrumentKey:unit.instrumentKey,itemKey:'slider',
    })
    expect(sliderPaged).toMatchObject({analysisFinalCount:1,respondentN:1,numericMean:2})
    await expect(describeSurveyWaveItemPaged({
      actorUserId:ownerId,projectId,waveId:w.id,
      instrumentKey:unit.instrumentKey,itemKey:'choice:other',
    })).rejects.toThrow(/敏感自由文本/)
    expect(rawLongExport(projectId,source,w.id).csv).toContain('个人敏感自由文字')
    const token=generateToken({
      userId:ownerId,username:'synthetic-researcher',role:'STUDENT',
      accountDomain:'SURVEY',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),
    })
    const req={headers:{cookie:'huisurvey_research_session='+token},
      user:{userId:ownerId,tokenVersion:0,username:'synthetic-researcher',
        role:'STUDENT',platformRole:'STANDARD',mustChangePassword:false,
        accountDomain:'SURVEY'}} as unknown as Request
    const defaultTicket=await createSurveyExport(req,{projectId,format:'RAW_WAVE',waveId:w.id})
    const safe=await downloadSurveyExport(req,{projectId,exportId:defaultTicket.id})
    expect(safe.csv).not.toContain('个人敏感自由文字')
    expect(JSON.stringify(safe.codebook)).not.toContain('OTHER_TEXT')
    const explicitTicket=await createSurveyExport(req,{
      projectId,format:'RAW_WAVE',waveId:w.id,includeFreeText:true,
    })
    const permitted=await downloadSurveyExport(req,{projectId,exportId:explicitTicket.id})
    expect(permitted.csv).toContain('个人敏感自由文字')
  })
  it('persists frozen per-item Scale timing and exports real millisecond columns',async()=>{
    const timed:ScaleDraft={...structuredClone(scale),presentationMode:'ONE_BY_ONE'}
    const draftId=await instrument('SCALE',timed)
    const w=await wave('逐题计时量表真实 FINAL',[draftId],true)
    const linked=await joinLinkedStudy({publicId:w.publicId,waveId:w.id,
      entryToken:w.entrySecret,consent:true,consentVersion:1})
    const task=await getOwnResearchTask({publicId:w.publicId,attemptId:linked.attemptId,
      researchCode:linked.researchCode,accessCredential:linked.accessCredential})
    expect(task.units[0]).toMatchObject({kind:'SCALE',presentationMode:'ONE_BY_ONE'})
    const instrumentKey=task.units[0].instrumentKey
    const answers={[instrumentKey]:{itemone:'o4',itemtwo:'o3'}}
    const rows={
      [instrumentKey]:{
        itemone:{schemaVersion:1 as const,firstResponseMs:1234,activeTimeMs:2234,
          changeCount:1,revisitCount:1,visits:2,
          interrupted:false,recoveredWithoutClock:false},
        itemtwo:{schemaVersion:1 as const,firstResponseMs:null,activeTimeMs:640,
          changeCount:0,revisitCount:0,visits:1,
          interrupted:true,recoveredWithoutClock:true},
      },
    }
    const final=await submitResearchFinal({publicId:w.publicId,attemptId:linked.attemptId,
      researchCode:linked.researchCode,accessCredential:linked.accessCredential,
      submissionId:randomUUID(),answers,itemTimings:rows})
    expect(final.status).toBe('COMPLETED')
    const verified=await loadSurveySource({actorUserId:ownerId,projectId,
      waveIds:[w.id],includeWideSchema:true})
    const one=verified.raw.find(x=>x.itemKey==='itemone')
    const two=verified.raw.find(x=>x.itemKey==='itemtwo')
    expect(one?.itemTiming).toEqual(rows[instrumentKey].itemone)
    expect(two?.itemTiming).toEqual(rows[instrumentKey].itemtwo)
    expect(one?.attemptStartedAt).toMatch(/^20\d{2}-/)
    const dictionary=verified.codebook.filter(c=>c.instrumentKey===instrumentKey)
    expect(dictionary.every(c=>c.scalePresentationMode==='ONE_BY_ONE'
      &&c.timingContract==='SURVEY_SCALE_ITEM_TIMING_V1')).toBe(true)
    const raw=rawLongExport(projectId,verified,w.id)
    expect(raw.csv).toContain('first_response_ms')
    expect(raw.csv).toContain('"1234"')
    expect(raw.csv).toContain('RECOVERED_NO_FIRST_RESPONSE')
    const wide=rawWideExport(projectId,verified)
    expect(wide.csv).toContain('__first_response_ms')
    expect(wide.csv).toContain('"1234"')
    expect(wide.manifest.rowCount).toBe(1)
    const ticketToken=generateToken({
      userId:ownerId,username:'synthetic-researcher',role:'STUDENT',
      accountDomain:'SURVEY',tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000),
    })
    const req={headers:{cookie:'huisurvey_research_session='+ticketToken},
      user:{userId:ownerId,tokenVersion:0,username:'synthetic-researcher',
        role:'STUDENT',platformRole:'STANDARD',mustChangePassword:false,
        accountDomain:'SURVEY'}} as unknown as Request
    const grant=await createSurveyExport(req,{projectId,format:'RAW_WAVE',waveId:w.id})
    expect(grant.manifest.timingProvenance).toContain('BROWSER_OBSERVED')
    const downloaded=await downloadSurveyExport(req,{projectId,exportId:grant.id})
    expect(downloaded.csv).toContain('1234')
    expect(JSON.stringify(downloaded.codebook)).toContain('SURVEY_SCALE_ITEM_TIMING_V1')
  })
  it('does not commit a FINAL against a credential revoked during the transaction',async()=>{
    const w=await wave('撤销凭证与提交串行验证',[toolIds.scale],true)
    const participant=await joinLinkedStudy({
      publicId:w.publicId,waveId:w.id,entryToken:w.entrySecret,
      consent:true,consentVersion:1,
    })
    const person=await db.surveyParticipant.findFirstOrThrow({
      where:{projectId,researchCode:participant.researchCode},
    })
    const task=await getOwnResearchTask({
      publicId:w.publicId,attemptId:participant.attemptId,
      researchCode:participant.researchCode,accessCredential:participant.accessCredential,
    })
    let pending:Promise<boolean>|undefined
    await db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM survey_participants WHERE id=${person.id} FOR UPDATE`
      pending=submitResearchFinal({
        publicId:w.publicId,attemptId:participant.attemptId,
        researchCode:participant.researchCode,
        accessCredential:participant.accessCredential,
        submissionId:randomUUID(),
        answers:{[task.units[0].instrumentKey]:{itemone:'o4',itemtwo:'o4'}},
      }).then(()=>true,()=>false)
      await new Promise(resolve=>setTimeout(resolve,90))
      await tx.surveyParticipant.update({where:{id:person.id},
        data:{status:'REVOKED',credentialRevokedAt:new Date()}})
    })
    expect(pending).toBeDefined()
    expect(await pending).toBe(false)
    expect(await db.surveyWaveFinal.count({where:{attemptId:participant.attemptId}})).toBe(0)
  })


})
