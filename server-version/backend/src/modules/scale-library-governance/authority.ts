import {Prisma} from '@prisma/client'
import {assertContentAuthority} from '../measurement-content/content-authority.repository'
import {ContentAuthorityError} from '../measurement-content/content-authority'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {fail,LIBRARY_SCOPE,libraryAdminEntry,type LibraryProduct} from './contracts'
export async function libraryActor(tx:Prisma.TransactionClient,actorId:string){
  const [u]=await tx.$queryRaw<Array<{id:string;platform_role:string;account_domain:string;role:string;teacher_approved:boolean;expires_at:Date|null}>>(Prisma.sql`
    SELECT id,platform_role::text,account_domain,role::text,teacher_approved,expires_at FROM users
    WHERE id=${actorId} AND is_active AND NOT is_frozen AND NOT must_change_password FOR SHARE`)
  const [clock]=await tx.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!u||!clock||u.expires_at&&u.expires_at<=clock.now)fail('账号不可用',403)
  return {...u,systemAdmin:u.platform_role==='SYSTEM_ADMIN'&&['LEGACY','TRAINING'].includes(u.account_domain)}
}
export async function assertLibraryAuthority(tx:Prisma.TransactionClient,actorId:string,releaseId:string,capability:'catalog.manage'|'material.distribute',product:LibraryProduct,grantId?:string){
  const user=await libraryActor(tx,actorId)
  if(!['TRAINING','LEGACY'].includes(user.account_domain))fail('平台内容管理需使用平台账号',403)
  // Formal entry administration and exact delegation are separate issuance bases.
  // Global system authority never implies entry distribution.
  if(capability==='material.distribute'&&(product==='TRAINING'||product==='SURVEY')&&user.systemAdmin)fail('系统管理员不能代替入口管理员分配使用权',403)
  if(capability==='catalog.manage'&&!user.systemAdmin)fail('全局工具版本审批仅限系统管理员',403)
  if(user.systemAdmin)return {grantId:null,version:0}
  if(capability==='material.distribute'&&(product==='TRAINING'||product==='SURVEY')){
    try{
      const entry=await assertEntryAdmin(tx,actorId,libraryAdminEntry[product])
      return {grantId:null,version:entry.grantVersion,entryAuthority:{entry:product,grantId:entry.grantId,version:entry.grantVersion}}
    }catch(e){if(!(e instanceof AdminPermissionError)||e.statusCode!==403)throw e}
    // An ordinary delegate can issue only the exact explicitly delegated scope.
    // No formal entry role is inferred from their content capability.
  }else if(capability==='material.distribute')await assertEntryAdmin(tx,actorId,libraryAdminEntry[product])
  if(!grantId)fail('缺少当前入口管理资格或精确版本委托',403)
  const result=await assertContentAuthority(tx,{actorId,grantId:grantId!,capability,
    scope:{product,scopeKind:'PLATFORM',scopeId:LIBRARY_SCOPE,resourceKind:capability==='catalog.manage'?'catalog':'material',resourceKeys:[releaseId]}})
  return result
}
/** Revalidate a recorded delegated basis. A later entry-admin appointment
 * never substitutes for this exact content root; issuance keeps its separate
 * existing entry-admin path in assertLibraryAuthority. */
export async function assertExactTrainingDistributionDelegation(tx:Prisma.TransactionClient,actorId:string,releaseId:string,grantId:string){
 const user=await libraryActor(tx,actorId)
 if(!['TRAINING','LEGACY'].includes(user.account_domain))fail('平台内容管理需使用平台账号',403)
 if(user.systemAdmin)fail('系统管理员不能代替入口管理员分配使用权',403)
 return assertContentAuthority(tx,{actorId,grantId,capability:'material.distribute',scope:{product:'TRAINING',scopeKind:'PLATFORM',scopeId:LIBRARY_SCOPE,resourceKind:'material',resourceKeys:[releaseId]}})
}
export async function libraryCapabilities(tx:Prisma.TransactionClient,actorId:string){
  const actor=await libraryActor(tx,actorId)
  const entryGrants=actor.platform_role==='STANDARD'&&['TRAINING','LEGACY'].includes(actor.account_domain)?await tx.$queryRaw<Array<{entry:'TRAINING'|'SURVEY'}>>`SELECT entry FROM admin_entry_grants WHERE user_id=${actorId} AND entry IN ('TRAINING','SURVEY') AND revoked_at IS NULL`:[]
  const entryAdminProducts=entryGrants.map(row=>row.entry)
  const rows=await tx.$queryRaw<Array<{id:string;product:LibraryProduct;resource_keys:string[];capabilities:string[]}>>(Prisma.sql`
    SELECT id,product,resource_keys,capabilities FROM content_capability_grants WHERE subject_id=${actorId}
      AND scope_kind='PLATFORM' AND scope_id=${LIBRARY_SCOPE} AND revoked_at IS NULL
      AND valid_from<=(clock_timestamp() AT TIME ZONE 'UTC') AND expires_at>(clock_timestamp() AT TIME ZONE 'UTC') ORDER BY id LIMIT 100`)
  const reviewGrants:Array<{grantId:string;releaseIds:string[]}>=[],distributionGrants:Array<{grantId:string;product:LibraryProduct;releaseIds:string[]}>=[]
  for(const row of rows){
    const capability=row.capabilities.includes('catalog.manage')?'catalog.manage':row.capabilities.includes('material.distribute')?'material.distribute':null
    if(!capability||!row.resource_keys.length)continue
    try{await assertLibraryAuthority(tx,actorId,row.resource_keys[0],capability,row.product,row.id)
      if(capability==='catalog.manage')reviewGrants.push({grantId:row.id,releaseIds:row.resource_keys})
      else distributionGrants.push({grantId:row.id,product:row.product,releaseIds:row.resource_keys})
    }catch(e){if(!(e instanceof ContentAuthorityError)&&!(e instanceof Error&&('statusCode'in e)&&e.statusCode===403))throw e}
  }
  return {systemAdmin:actor.systemAdmin,entryAdminProducts,reviewGrants,distributionGrants,canReview:actor.systemAdmin||reviewGrants.length>0}
}
