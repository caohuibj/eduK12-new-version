import {randomUUID} from 'node:crypto'
import type {PrismaClient} from '@prisma/client'
import {submitGovernedSource,approveGovernedTool,governedRow} from '../../modules/survey/governed-tool.service'
import {governedPolicyIdentity} from '../../modules/survey/governed-tool.model'
import {grantCatalogSource,revokeToolGrant} from '../../modules/survey/catalog.service'
import {changeSurveyToolPolicy} from '../../modules/survey/library-admin.service'
import type {CatalogSourceRef} from '../../modules/survey/catalog.sources'

/** Real governance/trial/entry approval for synthetic native runtime fixtures.
 * No direct grant insertion or scorer/authority mock; legacy raw grants remain
 * rejected by the public service. System and entry identities stay separate.
 */
export async function grantGovernedCatalogFixture(db:PrismaClient,actorId:string,owner:string,source:CatalogSourceRef){
 const actor=await db.user.findUniqueOrThrow({where:{id:actorId}})
 const system=actor.platformRole==='SYSTEM_ADMIN'?actor:await db.user.create({data:{username:'governance-system-'+randomUUID(),
  passwordHash:'synthetic-only',platformRole:'SYSTEM_ADMIN',accountDomain:'TRAINING'}})
 let manager=actor
 if(actor.platformRole==='SYSTEM_ADMIN'){
  manager=await db.user.create({data:{username:'governance-entry-'+randomUUID(),passwordHash:'synthetic-only',accountDomain:'TRAINING'}})
  await db.adminEntryGrant.create({data:{id:randomUUID(),userId:manager.id,entry:'SURVEY',grantedBy:system.id}})
 }
 const proof={tokenVersion:system.tokenVersion,adminSessionId:'synthetic-governance-session',adminVerifiedAt:Math.floor(Date.now()/1000)}
 const submitted=await submitGovernedSource(system.id,{requestId:randomUUID(),source,version:'fixture-'+randomUUID(),
  title:'Synthetic exact governed runtime',report:{version:'synthetic-report-v1',template:{title:'Synthetic descriptive report',blocks:[{type:'TEXT',text:'Synthetic descriptive feedback only.'}],limitations:[]}},reference:{}},proof)
 await approveGovernedTool(system.id,submitted.id,{expectedVersion:submitted.version,hash:submitted.hash,decision:'APPROVE',reason:'Synthetic runtime contract approval'},proof)
 await changeSurveyToolPolicy(manager.id,{...governedPolicyIdentity(await governedRow(db,submitted.id)),expectedVersion:0,decision:'APPROVED',paused:false,reason:'Synthetic entry contract approval'})
 return grantCatalogSource(manager.id,owner,{kind:source.kind,sourceId:'survey-tool:'+submitted.id,sourceVersion:submitted.hash})
}
export async function revokeGovernedCatalogFixture(db:PrismaClient,_systemId:string,grantId:string){
 const [grant]=await db.$queryRaw<Array<{created_by:string}>>`SELECT created_by FROM survey_tool_grants WHERE id=${grantId}`
 return revokeToolGrant(grant.created_by,grantId)
}
