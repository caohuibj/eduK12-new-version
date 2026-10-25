import {publishSurveyMeasurementDraft} from '../../modules/survey/measurement-publication.service'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { beforeAll,afterAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import { createDraft,updateDraft } from '../../modules/survey/builder.service'
import { createWave,getWave } from '../../modules/survey/waves.service'
import { prepareWave,openWave } from '../../modules/survey/waves.publish'
import { joinLinkedStudy,startLinkedWave } from '../../modules/survey/admission.service'
import { getOwnResearchTask } from '../../modules/survey/task.public'
import { submitResearchFinal } from '../../modules/survey/final.service'
import { screenOutResearchAttempt } from '../../modules/survey/flow.screen-out.service'
import { loadSurveySource } from '../../modules/survey/analytics.source'
import { withdrawLinkedResearchData } from '../../modules/survey/identity.service'
import { decryptUnifiedRuntimePayload } from '../../modules/assessment-runtime/security'
import type { SurveyFlowAssignment } from '../../modules/survey/flow.assignment'
import type { SurveyFlowDraft } from '../../modules/survey/flow.definition'
import type { FormDraft,ScaleDraft } from '../../modules/survey/builder.definition'
const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
const key=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,18)
const consent='本研究包含若干随机呈现的教学材料和问卷，请自愿参加。不同轮次研究编号将关联并可申请撤回。'
const form:FormDraft={schemaVersion:1,pages:[{pageKey:'page',title:'分组条件',questions:[
  {itemKey:'role',type:'SINGLE',prompt:'参加身份',required:true,rows:[],
    options:[{optionKey:'teacher',label:'教师'},{optionKey:'student',label:'学生'}]},
]}]}
const scale:ScaleDraft={schemaVersion:1,respondentType:'teacher_self_report',
  aggregation:'mean',responseOptions:[1,2,3,4,5].map(n=>({optionKey:'o'+n,label:String(n),score:n})),
  dimensions:[{dimensionKey:'attitude',label:'态度',direction:'descriptive'}],
  items:[{itemKey:'aiuse',prompt:'我愿意了解 AI 教育工具',required:true,
    reverse:false,dimensionKeys:['attitude']}],
}
suite('Survey Flow real PostgreSQL assignment / final / withdrawal',()=>{
  let db:PrismaClient,owner='',admin='',project='',formId='',scaleId=''
  let publicId='',firstWave='',secondWave='',thirdWave=''
  let linked:{researchCode:string;accessCredential:string}
  let firstAttempt=''
  const flags={publication:process.env.SURVEY_PUBLICATION_ENABLED,
    workspace:process.env.SURVEY_WORKSPACE_ENABLED}
  const flow=():SurveyFlowDraft=>({
    schemaVersion:1,embeddedData:[],
    experiment:{experimentKey:'ai_attitude',linkedPolicy:'KEEP_LINKED',groups:[
      {groupKey:'positive',weight:1,materialTitle:'积极',materialBody:'积极教学材料'},
      {groupKey:'risk',weight:1,materialTitle:'风险',materialBody:'教学风险材料'},
      {groupKey:'neutral',weight:1,materialTitle:'中性',materialBody:'中性教学材料'},
    ]},
    blocks:[
      {blockKey:'screen',kind:'INSTRUMENT',instrumentKey:'screening'},
      {blockKey:'test',kind:'INSTRUMENT',instrumentKey:'scaleattitude',
        when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screening',itemKey:'role'},
          value:'teacher'}},
    ],
  })
  const createTool=async(kind:'FORM'|'SCALE',instrumentKey:string,
    definition:FormDraft|ScaleDraft)=>{
    const id=randomUUID()
    await createDraft(owner,project,{requestId:id,kind,instrumentKey,title:instrumentKey})
    await updateDraft(owner,project,id,{revision:0,title:instrumentKey,definition})
    return id
  }
  const wave=async(title:string,definition:SurveyFlowDraft)=>{
    const draft=await createWave(owner,project,{
      requestId:randomUUID(),title,consentText:consent,
      linkageNoticeConfirmed:true,instrumentIds:[formId,scaleId],
      flowDefinition:definition,
    })
    const current=await db.surveyInstrumentDraft.findUniqueOrThrow({where:{id:scaleId}})
    await publishSurveyMeasurementDraft(owner,project,scaleId,current.revision)
    const prepared=await prepareWave(owner,project,draft.id,draft.revision)
    expect(prepared.runtimeReady).toBe(true)
    const frozen=await getWave(owner,project,draft.id)
    const opened=await openWave(owner,project,draft.id,frozen.revision)
    return {id:draft.id,publicId:opened.publicId,entrySecret:opened.entrySecret}
  }
  beforeAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED='true'
    process.env.SURVEY_WORKSPACE_ENABLED='true'
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
    const sys=await db.user.create({data:{
      username:key('sys'),passwordHash:'integration-only',role:'ADMIN',
      platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY',
    }})
    admin=sys.id
    const researcher=await db.user.create({data:{
      username:key('res'),passwordHash:'integration-only',role:'STUDENT',accountDomain:'SURVEY',
    }})
    owner=researcher.id
    const login=key('research')
    await db.surveyAccount.create({data:{userId:owner,loginName:login,normalizedLogin:login}})
    await db.surveyResearcherGrant.create({data:{userId:owner,status:'ACTIVE',grantedBy:admin}})
    await db.surveyMfaCredential.create({data:{
      userId:owner,enabled:true,secretCipher:'integration-only',
    }})
    project=randomUUID()
    await db.surveyProject.create({data:{
      id:project,ownerUserId:owner,title:'AI 条件随机研究',
      collectionMode:'LINKED_WAVES',status:'DRAFT',description:'T1/T2',
    }})
    formId=await createTool('FORM','screening',form)
    scaleId=await createTool('SCALE','scaleattitude',scale)
  })
  afterAll(async()=>{
    process.env.SURVEY_PUBLICATION_ENABLED=flags.publication
    process.env.SURVEY_WORKSPACE_ENABLED=flags.workspace
    await db?.$disconnect()
  })
  it('freezes trial, persists group once before participant can view it, rejects client group changes',async()=>{
    const w=await wave('T1',flow())
    firstWave=w.id;publicId=w.publicId
    const joined=await joinLinkedStudy({publicId,waveId:w.id,entryToken:w.entrySecret,
      consentVersion:1,consent:true})
    firstAttempt=joined.attemptId
    linked={researchCode:joined.researchCode,accessCredential:joined.accessCredential}
    const task=await getOwnResearchTask({publicId,attemptId:firstAttempt,...linked})
    expect(task.flow?.selectedMaterial).toBeTruthy()
    expect(JSON.stringify(task)).not.toContain('groupKey')
    const a=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:firstAttempt}})
    expect(a.flowAssignmentCipher).toBeTruthy()
    const b=await getOwnResearchTask({publicId,attemptId:firstAttempt,...linked})
    expect(b.flow?.selectedMaterial).toEqual(task.flow?.selectedMaterial)
    const c=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:firstAttempt}})
    expect(c.flowAssignmentCipher).toBe(a.flowAssignmentCipher)
    await expect(getOwnResearchTask({publicId,attemptId:firstAttempt,
      researchCode:linked.researchCode,accessCredential:'Q'.repeat(43)})).rejects.toThrow()
  })
  it('commits Form/Scale FINAL once, projects verified trace and enforces frozen display path',async()=>{
    const bad=await submitResearchFinal({publicId,attemptId:firstAttempt,...linked,
      submissionId:randomUUID(),answers:{screening:{role:'teacher'},scaleattitude:{aiuse:'o5'}},
      presentation:{shownBlocks:['screen','test']}})
      .then(()=>false,()=>true)
    expect(bad).toBe(true)
    const submitted=await submitResearchFinal({publicId,attemptId:firstAttempt,...linked,
      submissionId:randomUUID(),answers:{screening:{role:'teacher'},scaleattitude:{aiuse:'o5'}},
      presentation:{shownBlocks:['assigned_material','screen','test']}})
    expect(submitted.status).toBe('COMPLETED')
    const sources=await loadSurveySource({actorUserId:owner,projectId:project,waveIds:[firstWave],
      maxFinals:250,includeWideSchema:true})
    expect(sources.raw.some(row=>row.flowDigest&&row.experimentGroup)).toBe(true)
    expect(sources.raw.every(row=>row.flowTermination==='COMPLETE')).toBe(true)
    expect(sources.scores.some(x=>x.value!==null)).toBe(true)
  })
  it('retains original linked experiment group in T2, does not create a second identity',async()=>{
    const w=await wave('T2',flow())
    secondWave=w.id
    const joined=await startLinkedWave({publicId:w.publicId,waveId:w.id,
      ...linked,consentVersion:1,consent:true})
    const task=await getOwnResearchTask({publicId:w.publicId,attemptId:joined.attemptId,...linked})
    expect(task.flow?.selectedMaterial).toBeTruthy()
    const previous=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:firstAttempt}})
    const current=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:joined.attemptId}})
    const from=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(previous.flowAssignmentCipher!)
    const to=decryptUnifiedRuntimePayload<SurveyFlowAssignment>(current.flowAssignmentCipher!)
    expect(to.groupKey).toBe(from.groupKey)
    expect(to.algorithm).toBe('LINKED_INHERIT_V1')
    expect(to.inheritedFromAttemptId).toBe(firstAttempt)
    expect(await db.surveyParticipant.count({where:{projectId:project,
      researchCode:linked.researchCode}})).toBe(1)
  })
  it('records SCREENED_OUT without FINAL or transient response; withdrawal destroys assignment cipher',async()=>{
    const f=flow()
    f.blocks.splice(1,0,{blockKey:'early',kind:'END',termination:'SCREEN_OUT',
      when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'screening',itemKey:'role'},
        value:'student'}})
    const w=await wave('T3',f)
    thirdWave=w.id
    const started=await startLinkedWave({publicId:w.publicId,waveId:w.id,
      ...linked,consentVersion:1,consent:true})
    await getOwnResearchTask({publicId:w.publicId,attemptId:started.attemptId,...linked})
    const result=await screenOutResearchAttempt({publicId:w.publicId,
      attemptId:started.attemptId,...linked,submissionId:randomUUID(),
      answers:{screening:{role:'student'}},
      presentation:{shownBlocks:['assigned_material','screen','early']}})
    expect(result.status).toBe('SCREENED_OUT')
    expect(await db.surveyWaveFinal.count({where:{attemptId:started.attemptId}})).toBe(0)
    const updated=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:started.attemptId}})
    expect(updated.status).toBe('SCREENED_OUT')
    await withdrawLinkedResearchData({projectId:project,...linked})
    const withdrawn=await db.surveyWaveAttempt.findUniqueOrThrow({where:{id:started.attemptId}})
    expect(withdrawn.flowAssignmentCipher).toBeNull()
    expect(await db.surveyWaveFinal.count({where:{attemptId:started.attemptId}})).toBe(0)
    expect([firstWave,secondWave,thirdWave]).toHaveLength(3)
  })
})
