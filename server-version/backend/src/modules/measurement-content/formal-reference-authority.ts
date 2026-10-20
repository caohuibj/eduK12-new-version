import {Prisma} from '@prisma/client'
import {ContentAuthorityError} from './content-authority'
import {assertContentAuthority} from './content-authority.repository'

export const FORMAL_REFERENCE_SCOPE_ID='reference-governance'
/** Entry qualification is necessary but never grants scientific capability.
 * Explicit platform grants are issued through the existing strong-auth system.
 * A system administrator with no business qualification/grant is not a reviewer.
 */
export async function assertFormalReferenceAuthority(tx:Prisma.TransactionClient,input:{
  actorId:string;grantId:string;measurementReleaseId:string;capability:'reference.review'|'reference.publish';
}){
  const [user]=await tx.$queryRaw<Array<{role:string;teacher_approved:boolean;account_domain:string;is_active:boolean;is_frozen:boolean;must_change_password:boolean;expires_at:Date|null}>>(Prisma.sql`
    SELECT role::text,teacher_approved,account_domain,is_active,is_frozen,must_change_password,expires_at
    FROM users WHERE id=${input.actorId} FOR SHARE`)
  if(!user||user.role!=='TEACHER'||!user.teacher_approved||!['TRAINING','LEGACY'].includes(user.account_domain)
    ||!user.is_active||user.is_frozen||user.must_change_password)throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')
  const grant=await assertContentAuthority(tx,{actorId:input.actorId,grantId:input.grantId,capability:input.capability,
    scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:FORMAL_REFERENCE_SCOPE_ID,resourceKind:'reference',resourceKeys:[input.measurementReleaseId]}})
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!clock||user.expires_at&&user.expires_at<=clock.now)throw new ContentAuthorityError('CONTENT_AUTHORITY_DENIED')
  return grant
}

/** Only the current subject's actual explicit grants are discoverable. This
 * does not enumerate candidates, samples or platform-wide source material. */
export async function listFormalReferenceAuthorities(tx:Prisma.TransactionClient,actorId:string){
  const rows=await tx.$queryRaw<Array<{id:string;resource_keys:string[];capabilities:string[]}>>(Prisma.sql`
    SELECT id,resource_keys,capabilities FROM content_capability_grants
    WHERE subject_id=${actorId} AND product='TRAINING' AND scope_kind='PLATFORM' AND scope_id=${FORMAL_REFERENCE_SCOPE_ID}
      AND resource_kind='reference' AND revoked_at IS NULL AND valid_from<=clock_timestamp() AND expires_at>clock_timestamp()
    ORDER BY id LIMIT 25 FOR SHARE`)
  const result:Array<{grantId:string;measurementReleaseIds:string[];capabilities:Array<'reference.review'|'reference.publish'>}>=[]
  for(const row of rows){
    if(!row.resource_keys.length)continue
    const capabilities=row.capabilities.filter((value):value is 'reference.review'|'reference.publish'=>
      value==='reference.review'||value==='reference.publish')
    if(!capabilities.length)continue
    try{
      await assertFormalReferenceAuthority(tx,{actorId,grantId:row.id,measurementReleaseId:row.resource_keys[0],capability:capabilities[0]})
      result.push({grantId:row.id,measurementReleaseIds:row.resource_keys,capabilities})
    }catch(error){if(!(error instanceof ContentAuthorityError))throw error}
  }
  return result
}
