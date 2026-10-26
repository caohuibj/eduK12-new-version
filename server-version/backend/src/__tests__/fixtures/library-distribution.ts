import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {grantUse} from '../../modules/scale-library-governance/distribution'

// Synthetic fixture identities only. Every use still enters the real service,
// which rereads the entry, issuer, exact capability, policy and target account.
const managers=new Map<string,string>()
export async function libraryDistributorFixture(db:PrismaClient,systemId:string){
 let id=managers.get(systemId)
 if(!id){
  id=(await db.user.create({data:{username:'entry-fixture-'+randomUUID(),passwordHash:'synthetic-only',
   role:'ADMIN',platformRole:'STANDARD',accountDomain:'LEGACY'}})).id
  for(const entry of ['TRAINING','SURVEY'])await db.adminEntryGrant.create({data:{id:randomUUID(),userId:id,entry,grantedBy:systemId}})
  managers.set(systemId,id)
 }
 return id
}
export async function approveFixtureSurveyEntry(db:PrismaClient,manager:string,entryId:string){
 const [row]=await db.$queryRaw<Array<{release_id:string;content_hash:string}>>`SELECT e.release_id,r.content_hash FROM scale_library_entries e JOIN measurement_content_releases r ON r.id=e.release_id WHERE e.id=${entryId}`
 const resourceKey='release:'+row.release_id,fingerprint=row.content_hash
 const policies=await db.$queryRaw<Array<{version:number}>>`SELECT version FROM survey_tool_policies WHERE product='SURVEY' AND resource_key=${resourceKey} AND fingerprint=${fingerprint}`
 if(!policies.length)throw new Error('Fixture must explicitly approve Survey during global intake; entry managers do not reapprove tools')
}
export async function grantLibraryUseFixture(db:PrismaClient,systemId:string,entryId:string,input:{requestId:string;userId:string;product:'TRAINING'|'SURVEY'}){
 const manager=await libraryDistributorFixture(db,systemId)
 return grantUse(manager,entryId,input)
}
