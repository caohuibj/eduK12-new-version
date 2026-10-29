import {randomUUID} from 'node:crypto'
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest'
import {prisma as db} from '../../config/database'
import {integrationDatabaseUrl,requireIsolatedReleaseDatabase} from './integration-env'
import {setupEducationLibraryRuntimeFixture} from './educationLibraryRuntimeFixture'
import * as tools from '../../modules/education-tools/private-tool.service'
import {configureHuiteacherStudentEvaluation} from '../../modules/huiteacher/studentEvaluation.service'
import {createHuiteacherTarget,createHuiteacherEvent} from '../../modules/huiteacher/evaluation.service'
import {revokeEducationProductAdmin} from '../../modules/organization/educationProductGovernance'

const url=integrationDatabaseUrl('RELEASE_INTEGRATION_DATABASE_URL'),suite=url?describe:describe.skip
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>{resolve=yes});return {promise,resolve}}
const sql=(query:unknown)=>typeof query==='string'?query:(query as {sql?:string})?.sql??(Array.isArray(query)?query.join(' '):'')
async function waitForLock(pid:number){
 for(let n=0;n<150;n++){
  const [row]=await db.$queryRaw<Array<{wait:string|null;query:string}>>`SELECT wait_event_type AS wait,query FROM pg_stat_activity WHERE pid=${pid}`
  if(row?.wait==='Lock')return row
  await new Promise(resolve=>setTimeout(resolve,10))
 }
 throw new Error('Actual consumer did not reach its expected PostgreSQL lock wait')
}
suite('education composition real service fences',()=>{
 beforeAll(()=>requireIsolatedReleaseDatabase(url!))
 afterAll(async()=>{vi.restoreAllMocks();await db.$disconnect()})
 it('revocation holding the real org fence prevents a waiting student configuration from creating stale-author data',async()=>{
  const f=await setupEducationLibraryRuntimeFixture({db,product:'TEACHER',trackCount:0,publish:false})
  vi.stubEnv('HUITEACHER_STUDENT_FEEDBACK_ENABLED','true')
  const context={entry:'TEACHER' as const,organizationId:f.organizationId,principal:{userId:f.managerUserId,accountDomain:'SCHOOL' as const}}
  const fixed=async(kind:'FORM'|'COMPOSITION',definition:unknown)=>{
   const draft=await tools.createPrivateTool(context,{kind,title:'Synthetic fence '+kind}),saved=await tools.updatePrivateTool(context,draft.id,{expectedRevision:1,title:draft.title,definition})
   return tools.freezePrivateTool(context,draft.id,{expectedRevision:saved.revision,expectedContentHash:saved.contentHash})
  }
  const form=await fixed('FORM',{schemaVersion:2,pages:[{pageKey:'p',title:'Unscored',questions:[{itemKey:'q',type:'SHORT_TEXT',prompt:'Observed support',required:false,options:[],rows:[]}]}]})
  const composition=await fixed('COMPOSITION',{schemaVersion:1,adapterVersion:'1.0.0',administration:{population:'TEACHER',responseMode:'STUDENT_REPORT'},instruction:'Synthetic observation',
   blocks:[{blockId:randomUUID(),instruction:'',source:{provider:'PRIVATE_VERSION',kind:'FORM',versionId:form.id,contentHash:form.contentHash}}]})
  const backup=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.participantUserId}})
  await db.educationProductRoleGrant.create({data:{id:randomUUID(),organizationId:f.organizationId,membershipId:backup.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:f.managerUserId}})
  const manager=await db.organizationMembership.findFirstOrThrow({where:{organizationId:f.organizationId,userId:f.managerUserId}})
  const role=await db.educationProductRoleGrant.findFirstOrThrow({where:{organizationId:f.organizationId,membershipId:manager.id,product:'HUITEACHER',role:'PRODUCT_ADMIN',revokedAt:null}})
  const revoker=await db.user.create({data:{username:'fence-system-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING',role:'ADMIN'}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:revoker.id,entry:'HUITEACHER',grantedBy:f.libraryAdminUserId}})
  const grade=randomUUID(),cls=randomUUID(),staff=randomUUID()
  await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name) VALUES (${grade},${f.organizationId},'GRADE','Synthetic grade')`
  await db.$executeRaw`INSERT INTO organization_units(id,organization_id,unit_kind,name,parent_unit_id) VALUES (${cls},${f.organizationId},'CLASS','Synthetic class',${grade})`
  await db.$executeRaw`INSERT INTO organization_staff_class_assignments(id,organization_id,membership_id,class_unit_id,staff_role) VALUES (${staff},${f.organizationId},${backup.id},${cls},'TEACHING')`
  const target=await createHuiteacherTarget({organizationId:f.organizationId,actorUserId:f.managerUserId,kind:'PERSON',name:'Actual appointed teacher',subjectUserId:f.participantUserId})
  const event=await createHuiteacherEvent({organizationId:f.organizationId,actorUserId:f.managerUserId,targetId:target.id,kind:'ASSESSMENT',title:'Synthetic revocation fence'})
  const input={organizationId:f.organizationId,actorUserId:f.managerUserId,eventId:event.id,classUnitId:cls,staffAssignmentId:staff,privateComposition:{versionId:composition.id,contentHash:composition.contentHash}}
  const entered=deferred(),release=deferred(),configurationEntered=deferred(),original=db.$transaction.bind(db)
  let calls=0,configurationPid=0
  // Only scheduling is instrumented: all authority SQL, locks, revoke writes,
  // source reading and configuration services execute against this real DB.
  const spy=vi.spyOn(db,'$transaction').mockImplementation(((work:any,options:any)=>{
   const index=calls++
   return original(async tx=>{
    const [backend]=await tx.$queryRaw<Array<{pid:number}>>`SELECT pg_backend_pid() AS pid`
    if(index===1){configurationPid=backend.pid;configurationEntered.resolve()}
    const query=tx.$queryRaw.bind(tx)
    const wrapped=new Proxy(tx,{get(target,key){
     if(key==='$queryRaw')return async(...args:any[])=>{
      const result=await (query as any)(...args),text=sql(args[0])
      if(index===0&&text.includes('FROM "organizations"')&&text.includes('FOR UPDATE')){entered.resolve();await release.promise}
      return result
     }
     const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value
    }})
    return work(wrapped)
   },options)
  }) as any)
  let revoke:Promise<unknown>|undefined,configure:Promise<unknown>|undefined
  try{
   revoke=revokeEducationProductAdmin({actorUserId:revoker.id,organizationId:f.organizationId,grantId:role.id})
   await Promise.race([entered.promise,revoke.then(()=>{throw new Error('Revocation finished before the controlled real org fence')})])
   configure=configureHuiteacherStudentEvaluation(input).then(value=>({value}),error=>({error}))
   await configurationEntered.promise
   const observed=await waitForLock(configurationPid)
   expect(observed.query).toContain('organizations')
   release.resolve();await expect(revoke).resolves.toMatchObject({revoked:true})
   const outcome=await configure as {error?:unknown}
   expect(outcome.error).toMatchObject({code:'PRIVATE_TOOL_AUTHOR_REQUIRED',statusCode:403})
   expect(await db.huiteacherStudentEvaluationConfig.count({where:{organizationId:f.organizationId,eventId:event.id}})).toBe(0)
   expect((await db.educationProductRoleGrant.findUniqueOrThrow({where:{id:role.id}})).revokedAt).not.toBeNull()
  }finally{release.resolve();await Promise.allSettled([revoke,configure].filter(Boolean));spy.mockRestore();vi.unstubAllEnvs()}
 },30000)
})
