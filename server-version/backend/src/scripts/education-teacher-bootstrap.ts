// Operator-only initial HUITEACHER-only school bootstrap, never a public API.
// Same SCHOOL education account/Organization authority as Huischool, but no
// automatic HUISCHOOL business entitlement. Does not create a second user.
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { prisma } from '../config/database'
import { hashPassword, isValidPassword } from '../utils/password'
import { appendAudit } from '../modules/organization/service'

async function main(){
  if(process.env.EDUCATION_TEACHER_BOOTSTRAP_ENABLED!=='true')
    throw new Error('EDUCATION_TEACHER_BOOTSTRAP_DISABLED')
  if(process.env.NODE_ENV==='production'&&
    process.env.EDUCATION_TEACHER_BOOTSTRAP_PRODUCTION_APPROVED!=='true')
    throw new Error('Production education bootstrap requires separate authorization')
  // Secrets arrive through private stdin, never argv/URLs/logs.
  const values=JSON.parse(readFileSync(0,'utf8')) as Record<string,unknown>
  const name=String(values.organizationName??'').trim()
  const login=String(values.adminLogin??'').trim()
  const normalizedLogin=login.toLowerCase()
  const password=String(values.adminPassword??'')
  if(name.length<2||name.length>200
    ||!/^[a-z0-9_.-]{4,32}$/.test(normalizedLogin)||!isValidPassword(password))
    throw new Error('Invalid education bootstrap input')
  const passwordHash=await hashPassword(password)
  const result=await prisma.$transaction(async tx=>{
    // A name collision stops rather than silently duplicating or linking a
    // previously registered Huischool organization. Operator must resolve.
    const colliding=await tx.organization.findFirst({
      where:{name,productDomain:'SCHOOL'},select:{id:true},
    })
    if(colliding)throw new Error('Existing education school requires explicit product activation')
    const user=await tx.user.create({data:{
      username:'education_'+randomUUID().replace(/-/g,''),
      passwordHash,role:'ADMIN',accountDomain:'SCHOOL',
      platformRole:'STANDARD',teacherApproved:true,nickname:null,phone:null,
    }})
    await tx.campusAccount.create({data:{
      userId:user.id,loginName:login,normalizedLogin,
    }})
    const org=await tx.organization.create({data:{
      id:randomUUID(),name,createdByUserId:user.id,productDomain:'SCHOOL',
    }})
    const membership=await tx.organizationMembership.create({data:{
      id:randomUUID(),organizationId:org.id,userId:user.id,orgRole:'ORG_ADMIN',
    }})
    await tx.organizationPersonaGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:membership.id,
      persona:'TEACHER',grantedByUserId:user.id,
    }})
    await tx.educationProductEntitlement.create({data:{
      organizationId:org.id,product:'HUITEACHER',status:'ACTIVE',
      grantedByUserId:user.id,
    }})
    await tx.educationProductRoleGrant.create({data:{
      id:randomUUID(),organizationId:org.id,membershipId:membership.id,
      product:'HUITEACHER',role:'PRODUCT_ADMIN',grantedByUserId:user.id,
    }})
    await appendAudit(tx,{
      organizationId:org.id,actorUserId:user.id,
      action:'EDUCATION_TEACHER_SCHOOL_BOOTSTRAPPED',
      targetType:'ORGANIZATION',targetId:org.id,domainEventId:randomUUID(),
      payload:{method:'ISOLATED_OPERATOR_BOOTSTRAP',product:'HUITEACHER',
        initialMembershipId:membership.id},
    })
    return {organizationId:org.id,initialMembershipId:membership.id,
      adminLogin:login,enabledProduct:'HUITEACHER'}
  })
  console.log(JSON.stringify(result))
}
void main().then(()=>prisma.$disconnect()).catch(async error=>{
  console.error(error instanceof Error?error.message:'Teacher-only school bootstrap failed')
  await prisma.$disconnect()
  process.exitCode=1
})
