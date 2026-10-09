import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/database'
import { forbidden, notFound } from '../../utils/response'
import { resolveOrganizationAccessContext } from '../organization/access'

/** Campus capability changes must not be a self-service path to sensitive
 * student reporting. Old Organization API paths never accept SCHOOL sessions.
 * Execute after authenticateSchool and recent TOTP step-up.
 */
export async function guardCampusCapabilityGrant(req: Request,res: Response,next: NextFunction) {
  try {
    const parsed=z.object({capability:z.enum([
      'PSYCHOLOGY_STAFF','REPORT_EXPORT','REPORT_MEMBER_EXPORT','PARENT_REPORT_DISCLOSURE',
    ])}).passthrough().safeParse(req.body)
    if(!req.user || req.user.accountDomain!=='SCHOOL' || !parsed.success) return forbidden(res,'校园能力授权请求无效')
    const context=await resolveOrganizationAccessContext({
      principal:req.user,organizationId:req.params.organizationId,
    })
    if(!context || context.productDomain!=='SCHOOL' || !context.canGovern) return forbidden(res,'无校园治理权限')
    const membership=await prisma.organizationMembership.findFirst({
      where:{id:req.params.membershipId,organizationId:req.params.organizationId,validUntil:null},
      select:{userId:true},
    })
    if(!membership) return notFound(res,'当前成员关系不存在')
    if(membership.userId===req.user.userId) return forbidden(res,'不能给自己的校园账号授予新的能力权限')
    next()
  } catch(error){next(error)}
}
