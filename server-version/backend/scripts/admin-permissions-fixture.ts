// Disposable synthetic fixture. Never upload its private output or database.
import {randomBytes,randomUUID} from 'node:crypto'
import {writeFileSync,readFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
import {prisma} from '../src/config/database'
import {hashPassword} from '../src/utils/password'
import {changeEntryGrant,type AdminEntry} from '../src/modules/admin-permissions/service'

void(async()=>{
  const out=process.env.ADMIN_PERMISSIONS_FIXTURE_FILE
  const db=new URL(process.env.DATABASE_URL!)
  if(process.env.ADMIN_PERMISSIONS_ISOLATED_TEST!=='1'||!db.pathname.startsWith('/eduk12_admin_permissions_')
    ||!['localhost','127.0.0.1'].includes(db.hostname)||!out?.startsWith('/workspace/admin-permissions-private/'))throw new Error('Isolated fixture only')
  const prefix='admin-fixture-'+randomUUID().slice(0,8)
  const password=()=>randomBytes(24).toString('base64url')+'7a'
  const cli=(input:object,name:string)=>{
    const handoff=path.dirname(out)+'/'+prefix+'-'+name+'.json'
    const result=spawnSync(process.execPath,['--import','tsx','src/scripts/admin-security-bootstrap.ts'],{
      input:JSON.stringify(input),encoding:'utf8',env:{...process.env,ADMIN_SECURITY_BOOTSTRAP_ENABLED:'true',ADMIN_SECURITY_HANDOFF_FILE:handoff},
    })
    if(result.status!==0)throw new Error('Synthetic operator CLI failed')
    return {...JSON.parse(result.stdout.trim().split('\n').at(-1)!),...JSON.parse(readFileSync(handoff,'utf8'))}
  }
  const systemPassword=password(),systemUsername=prefix+'-system'
  const system=cli({action:'CREATE_SYSTEM_ADMIN',username:systemUsername,password:systemPassword,reason:'disposable synthetic browser fixture'},'system')
  const fixtures:Record<string,unknown>={system:{id:system.userId,username:systemUsername,password:systemPassword,enrollmentToken:system.enrollmentToken}}
  const definitions:Record<string,AdminEntry[]>={training:['TRAINING'],survey:['SURVEY'],school:['HUISCHOOL'],teacher:['HUITEACHER'],both:['TRAINING','SURVEY'],none:[],business:[]}
  for(const [name,entries]of Object.entries(definitions)){
    const secret=password()
    const u=await prisma.user.create({data:{username:prefix+'-'+name,passwordHash:await hashPassword(secret),role:name==='none'?'ADMIN':'TEACHER',accountDomain:'TRAINING',platformRole:'STANDARD'}})
    for(const entry of entries)await changeEntryGrant({actorUserId:system.userId,actorSession:{tokenVersion:0,adminVerifiedAt:Math.floor(Date.now()/1000),adminSessionId:randomUUID()},
      targetUserId:u.id,entry,active:true,expectedVersion:0,reason:'synthetic browser entry fixture'})
    const ticket=entries.length?cli({action:'ISSUE_ENROLLMENT',username:u.username,reason:'synthetic browser enrollment'},name):null
    fixtures[name]={id:u.id,username:u.username,password:secret,...(ticket?{enrollmentToken:ticket.enrollmentToken}:{})}
  }
  const org=await prisma.organization.create({data:{id:randomUUID(),name:'Synthetic admin permissions school',createdByUserId:system.userId,productDomain:'SCHOOL'}})
  for(const product of ['HUISCHOOL','HUITEACHER'])await prisma.educationProductEntitlement.create({data:{organizationId:org.id,product,status:'ACTIVE',grantedByUserId:system.userId}})
  const course=await prisma.course.create({data:{title:'Synthetic ownership boundary',creatorId:(fixtures.business as {id:string}).id,courseCode:randomUUID()}})
  fixtures.organizationId=org.id;fixtures.courseId=course.id
  writeFileSync(out,JSON.stringify(fixtures),{mode:0o600,flag:'wx'})
  console.log(JSON.stringify({fixtureCreated:true,accounts:8,entries:4,privateOutput:true}))
})().catch(e=>{console.error(e instanceof Error?e.message:'Fixture failed');process.exitCode=1}).finally(()=>prisma.$disconnect())
