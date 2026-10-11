import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import type { Request } from 'express'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { createDraft,updateDraft } from '../../modules/survey/builder.service'
import { createWave,getWave } from '../../modules/survey/waves.service'
import { prepareWave,openWave } from '../../modules/survey/waves.publish'
import { startSingleUnlinkedWave } from '../../modules/survey/admission.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { saveSurveyCheckpoint,readSurveyCheckpoint,cleanupExpiredSurveyCheckpoints } from '../../modules/survey/checkpoint.service'
import { screenOutResearchAttempt } from '../../modules/survey/flow.screen-out.service'
import { submitResearchFinal } from '../../modules/survey/final.service'
import { withdrawSingleResearchAttempt } from '../../modules/survey/identity.service'
import { describeSurveyFlowOperations } from '../../modules/survey/analytics.flow-operations'
import { generateToken } from '../../utils/jwt'
import type { FormDraft,ScaleDraft } from '../../modules/survey/builder.definition'
import type { SurveyFlowDraft } from '../../modules/survey/flow.definition'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
const key=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,16)
const screening:FormDraft={schemaVersion:1,pages:[{pageKey:'first',title:'研究筛查',
  questions:[{itemKey:'eligible',type:'SINGLE',prompt:'愿意阅读研究材料？',
    required:true,rows:[],options:[
      {optionKey:'yes',label:'愿意'},{optionKey:'no',label:'不愿意'},
    ]}]}]}
const scale:ScaleDraft={schemaVersion:1,respondentType:'teacher_self_report',
  aggregation:'mean',responseOptions:[1,2,3,4,5].map(n=>({
    optionKey:'o'+n,label:String(n),score:n,
  })),
  dimensions:[{dimensionKey:'attitude',label:'教学 AI 态度',direction:'descriptive'}],
  items:[{itemKey:'engagement',prompt:'我愿意使用教学辅助材料',required:true,
    reverse:false,dimensionKeys:['attitude']}],
}
const draftFlow:SurveyFlowDraft={
  schemaVersion:1,embeddedData:[],
  experiment:{experimentKey:'weighted_quota',linkedPolicy:'RERANDOMIZE',groups:[
    {groupKey:'condition_a',weight:1,materialTitle:'A组研究材料',materialBody:'材料 A'},
    {groupKey:'condition_b',weight:1,materialTitle:'B组研究材料',materialBody:'材料 B'},
  ]},
  blocks:[
    {blockKey:'screen',kind:'INSTRUMENT',instrumentKey:'screening'},
    {blockKey:'stop',kind:'END',termination:'SCREEN_OUT',when:{
      op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screening',itemKey:'eligible'},value:'no',
    }},
    {blockKey:'attitude',kind:'INSTRUMENT',instrumentKey:'measure'},
  ],
}

