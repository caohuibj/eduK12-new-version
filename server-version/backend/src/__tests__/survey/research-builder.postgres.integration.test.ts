import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { integrationDatabaseUrl } from '../integration/integration-env'
import {
  createDraft, getDraft, listDrafts, updateDraft, copyDraft, archiveDraft,
  previewSurveyImport, applySurveyImport, simulateSurveyDraft,
} from '../../modules/survey/builder.service'
import type { FormDraft, ScaleDraft } from '../../modules/survey/builder.definition'

const DB_URL=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=DB_URL?describe:describe.skip
let db:PrismaClient,adminId='',aId='',bId='',projectId='',draftId=''
const key=(prefix:string)=>prefix+randomUUID().replace(/-/g,'').slice(0,19)
suite('Survey research builder project ACL, revision and batch import — isolated PostgreSQL',()=>{
  beforeAll(async()=>{
    db=new PrismaClient({datasources:{db:{url:DB_URL!}}})
    await db.$connect()
    const admin=await db.user.create({data:{username:key('sadmin'),passwordHash:'synthetic',
      role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
    adminId=admin.id
    for(const alias of ['a','b']){
      const username=key('s'+alias)
      const user=await db.user.create({data:{username,passwordHash:'synthetic',
        role:'STUDENT',accountDomain:'SURVEY'}})
      await db.surveyAccount.create({data:{userId:user.id,loginName:username,normalizedLogin:username}})
      await db.surveyResearcherGrant.create({data:{userId:user.id,status:'ACTIVE',grantedBy:adminId}})
      await db.surveyMfaCredential.create({data:{userId:user.id,enabled:true,secretCipher:'synthetic'}})
      if(alias==='a')aId=user.id;else bId=user.id
    }
    projectId=randomUUID()
    await db.surveyProject.create({data:{id:projectId,ownerUserId:aId,title:'Survey PR2 test',
      description:'',collectionMode:'LINKED_WAVES',status:'DRAFT'}})
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('authorizes project ownership and accepts stable form schemas',async()=>{
    draftId=randomUUID()
    const created=await createDraft(aId,projectId,{
      requestId:draftId,kind:'FORM',instrumentKey:key('f'),title:'研究背景',
    })
    expect(created.kind).toBe('FORM')
    expect(created.revision).toBe(0)
    expect(await listDrafts(aId,projectId,1)).toMatchObject({page:1})
    await expect(getDraft(bId,projectId,draftId)).rejects.toMatchObject({statusCode:404})
    await expect(createDraft(bId,projectId,{requestId:randomUUID(),kind:'FORM',
      instrumentKey:key('f'),title:'越权'})).rejects.toMatchObject({statusCode:404})
    const form:FormDraft={schemaVersion:1,pages:[{pageKey:'pageone',title:'首页',questions:[
      {itemKey:'questionone',type:'SINGLE',prompt:'你更喜欢哪门课程？',required:true,
        options:[{optionKey:'aone',label:'数学'},{optionKey:'atwo',label:'化学'}],rows:[]},
    ]}]}
    const updated=await updateDraft(aId,projectId,draftId,{revision:0,title:'研究背景',definition:form})
    expect(updated.revision).toBe(1)
    await expect(updateDraft(aId,projectId,draftId,{revision:0,title:'失效修订',definition:form}))
      .rejects.toMatchObject({statusCode:409})
    const other=await copyDraft(aId,projectId,draftId,{
      requestId:randomUUID(),instrumentKey:key('f'),title:'独立工具副本',
    })
    expect(other.definition).toMatchObject({schemaVersion:1})
    expect(other.instrumentKey).not.toBe(updated.instrumentKey)
    const valid=await simulateSurveyDraft(aId,projectId,draftId,{})
    expect(valid.ok).toBe(true)
  })
  it('imports parsed rows atomically under the current revision and preserves item codes',async()=>{
    const source=await getDraft(aId,projectId,draftId)
    const batch={format:'CSV' as const,batchId:randomUUID(),
      content:'type,prompt,required,options\nSINGLE,这节课你是否积极参与,true,没有||有时||经常'}
    const preview=await previewSurveyImport(aId,projectId,draftId,batch)
    expect(preview.ok).toBe(true)
    expect(preview.count).toBe(1)
    const imported=await applySurveyImport(aId,projectId,draftId,{
      revision:source.revision,digest:preview.digest,batch,
    })
    expect(imported.revision).toBe(source.revision+1)
    expect((imported.definition as unknown as FormDraft).pages[0].questions).toHaveLength(2)
    await expect(applySurveyImport(aId,projectId,draftId,{
      revision:source.revision,digest:preview.digest,batch,
    })).rejects.toMatchObject({statusCode:409})
    const after=await getDraft(aId,projectId,draftId)
    expect((after.definition as unknown as FormDraft).pages[0].questions[0].itemKey).toBe('questionone')
    await expect(applySurveyImport(bId,projectId,draftId,{
      revision:after.revision,digest:preview.digest,batch,
    })).rejects.toMatchObject({statusCode:404})
  })
  it('accepts a two-dimension scale and blocks a stale revision across API calls',async()=>{
    const id=randomUUID()
    const created=await createDraft(aId,projectId,{requestId:id,kind:'SCALE',instrumentKey:key('s'),title:'学习动机'})
    const definition=created.definition as unknown as ScaleDraft
    definition.dimensions=[{dimensionKey:'motivation',label:'学习动机',direction:'descriptive'},
      {dimensionKey:'engagement',label:'课堂投入',direction:'descriptive'}]
    definition.items=[
      {itemKey:'itemone',prompt:'我愿意学好数学',required:true,reverse:false,dimensionKeys:['motivation']},
      {itemKey:'itemtwo',prompt:'我在课堂上常常走神',required:true,reverse:true,dimensionKeys:['engagement']},
    ]
    const row=await updateDraft(aId,projectId,id,{revision:0,title:'学习动机',definition})
    expect(row.revision).toBe(1)
    await expect(updateDraft(bId,projectId,id,{revision:1,title:'冒用',definition}))
      .rejects.toMatchObject({statusCode:404})
    const scores=await simulateSurveyDraft(aId,projectId,id,{itemone:'o5',itemtwo:'o5'})
    expect(scores.ok).toBe(true)
    const archived=await archiveDraft(aId,projectId,id,1)
    expect(archived.status).toBe('ARCHIVED')
    await expect(updateDraft(aId,projectId,id,{revision:2,title:'归档后修改',definition}))
      .rejects.toMatchObject({statusCode:409})
  })
})
