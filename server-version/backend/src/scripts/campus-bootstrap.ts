// Operator-only initial Huischool organization bootstrap, never an HTTP API.
// Production execution requires separate explicit authorization.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { prisma } from '../config/database'
import { hashPassword, isValidPassword } from '../utils/password'
import { appendAudit } from '../modules/organization/service'

async function main(){
  if(process.env.CAMPUS_BOOTSTRAP_ENABLED!=='true')throw new Error('CAMPUS_BOOTSTRAP_DISABLED')
  if(process.env.NODE_ENV==='production' && process.env.CAMPUS_BOOTSTRAP_PRODUCTION_APPROVED!=='true')
    throw new Error('Production bootstrap needs separate authorization')
  // Read from private stdin, never process arguments, logs or URLs.
  const input=JSON.parse(readFileSync(0,'utf8')) as Record<string,unknown>
  const name=String(input.organizationName??'').trim()
  const login=String(input.adminLogin??'').trim()
  const normalizedLogin=login.toLowerCase()
  const password=String(input.adminPassword??'')
  if(name.length<2||name.length>200||!/^[a-z0-9_.-]{4,32}$/.test(normalizedLogin)||!isValidPassword(password))
    throw new Error('Invalid bootstrap input')
  const passwordHash=await hashPassword(password)
  const result=await prisma.$transaction(async tx=>{
    const existing=await tx.organization.findFirst({
      where:{name,productDomain:'SCHOOL'},select:{id:true},
    })
    if(existing)throw new Error('School already initialized')
    const user=await tx.user.create({data:{
      username:'huischool_'+randomUUID().replace(/-/g,''),
      passwordHash,role:'ADMIN',accountDomain:'SCHOOL',
      platformRole:'STANDARD',teacherApproved:true,nickname:null,phone:null,
    }})
    await tx.campusAccount.create({data:{userId:user.id,loginName:login,normalizedLogin}})
    const org=await tx.organization.create({data:{
      id:randomUUID(),name,createdByUserId:user.id,productDomain:'SCHOOL',
    }})
    const membership=await tx.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN',
    }})
    await appendAudit(tx,{
      organizationId:org.id,actorUserId:user.id,
      action:'CAMPUS_BOOTSTRAP_INITIAL_ADMIN',targetType:'MEMBERSHIP',
      targetId:membership.id,domainEventId:randomUUID(),
      payload:{method:'ISOLATED_OPERATOR_BOOTSTRAP'},
    })
    return {organizationId:org.id,schoolAdminUserId:user.id,adminLogin:login}
  })
  console.log(JSON.stringify(result))
}
void main().then(()=>prisma.$disconnect()).catch(async err=>{
  console.error(err instanceof Error?err.message:'Campus bootstrap failed')
  await prisma.$disconnect()
  process.exitCode=1
})
