import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { afterAll,beforeAll,describe,expect,it } from 'vitest'
import { integrationDatabaseUrl } from '../integration/integration-env'
import {
  assertSurveyMediaOwned,retainSurveyMedia,SurveyMediaError,
} from '../../modules/survey/media.references'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL','PR26_INTEGRATION_DATABASE_URL')
const suite=url?describe:describe.skip
let db:PrismaClient,owner='',pid='',otherPid='',assetId=''
const hash='b'.repeat(64)
const source=(id:string)=>({kind:'FORM' as const,definition:{
  schemaVersion:1,pages:[{pageKey:'page',title:'项目问卷',questions:[{
    itemKey:'topic',prompt:'课程背景',type:'SINGLE',required:true,
    options:[{optionKey:'a',label:'数学'},{optionKey:'b',label:'化学'}],rows:[],
    image:{asset:{assetId:id,contentHash:hash,mimeType:'image/png'},altText:'原创课堂示意图',
      rightsStatus:'self_authored',rightsNote:'研究者自制原创示意图'},
  }]}],
}})
suite('Survey authorized project-scoped image references — PostgreSQL',()=>{
  beforeAll(async()=>{
    db=new PrismaClient({datasources:{db:{url:url!}}})
    await db.$connect()
    const user=await db.user.create({data:{
      username:'smedia_'+randomUUID().slice(0,8),passwordHash:'synthetic',
      accountDomain:'SURVEY',role:'STUDENT',
    }})
    owner=user.id;pid=randomUUID();otherPid=randomUUID();assetId=randomUUID()
    await db.surveyProject.createMany({data:[
      {id:pid,ownerUserId:owner,title:'素材项目甲',description:'',collectionMode:'SINGLE_UNLINKED'},
      {id:otherPid,ownerUserId:owner,title:'素材项目乙',description:'',collectionMode:'SINGLE_UNLINKED'},
    ]})
    await db.storedAsset.create({data:{
      id:assetId,objectKey:'assets/survey-'+assetId+'.png',provider:'local',
      mimeType:'image/png',sizeBytes:256,sha256:hash,originalName:'original.png',
      ownerId:owner,accessScope:'PRIVATE',scopeId:pid,
    }})
  })
  afterAll(async()=>{await db?.$disconnect()})
  it('authorizes only image identities owned by the correct research project',async()=>{
    const rows=await db.$transaction(tx=>assertSurveyMediaOwned(tx,owner,pid,[source(assetId)]))
    expect(rows).toEqual([{assetId,contentHash:hash,mimeType:'image/png'}])
    await expect(db.$transaction(tx=>assertSurveyMediaOwned(tx,owner,otherPid,[source(assetId)])))
      .rejects.toBeInstanceOf(SurveyMediaError)
    const forged=source(assetId)
    forged.definition.pages[0].questions[0].image.asset.contentHash='c'.repeat(64)
    await expect(db.$transaction(tx=>assertSurveyMediaOwned(tx,owner,pid,[forged])))
      .rejects.toBeInstanceOf(SurveyMediaError)
    await expect(db.$transaction(tx=>assertSurveyMediaOwned(tx,randomUUID(),pid,[source(assetId)])))
      .rejects.toBeInstanceOf(SurveyMediaError)
  })
  it('retains frozen published asset ownership without creating a public attachment URL',async()=>{
    const publicationId=randomUUID()
    await db.$transaction(tx=>retainSurveyMedia(tx,owner,pid,publicationId,[source(assetId)]))
    const refs=await db.assetReference.findMany({where:{
      assetId,entityType:'SurveyResearchPublication',entityId:publicationId,
    }})
    expect(refs).toHaveLength(1)
    expect(refs[0].field).toBe('media')
  })
})
