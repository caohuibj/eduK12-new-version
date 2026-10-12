import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'

/** Create only explicitly opted-in Huischool synthetic fixture authority.
 * Migration backfill runs BEFORE these tests create schools; no automatic
 * SCHOOL -> HUISCHOOL grant is permitted in production.
 * All records are in an isolated PostgreSQL integration database.
 */
export async function grantSyntheticHuischoolProduct(db:PrismaClient,input:{
  organizationId:string;adminUserId:string;adminMembershipId:string
}){
  await db.educationProductEntitlement.create({data:{
    organizationId:input.organizationId,product:'HUISCHOOL',
    status:'ACTIVE',grantedByUserId:input.adminUserId,
  }})
  await db.educationProductRoleGrant.create({data:{
    id:randomUUID(),organizationId:input.organizationId,
    membershipId:input.adminMembershipId,product:'HUISCHOOL',
    role:'PRODUCT_ADMIN',grantedByUserId:input.adminUserId,
  }})
}
