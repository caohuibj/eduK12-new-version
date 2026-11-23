import {randomUUID} from 'node:crypto'
import {PrismaClient} from '@prisma/client'
import {afterAll,beforeAll,describe,expect,it} from 'vitest'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from '../integration/integration-env'
import {libraryDistributorFixture} from '../fixtures/library-distribution'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {scaleMeasurementRelease} from '../../modules/measurement-content/scale'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {submit,review} from '../../modules/scale-library-governance/service'
import {recipients} from '../../modules/scale-library-governance/distribution'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
let db:PrismaClient,admin:string,owner:string,reader:string,project:string
const metadata={title:'合成授权身份量表',author:'Synthetic author',copyright:'Self authored synthetic content',applicability:'Software test only',scoringDescription:'Mean',reportDescription:'Descriptive, no diagnosis'}
const definition={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'1',score:1},{optionKey:'two',label:'2',score:2}],dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'item',prompt:'合成题目',required:true,reverse:false,dimensionKeys:['total']}]}
async function approved(){
 const localId=randomUUID(),compiled=compileResearchScale(metadata.title,definition)
 const release=await db.$transaction(tx=>publishContentRelease(tx,scaleMeasurementRelease({localId,version:'v1',instrumentVersion:'1',definition:compiled,instrumentClass:'CUSTOM_DESCRIPTIVE',presentationMode:'ALL_AT_ONCE',scope:{kind:'PRIVATE',ownerId:owner,product:'SURVEY',resourceId:project},sourceReleaseId:null,provenance:{authoringRelationship:'ORIGINAL',authoringSnapshot:{title:metadata.title,definition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}}),owner))
 const submission=await submit(owner,'SURVEY',{requestId:randomUUID(),releaseId:release.releaseId,metadata})
 const result=await review(admin,submission.id,{expectedVersion:1,decision:'APPROVE',allowedProducts:['TRAINING','SURVEY'],reason:'Synthetic recipient identity regression'})
 return {entryId:result.entryId!}
}
suite('Survey library recipient identity / real isolated PostgreSQL',()=>{
 beforeAll(async()=>{
  process.env.DATA_ENCRYPTION_KEY='a'.repeat(64);process.env.DATA_PSEUDONYM_KEY='b'.repeat(64)
  requireIsolatedReleaseDatabase(url!);db=new PrismaClient({datasources:{db:{url:url!}}});await db.$connect()
  admin=(await db.user.create({data:{username:'identity-system-'+randomUUID(),passwordHash:'synthetic',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})).id
  for(const key of ['owner','reader']){
   const user=await db.user.create({data:{username:'identity-'+key+'-'+randomUUID(),passwordHash:'synthetic',accountDomain:'SURVEY'}})
   const login='identity'+randomUUID().replaceAll('-','').slice(0,20)
   await db.surveyAccount.create({data:{userId:user.id,loginName:login,normalizedLogin:login}})
   await db.surveyResearcherGrant.create({data:{userId:user.id,status:'ACTIVE',grantedBy:admin}})
   await db.surveyMfaCredential.create({data:{userId:user.id,enabled:true,secretCipher:'synthetic'}})
   if(key==='owner')owner=user.id;else reader=user.id
  }
  project=randomUUID();await db.surveyProject.create({data:{id:project,ownerUserId:owner,title:'Synthetic recipient identity project',collectionMode:'SINGLE_UNLINKED'}})
 })
 afterAll(async()=>{await db?.$disconnect()})
 it('uses Survey login names for recipient display, search and ordering without widening entry scope',async()=>{
  const {entryId}=await approved(),manager=await libraryDistributorFixture(db,admin),tag=randomUUID().replaceAll('-','').slice(0,16)
  const expected:Array<{id:string;username:string}>=[]
  for(const [internal,login,status] of [['a','zulu','ACTIVE'],['z','alpha','PENDING_MFA'],['m','hidden','SUSPENDED']] as const){
   const user=await db.user.create({data:{username:'survey_'+internal+tag,passwordHash:'synthetic',accountDomain:'SURVEY'}})
   const loginName=login+'_'+tag
   await db.surveyAccount.create({data:{userId:user.id,loginName,normalizedLogin:loginName}})
   await db.surveyResearcherGrant.create({data:{userId:user.id,status,grantedBy:admin}})
   if(status!=='SUSPENDED')expected.push({id:user.id,username:loginName})
  }
  expected.reverse()
  const list=await recipients(manager,entryId,{product:'SURVEY',keyword:tag})
  expect(list.list.map(row=>({id:row.id,username:'username' in row?row.username:null}))).toEqual(expected)
  expect((await recipients(manager,entryId,{product:'SURVEY',keyword:expected[0].username})).list.map(row=>row.id)).toEqual([expected[0].id])
  await expect(recipients(reader,entryId,{product:'SURVEY',keyword:tag})).rejects.toThrow()
  const teacher=await db.user.create({data:{username:'training_'+tag,passwordHash:'synthetic',role:'TEACHER',teacherApproved:true,accountDomain:'TRAINING'}})
  const training=await recipients(manager,entryId,{product:'TRAINING',keyword:tag})
  expect(training.list.map(row=>({id:row.id,username:'username' in row?row.username:null}))).toEqual([{id:teacher.id,username:teacher.username}])
 })
})