suite('Survey PR4 real PG: bounded quota, opt-in encrypted checkpoint, exact N',()=>{
  let db:PrismaClient,owner='',project='',publicId='',waveId='',entryToken=''
  let first:{attemptId:string;accessCredential:string}
  let second:{attemptId:string;accessCredential:string}
  const prev={
    publication:process.env.SURVEY_PUBLICATION_ENABLED,
    workspace:process.env.SURVEY_WORKSPACE_ENABLED,
  }
  beforeAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED='true'
    process.env.SURVEY_WORKSPACE_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
    const admin=await db.user.create({data:{
      username:key('sys'),passwordHash:'integration-only',role:'ADMIN',
      platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY',
    }})
    const researcher=await db.user.create({data:{
      username:key('res'),passwordHash:'integration-only',role:'STUDENT',
      accountDomain:'SURVEY',
    }})
    owner=researcher.id
    const login=key('research')
    await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin.id}})
    await db.surveyMfaCredential.create({data:{
      userId:owner,enabled:true,secretCipher:'integration-only',
    }})
    project=randomUUID()
    await db.surveyProject.create({data:{
      id:project,ownerUserId:owner,title:'可选加密暂存与实验组配额',
      collectionMode:'SINGLE_UNLINKED',status:'DRAFT',
    }})
    const tool=async(kind:'FORM'|'SCALE',instrumentKey:string,
      definition:FormDraft|ScaleDraft)=>{
      const id=randomUUID()
      await createDraft(owner,project,{requestId:id,kind,instrumentKey,title:instrumentKey})
      await updateDraft(owner,project,id,{revision:0,title:instrumentKey,definition})
      return id
    }
    const ids=[await tool('FORM','screening',screening),
      await tool('SCALE','measure',scale)]
    const wave=await createWave(owner,project,{
      requestId:randomUUID(),title:'配额与临时暂存实验',
      consentText:'本研究将随机分组；只有您主动选择保存时，未完成答案才会短时加密保存。',
      instrumentIds:ids,flowDefinition:draftFlow,
      quotaPolicy:{schemaVersion:1,groupLimits:{condition_a:1,condition_b:1}},
      checkpointPolicy:{schemaVersion:1,enabled:true,ttlHours:2},
    })
    await prepareWave(owner,project,wave.id,wave.revision)
    const frozen=await getWave(owner,project,wave.id)
    const open=await openWave(owner,project,wave.id,frozen.revision)
    waveId=wave.id;publicId=open.publicId;entryToken=open.entrySecret
  })
  afterAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED=prev.publication
    process.env.SURVEY_WORKSPACE_ENABLED=prev.workspace
    await db?.$disconnect()
  })
  const proof=(participant:{attemptId:string;accessCredential:string})=>({
    publicId,attemptId:participant.attemptId,accessCredential:participant.accessCredential,
  })
  const researcherReq=(secondsOld=1)=>({
    headers:{cookie:'huisurvey_research_session='+generateToken({
      userId:owner,username:'researcher',role:'STUDENT',accountDomain:'SURVEY',
      tokenVersion:0,mfaVerifiedAt:Math.floor(Date.now()/1000)-secondsOld,
    })},
    user:{userId:owner,tokenVersion:0,username:'researcher',role:'STUDENT',
      platformRole:'STANDARD',mustChangePassword:false,accountDomain:'SURVEY'},
  }) as unknown as Request
  it('atomically accepts exactly two participants, without leaking a third quota/Attempt',async()=>{
    const batch=await Promise.allSettled(Array.from({length:5},()=>
      startSingleUnlinkedWave({publicId,waveId,entryToken,
        consent:true,consentVersion:1})))
    const admitted=batch.filter((r):r is PromiseFulfilledResult<
      Awaited<ReturnType<typeof startSingleUnlinkedWave>>>=>r.status==='fulfilled')
    expect(admitted).toHaveLength(2)
    expect(batch.filter(r=>r.status==='rejected')).toHaveLength(3)
    ;[first,second]=admitted.map(r=>r.value)
    const buckets=await db.surveyExperimentQuotaBucket.findMany({where:{waveId}})
    expect(buckets.map(b=>b.assignedCount).sort()).toEqual([1,1])
    expect(await db.surveyWaveAttempt.count({where:{waveId}})).toBe(2)
    expect((await db.surveyWave.findUniqueOrThrow({where:{id:waveId}})).startsCount).toBe(2)
    const task=await getOwnResearchTask(proof(first))
    expect(task.checkpointPolicy).toMatchObject({enabled:true,ttlHours:2})
    expect(task.flow?.selectedMaterial).toBeTruthy()
    expect(JSON.stringify(task)).not.toContain('groupKey')
    const saved=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:first.attemptId}})
    expect(saved.flowAssignmentCipher).toBeTruthy()
  })
  it('uses encrypted per-Attempt CAS and denies a stale write or forged credential',async()=>{
    const initial=await readSurveyCheckpoint(proof(first))
    expect(initial).toEqual({enabled:true,revision:0,checkpoint:null})
    const saved=await saveSurveyCheckpoint(proof(first),{
      revision:0,answers:{screening:{eligible:'yes'}},
    })
    expect(saved.revision).toBe(1)
    const raw=await db.surveyAttemptCheckpoint.findFirstOrThrow({
      where:{attemptId:first.attemptId},
    })
    expect(raw.contentCipher).not.toContain('eligible')
    expect(raw.contentCipher).not.toContain('yes')
    const read=await readSurveyCheckpoint(proof(first))
    expect(read.checkpoint?.answers).toEqual({screening:{eligible:'yes'}})
    await expect(saveSurveyCheckpoint(proof(first),{
      revision:0,answers:{screening:{eligible:'no'}},
    })).rejects.toThrow(/已修改/)
    await expect(readSurveyCheckpoint({...proof(first),accessCredential:'z'.repeat(43)}))
      .rejects.toThrow()
    const next=await saveSurveyCheckpoint(proof(first),{
      revision:1,answers:{screening:{eligible:'yes'},measure:{engagement:'o3'}},
    })
    expect(next.revision).toBe(2)
    await expect(saveSurveyCheckpoint(proof(first),{
      revision:2,answers:{screening:{unknown:'value'}},
    })).rejects.toThrow(/未授权/)
  })
  it('purges checkpoints when FINAL or SCREENED_OUT, audits N and rejects stale MFA',async()=>{
    const done=await submitResearchFinal({...proof(first),submissionId:randomUUID(),
      answers:{screening:{eligible:'yes'},measure:{engagement:'o4'}},
      presentation:{shownBlocks:['assigned_material','screen','attitude']},
    })
    expect(done.status).toBe('COMPLETED')
    expect(await db.surveyAttemptCheckpoint.count({
      where:{attemptId:first.attemptId},
    })).toBe(0)
    await saveSurveyCheckpoint(proof(second),{
      revision:0,answers:{screening:{eligible:'no'}},
    })
    const result=await screenOutResearchAttempt({...proof(second),submissionId:randomUUID(),
      answers:{screening:{eligible:'no'}},
      presentation:{shownBlocks:['assigned_material','screen','stop']},
    })
    expect(result.status).toBe('SCREENED_OUT')
    expect(await db.surveyWaveFinal.count({where:{attemptId:second.attemptId}})).toBe(0)
    expect(await db.surveyAttemptCheckpoint.count({
      where:{attemptId:second.attemptId},
    })).toBe(0)
    await expect(describeSurveyFlowOperations(researcherReq(1000),{
      projectId:project,waveId,
    })).rejects.toThrow(/TOTP/)
    const count=await describeSurveyFlowOperations(researcherReq(),{
      projectId:project,waveId,category:{instrumentKey:'screening',itemKey:'eligible'},
      score:{instrumentKey:'measure',scoreKey:'attitude'},
    })
    expect(count.limits).toMatchObject({complete:true,noTruncation:true})
    expect(count.total).toMatchObject({starts:2,assigned:2,completedFinal:1,
      analysisIncluded:1,screenedOut:1})
    expect(count.category?.counts).toMatchObject({yes:1,no:0})
    expect(count.score?.groups).toEqual([])
    expect(count.score).toMatchObject({minGroupN:5,suppressedGroups:2})
    expect(JSON.stringify(count.score)).not.toContain('engagement')
    expect(count.groups.map(g=>g.counts.assigned).sort()).toEqual([1,1])
    expect(count.quotaReservations.reduce((sum,b)=>sum+b.everAssigned,0)).toBe(2)
  })
  it('excludes withdrawn FINAL, revokes assignment cipher; does not recycle historical quota',async()=>{
    const withdrawn=await withdrawSingleResearchAttempt(proof(first))
    expect(withdrawn.status).toBe('WITHDRAWN')
    const row=await db.surveyWaveAttempt.findUniqueOrThrow({
      where:{id:first.attemptId},
    })
    expect(row.flowAssignmentCipher).toBeNull()
    const count=await describeSurveyFlowOperations(researcherReq(),{
      projectId:project,waveId,
    })
    expect(count.total).toMatchObject({starts:2,assigned:1,analysisIncluded:0,
      withdrawn:1,screenedOut:1})
    expect(count.quotaReservations.reduce((sum,b)=>sum+b.everAssigned,0)).toBe(2)
    expect(await cleanupExpiredSurveyCheckpoints()).toBeGreaterThanOrEqual(0)
  })
})
