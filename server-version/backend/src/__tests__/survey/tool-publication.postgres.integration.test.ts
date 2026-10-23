import {randomUUID} from 'node:crypto'
import {afterAll,describe,expect,it,vi} from 'vitest'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {createTemplate,saveTemplate,archiveTemplate} from '../../modules/survey/tool-library.service'
import {publishToolMeasurement} from '../../modules/survey/tool-publication.service'
import {readSources,submit,review} from '../../modules/scale-library-governance/service'
import {submissionSource} from '../../modules/scale-library-governance/source'
import {getContentRelease} from '../../modules/measurement-content/repository'
const actions=process.env.CI==='true'
const suite=actions||process.env.SURVEY_TOOL_PUBLICATION_ACCEPTANCE==='1'?describe:describe.skip
const metadata={title:'合成入库量表',author:'Synthetic author',copyright:'Self authored, redistribution allowed',applicability:'Synthetic only',scoringDescription:'Mean',reportDescription:'Descriptive only'}
const rollback=new Error('SYNTHETIC_ROLLBACK')
// All writes, including synthetic CI identities and immutable facts, roll back.
// The manual fixture still requires existing identities; CI never reads Mac credentials.
function requireFixtureDatabase(){
 if(process.env.NODE_ENV==='production')throw new Error('Production fixture execution forbidden')
 const url=new URL(process.env.DATABASE_URL!)
 if(actions){
  if(process.env.SURVEY_TOOL_PUBLICATION_ACCEPTANCE!=='1'||process.env.GITHUB_ACTIONS!=='true'||
   process.env.NODE_ENV!=='test'||process.env.SCHOOL_TEACHER_ISOLATED_DB!=='1'||
   !/^[a-f0-9]{64}$/.test(process.env.CI_POSTGRES_SERVICE_ID??'')||
   url.protocol!=='postgresql:'||url.hostname!=='127.0.0.1'||!url.port||url.username!=='ptool'||
   url.pathname!=='/school_teacher_browser_ci_test'||
   process.env.DATABASE_URL!==process.env.SCHOOL_TEACHER_TEST_DATABASE_URL||
   process.env.DATABASE_URL!==process.env.RELEASE_INTEGRATION_DATABASE_URL)
   throw new Error('Explicit disposable School/Teacher Actions PostgreSQL service required')
 }else expect([url.hostname,url.port,url.pathname]).toEqual(['127.0.0.1','5557','/survey_mac_manual_20261022'])
}
async function syntheticIdentities(tx:Prisma.TransactionClient){
 const admin=await tx.user.create({data:{username:'pubadmin'+randomUUID(),passwordHash:'synthetic-not-a-login-hash',role:'ADMIN',platformRole:'SYSTEM_ADMIN',accountDomain:'LEGACY'}})
 const owner=await tx.user.create({data:{username:'pubowner'+randomUUID(),passwordHash:'synthetic-not-a-login-hash',role:'STUDENT',accountDomain:'SURVEY'}})
 const login='pub'+randomUUID().replaceAll('-','').slice(0,20)
 await tx.surveyAccount.create({data:{userId:owner.id,loginName:login,normalizedLogin:login}})
 await tx.surveyResearcherGrant.create({data:{userId:owner.id,status:'ACTIVE',grantedBy:admin.id}})
 await tx.surveyMfaCredential.create({data:{userId:owner.id,enabled:true,secretCipher:'synthetic-not-an-mfa-secret'}})
 return {owner,admin}
}
async function fixture(test:(tx:Prisma.TransactionClient,owner:string,admin:string)=>Promise<void>){
 requireFixtureDatabase()
 const transaction=prisma.$transaction.bind(prisma)
 try{await transaction(async tx=>{
  const synthetic=actions?await syntheticIdentities(tx):undefined
  const [owner]=synthetic?[synthetic.owner]:await tx.$queryRaw<Array<{id:string}>>`SELECT u.id FROM users u JOIN survey_researcher_grants g ON g.user_id=u.id JOIN survey_mfa_credentials m ON m.user_id=u.id WHERE u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen AND NOT u.must_change_password AND g.status='ACTIVE' AND m.enabled AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp()) ORDER BY u.id LIMIT 1`
  const [admin]=synthetic?[synthetic.admin]:await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM users WHERE platform_role='SYSTEM_ADMIN' AND account_domain IN ('LEGACY','TRAINING') AND is_active AND NOT is_frozen AND NOT must_change_password ORDER BY id LIMIT 1`
  if(!owner||!admin)throw new Error('Existing synthetic researcher and platform administrator required; no new identity will be made')
  const nested=vi.spyOn(prisma,'$transaction').mockImplementation(((fn:(t:Prisma.TransactionClient)=>Promise<unknown>)=>fn(tx)) as typeof prisma.$transaction)
  try{await test(tx,owner.id,admin.id)}finally{nested.mockRestore()}
  throw rollback
 },{timeout:20000})}catch(e){if(e!==rollback)throw e}
}
async function scale(owner:string){
 const row=await createTemplate(owner,{requestId:randomUUID(),kind:'SCALE',title:metadata.title})
 return saveTemplate(owner,row.id,{revision:0,title:row.title,definition:{...row.definition,dimensions:[{dimensionKey:'total',label:'总分',direction:'descriptive'}],items:[{itemKey:'q1',prompt:'合成题目',required:true,reverse:false,dimensionKeys:['total']}]}})
}
suite('Standalone Survey scale publication and library application — rollback-only PostgreSQL',()=>{
 afterAll(async()=>{await prisma.$disconnect()})
 it('publishes idempotently with tool scope; later edits preserve the old exact snapshot',async()=>fixture(async(tx,owner,admin)=>{
  const row=await scale(owner),release=await publishToolMeasurement(owner,row.id,1)
  expect(await publishToolMeasurement(owner,row.id,1)).toEqual(release)
  const stored=await getContentRelease(tx,release.releaseId)
  expect(stored).toMatchObject({scope:{kind:'PRIVATE',resourceId:row.id,ownerId:owner},provenance:{authoringSource:'SURVEY_TOOL_TEMPLATE'}})
  await saveTemplate(owner,row.id,{revision:1,title:'新版名称',definition:row.definition})
  const old=await submissionSource(tx,owner,'SURVEY',release.releaseId)
  expect(old.snapshot.title).toBe(metadata.title)
  expect((await readSources(owner,'SURVEY',row.id)).releases[0]).toMatchObject({eligible:true,releaseId:release.releaseId})
  await expect(submissionSource(tx,admin,'SURVEY',release.releaseId)).rejects.toMatchObject({statusCode:403})
  await expect(publishToolMeasurement(owner,row.id,1)).rejects.toMatchObject({statusCode:409})
  await archiveTemplate(owner,row.id,2)
  await expect(publishToolMeasurement(owner,row.id,3)).rejects.toMatchObject({statusCode:409})
  expect((await submissionSource(tx,owner,'SURVEY',release.releaseId)).sourceId).toBe(row.id)
 }))
 it('submits and approves through existing governance, preserving exact content and no implicit use grants',async()=>fixture(async(tx,owner,admin)=>{
  const row=await scale(owner),release=await publishToolMeasurement(owner,row.id,1),requestId=randomUUID()
  const input={requestId,releaseId:release.releaseId,metadata}
  const application=await submit(owner,'SURVEY',input)
  expect(application).toMatchObject({sourceId:row.id,status:'SUBMITTED',releaseId:release.releaseId})
  expect((await submit(owner,'SURVEY',input)).id).toBe(application.id)
  await expect(review(owner,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Unauthorized'})).rejects.toMatchObject({statusCode:403})
  const approved=await review(admin,application.id,{expectedVersion:1,decision:'APPROVE',reason:'Rollback-only synthetic review'})
  const [entry]=await tx.$queryRaw<Array<{release_id:string}>>(Prisma.sql`SELECT release_id FROM scale_library_entries WHERE id=${approved.entryId}`)
  expect(entry.release_id).toBe(release.releaseId)
  const [grants]=await tx.$queryRaw<Array<{n:bigint}>>(Prisma.sql`SELECT count(*) AS n FROM scale_library_use_grants WHERE entry_id=${approved.entryId}`)
  expect(Number(grants.n)).toBe(0)
 }))
 it('rejects non-scale, unfinished content and non-owner publication before creating releases',async()=>fixture(async(_tx,owner,admin)=>{
  for(const kind of ['FORM','COMPOSITION'] as const){const row=await createTemplate(owner,{requestId:randomUUID(),kind,title:'合成非量表'});await expect(publishToolMeasurement(owner,row.id,0)).rejects.toMatchObject({statusCode:400})}
  const empty=await createTemplate(owner,{requestId:randomUUID(),kind:'SCALE',title:'未完成'})
  await expect(publishToolMeasurement(owner,empty.id,0)).rejects.toThrow()
  const row=await scale(owner)
  await expect(publishToolMeasurement(admin,row.id,1)).rejects.toMatchObject({statusCode:403})
 }))
})
