import {Prisma} from '@prisma/client'
import {resolveEducationToolAuthoringContext} from './access'
import {privateToolId,privateToolFail,type PrivateToolContext} from './private-tool.contracts'

export const privateToolScope=(c:PrivateToolContext)=>({entry:c.entry,organizationId:c.organizationId,ownerUserId:c.principal.userId})
/** Match governance writers: org first, authority statement second, then tool/assets.
 * Account validity is current at the authority read, not locked until commit. */
export async function authorizePrivateTool(tx:Prisma.TransactionClient,c:PrivateToolContext,mutation=false){
 privateToolId.parse(c.organizationId)
 if(mutation)await tx.$queryRaw(Prisma.sql`SELECT id FROM organizations WHERE id=${c.organizationId} FOR UPDATE`)
 if(!await resolveEducationToolAuthoringContext(c,tx))privateToolFail('PRIVATE_TOOL_AUTHOR_REQUIRED',403)
}
