import {Prisma} from '@prisma/client'
import {resolveEducationToolAuthoringContext} from './access'
import {privateToolId,privateToolFail,type PrivateToolContext,type PrivateToolKind} from './private-tool.contracts'

export const privateToolScope=(c:PrivateToolContext)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})
/** Match governance writers: org first, authority statement second, then tool/assets.
 * Account validity is current at the authority read, not locked until commit. */
type MutationLock=boolean|{kind:PrivateToolKind}|{toolId:string}
export async function authorizePrivateTool(tx:Prisma.TransactionClient,c:PrivateToolContext,mutation:MutationLock=false){
 privateToolId.parse(c.organizationId)
 if(typeof mutation==='object'&&'toolId' in mutation){
  privateToolId.parse(mutation.toolId)
  // The existing DB guard makes a draft's kind/entry/org/owner immutable.
  // Resolve only that scoped discriminator inside the lock statement: no
  // extra metadata round trip, authority cache, draft JSON read or lock upgrade.
  await tx.$queryRaw(Prisma.sql`WITH target AS MATERIALIZED (
   SELECT COALESCE((SELECT kind FROM education_private_tools WHERE id=${mutation.toolId}
    AND entry=${c.entry} AND organization_id=${c.organizationId} AND owner_user_id=${c.principal.userId}),'') AS kind
  ), shared_org AS MATERIALIZED (
   SELECT o.id FROM organizations o,target WHERE o.id=${c.organizationId} AND target.kind='COMPOSITION' FOR SHARE OF o
  ), exclusive_org AS MATERIALIZED (
   SELECT o.id FROM organizations o,target WHERE o.id=${c.organizationId} AND target.kind<>'COMPOSITION' FOR UPDATE OF o
  ) SELECT id FROM shared_org UNION ALL SELECT id FROM exclusive_org`)
 }else if(typeof mutation==='object'&&mutation.kind==='COMPOSITION'){
  await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${c.organizationId} FOR SHARE`)
 }else if(mutation)await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${c.organizationId} FOR UPDATE`)
 // Governance writers take FOR UPDATE on this same organization before role,
 // entitlement, membership or professional-authority changes. SHARE admits
 // different questionnaire authors but still excludes those real writers.
 // At RC this separate statement sees a revoke committed during a lock wait.
 if(!await resolveEducationToolAuthoringContext(c,tx))privateToolFail('PRIVATE_TOOL_AUTHOR_REQUIRED',403)
}
