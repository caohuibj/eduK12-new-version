import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {issueAdminContentRoot} from '../../modules/measurement-content/admin-authority.service'
import {grantUse} from '../../modules/scale-library-governance/distribution'
import {changeSurveyToolPolicy} from '../../modules/survey/library-admin.service'

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
 const policies=await db.$queryRaw<Array<{version:number}>>`SELECT version FROM survey_tool_policies WHERE resource_key=${resourceKey} AND fingerprint=${fingerprint}`
 if(!policies.length)await changeSurveyToolPolicy(manager,{resourceKey,fingerprint,expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic exact-version entry approval'})
}
export async function grantLibraryUseFixture(db:PrismaClient,systemId:string,entryId:string,input:{requestId:string;userId:string;product:'TRAINING'|'SURVEY'}){
 const manager=await libraryDistributorFixture(db,systemId)
 const [entry]=await db.$queryRaw<Array<{release_id:string}>>`SELECT release_id FROM scale_library_entries WHERE id=${entryId}`
 let grantId:string|undefined
 if(input.product==='TRAINING'){
  const existing=await db.contentCapabilityGrant.findFirst({where:{subjectId:manager,product:'TRAINING',scopeKind:'PLATFORM',
   scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:{equals:[entry.release_id]}}})
  grantId=existing?.id
  if(!grantId){
   grantId=randomUUID()
   await issueAdminContentRoot(systemId,{tokenVersion:0,adminSessionId:'synthetic-fixture-session',adminVerifiedAt:Math.floor(Date.now()/1000)},
    {requestId:grantId,expectedVersion:0,reason:'Synthetic exact-version distribution fixture',grant:{subjectId:manager,
     scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:'scale-library-governance',resourceKind:'material',resourceKeys:[entry.release_id]},
     capabilities:['material.distribute'],delegableCapabilities:[],remainingDelegationDepth:0,
     validFrom:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()}})
  }
 }else await approveFixtureSurveyEntry(db,manager,entryId)
 return grantUse(manager,entryId,{...input,...(grantId?{grantId}: {})})
}
