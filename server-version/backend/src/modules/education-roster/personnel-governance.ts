import type {Prisma} from '@prisma/client'
import type {AuthenticatedPrincipal} from '../../types'
import {CampusAdmissionError} from '../campus/admission.error'
import {resolveOrganizationAccessContext} from '../organization/access'

function denyPersonnelGovernance(code:string,status:number):never {
  throw new CampusAdmissionError(code,status)
}

export async function assertPersonnelGovernor(tx:Prisma.TransactionClient,actor:Pick<AuthenticatedPrincipal,'userId'|'accountDomain'|'platformRole'>,org:string){
 if(actor.accountDomain!=='SCHOOL')denyPersonnelGovernance('CAMPUS_GOVERNANCE_REQUIRED',403)
 const [ctx,user]=await Promise.all([resolveOrganizationAccessContext({principal:actor,organizationId:org},tx),tx.user.findUnique({where:{id:actor.userId},select:{isActive:true,isFrozen:true,mustChangePassword:true,expiresAt:true,accountDomain:true}})])
 if(!ctx||ctx.productDomain!=='SCHOOL'||ctx.organizationStatus!=='ACTIVE'||!ctx.membershipId||ctx.orgRole!=='ORG_ADMIN'||!ctx.canGovern||!user||user.accountDomain!=='SCHOOL'||!user.isActive||user.isFrozen||user.mustChangePassword||(user.expiresAt&&user.expiresAt<=new Date()))denyPersonnelGovernance('CAMPUS_GOVERNANCE_REQUIRED',403)
 return ctx!
}
