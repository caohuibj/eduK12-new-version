import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {libraryActor,assertExactTrainingDistributionDelegation} from '../scale-library-governance/authority'
import {trainingStandardIssueReceiptSchema,trainingReplacementIntent} from './standard-combination-use'
import {canonicalHash} from '../assessment-runtime/canonical'
import {readSelectedConfigurationBinding} from '../assessment-authorization/selected-configuration'
import {selectedConfigurationPointer} from '../assessment-authorization/standard-configuration-binding'

const page=z.coerce.number().int().min(1).max(10000).default(1)
const options={isolationLevel:Prisma.TransactionIsolationLevel.ReadCommitted,maxWait:5000,timeout:10000}
async function manager(tx:Prisma.TransactionClient,actorId:string){
  const actor=await libraryActor(tx,actorId)
  if(actor.systemAdmin||!['TRAINING','LEGACY'].includes(actor.account_domain))
    throw new AdminPermissionError(403,'需要独立的 Training 入口管理身份')
  return assertEntryAdmin(tx,actorId,'TRAINING')
}

/** Header projection only: no source decryption, compilation or per-card
 * authority query. A displayed choice is not a use grant; the existing issuer
 * service rechecks the current exact source and both principals on mutation. */
export async function trainingStandardManagementCatalog(actorId:string,rawPage:unknown){
  const currentPage=page.parse(rawPage),size=25
  return prisma.$transaction(async tx=>{
    await manager(tx,actorId)
    const rows=await tx.$queryRaw<Array<{id:string;title:string;toolKey:string;instrumentVersion:string;
      combinationHash:string;state:string;contentVersion:string;parametersVersion:string;reportVersion:string;
      entryDecision:string;entryPaused:boolean;nativeStatus:string|null;measurementReleaseId:string|null}>>(Prisma.sql`
      SELECT r.id,r.snapshot->>'title' AS title,r.tool_key AS "toolKey",r.snapshot->>'instrumentVersion' AS "instrumentVersion",
        r.combination_hash AS "combinationHash",r.state,
        r.snapshot#>>'{parts,CONTENT,version}' AS "contentVersion",
        r.snapshot#>>'{parts,PARAMETERS,version}' AS "parametersVersion",
        r.snapshot#>>'{parts,REPORT,version}' AS "reportVersion",p.decision AS "entryDecision",p.paused AS "entryPaused",
        native.status::text AS "nativeStatus",r.measurement_release->>'releaseId' AS "measurementReleaseId"
      FROM survey_standard_releases r
      JOIN survey_tool_policies p ON p.resource_key='standard-release:'||r.id
        AND p.fingerprint=r.combination_hash AND p.product='TRAINING'
      LEFT JOIN scales native ON native.code=r.tool_key AND native.instrument_version=r.snapshot->>'instrumentVersion'
        AND native.instrument_class='STANDARD' AND native.library_entry_id IS NULL
      WHERE p.decision='APPROVED' OR EXISTS(SELECT 1 FROM material_grants g
        WHERE g.resource_type='STANDARD_COMBINATION' AND g.resource_id=r.id)
      ORDER BY r.tool_key,r.created_at,r.id LIMIT ${size+1} OFFSET ${(currentPage-1)*size}`)
    return {page:currentPage,hasMore:rows.length>size,list:rows.slice(0,size).map(row=>({
      id:row.id,title:row.title,toolKey:row.toolKey,instrumentVersion:row.instrumentVersion,
      combinationHash:row.combinationHash,state:row.state,
      versions:{CONTENT:row.contentVersion,PARAMETERS:row.parametersVersion,REPORT:row.reportVersion},
      assignable:row.state==='ONLINE'&&row.entryDecision==='APPROVED'&&!row.entryPaused&&row.nativeStatus==='PUBLISHED'&&Boolean(row.measurementReleaseId),
      unavailableReason:row.state!=='ONLINE'?'该组合当前不接受新增使用':row.entryDecision!=='APPROVED'?'该配置未获当前 Training 入口批准':row.entryPaused?'Training 入口已暂停新增使用':
        row.nativeStatus!=='PUBLISHED'?'原生量表尚未装载或发布':!row.measurementReleaseId?'缺少已批准测量版本':null,
    }))}
  },options)
}

/** Existing grants remain visible after source withdrawal, so an administrator
 * can read back uncertain outcomes or revoke without reviving the source. */
export async function trainingStandardManagementGrants(actorId:string,combinationId:string,raw:unknown){
  const input=z.object({page,userId:z.string().guid().optional()}).strict().parse(raw)
  const id=z.string().guid().parse(combinationId),currentPage=input.page,size=100
  return prisma.$transaction(async tx=>{
    await manager(tx,actorId)
    const rows=await tx.$queryRaw<Array<{id:string;userId:string;username:string;nickname:string|null;
      issuerId:string;version:number;revokedAt:Date|null;combinationHash:string;configurationName:string|null;
      authorityGrantId:string|null;authorityEntryGrantId:string|null;authorityEntryGrantVersion:number|null;
      evidence:Array<{actor_id:string;selected:unknown;configurationName:string|null}>}>>(Prisma.sql`
      SELECT g.id,g.teacher_id AS "userId",u.username,u.nickname,g.granted_by AS "issuerId",
        g.version,g.revoked_at AS "revokedAt",g.standard_combination_hash AS "combinationHash",
        (SELECT CASE WHEN count(DISTINCT e.metadata->>'configurationName')=1 THEN min(e.metadata->>'configurationName') ELSE NULL END
         FROM assessment_management_events e WHERE e.action='STANDARD_COMBINATION_USE_GRANTED' AND e.resource_id=g.resource_id
          AND e.metadata->>'grantId'=g.id AND e.metadata->>'useVersion'=(g.version-CASE WHEN g.revoked_at IS NULL THEN 0 ELSE 1 END)::text) AS "configurationName",
        g.authority_grant_id AS "authorityGrantId",g.authority_entry_grant_id AS "authorityEntryGrantId",g.authority_entry_grant_version AS "authorityEntryGrantVersion",
        COALESCE((SELECT jsonb_agg(a) FROM (SELECT DISTINCT e.actor_id,e.metadata->'selectedBinding' AS selected,e.metadata->>'configurationName' AS "configurationName"
          FROM assessment_management_events e WHERE e.action='STANDARD_COMBINATION_USE_GRANTED' AND e.resource_id=g.resource_id
           AND e.metadata->>'grantId'=g.id AND e.metadata->>'useVersion'=(g.version-CASE WHEN g.revoked_at IS NULL THEN 0 ELSE 1 END)::text
           AND e.metadata?'selectedBinding' ORDER BY e.actor_id LIMIT 2) a),'[]'::jsonb) AS evidence
      FROM material_grants g JOIN users u ON u.id=g.teacher_id
      WHERE g.resource_type='STANDARD_COMBINATION' AND g.resource_id=${id}
        AND u.account_domain IN ('TRAINING','LEGACY')
        ${input.userId?Prisma.sql`AND g.teacher_id=${input.userId}`:Prisma.empty}
      ORDER BY u.username,g.id LIMIT ${size+1} OFFSET ${(currentPage-1)*size}`)
    return {page:currentPage,hasMore:rows.length>size,list:rows.slice(0,size).map(row=>{
      const {evidence,authorityGrantId,authorityEntryGrantId,authorityEntryGrantVersion,...header}=row
      let selectedBinding:ReturnType<typeof selectedConfigurationPointer>|undefined
      // A small original-identity header, not a new admission decision. The
      // issuer transaction still verifies complete old/new source facts.
      if(evidence.length===1&&evidence[0].actor_id===row.issuerId)try{
        const selected=readSelectedConfigurationBinding(evidence[0].selected,{product:'TRAINING',recipientId:row.userId,organizationId:null,
          authorizationId:row.id,authorizationRevision:row.version-(row.revokedAt?1:0)})
        const basis=authorityGrantId&&!authorityEntryGrantId&&authorityEntryGrantVersion===null?[{kind:'CONTENT_DELEGATION',id:authorityGrantId,revision:1}]:
          !authorityGrantId&&authorityEntryGrantId&&authorityEntryGrantVersion?[{kind:'ENTRY_ADMIN',id:authorityEntryGrantId,revision:authorityEntryGrantVersion}]:null
        if(selected&&basis&&selected.binding.authorization.kind==='TRAINING_STANDARD_USE'&&selected.binding.authorization.issuerId===row.issuerId
          &&canonicalHash(selected.binding.authorization.authority)===canonicalHash(basis)&&selected.binding.configuration.kind==='STANDARD_COMBINATION'
          &&selected.binding.configuration.combinationId===id&&selected.binding.configuration.combinationHash===row.combinationHash)
          selectedBinding=selectedConfigurationPointer(selected)
      }catch{ /* Explicitly untyped/unverifiable: keep ordinary legacy read/revoke. */ }
      return {...header,canManage:row.issuerId===actorId,...(selectedBinding?{selectedBinding}:{})}
    })}
  },options)
}

/** Own immutable request, not current/latest grant state guessed as the old
 * operation's result. Current issuer management qualification is independent
 * from whether this historical revision is still usable. */
export async function trainingStandardManagementRequest(actorId:string,combinationId:string,requestId:string,raw:unknown={}){
 z.string().guid().parse(combinationId);z.string().guid().parse(requestId)
 const input=z.object({grantId:z.string().guid().optional()}).strict().parse(raw)
 return prisma.$transaction(async tx=>{
  const actor=await libraryActor(tx,actorId)
  if(actor.systemAdmin||!['TRAINING','LEGACY'].includes(actor.account_domain))throw new AdminPermissionError(403,'需要当前 Training 管理身份')
  const [row]=await tx.$queryRaw<Array<{metadata:unknown;grantId:string|null;userId:string|null;version:number|null;revokedAt:Date|null;combinationHash:string|null}>>(Prisma.sql`
   SELECT e.metadata,g.id AS "grantId",g.teacher_id AS "userId",g.version,g.revoked_at AS "revokedAt",g.standard_combination_hash AS "combinationHash"
   FROM assessment_management_events e LEFT JOIN material_grants g ON g.id=e.metadata->>'grantId' AND g.resource_type='STANDARD_COMBINATION' AND g.resource_id=${combinationId}
   WHERE e.id=${requestId} AND e.actor_id=${actorId} AND e.resource_id=${combinationId} AND e.action='STANDARD_COMBINATION_USE_GRANTED'`)
  if(!row){
   try{await manager(tx,actorId)}catch(error){
    if(!(error instanceof AdminPermissionError)||error.statusCode!==403||!input.grantId)throw error
    const [source]=await tx.$queryRaw<Array<{measurement_release:{releaseId:string}|null}>>(Prisma.sql`SELECT measurement_release FROM survey_standard_releases WHERE id=${combinationId}`)
    if(!source?.measurement_release)throw error
    await assertExactTrainingDistributionDelegation(tx,actorId,source.measurement_release.releaseId,input.grantId)
   }
   return {operation:null}
  }
  const parsed=trainingStandardIssueReceiptSchema.safeParse(row.metadata)
  if(!parsed.success)throw new AdminPermissionError(409,'原请求缺少完整可信回执')
  const receipt=parsed.data,selected=readSelectedConfigurationBinding(receipt.selectedBinding,{product:'TRAINING',recipientId:receipt.userId,organizationId:null,
   authorizationId:receipt.grantId,authorizationRevision:receipt.useVersion})
  if(row.grantId&&(receipt.grantId!==row.grantId||receipt.userId!==row.userId||receipt.combinationHash!==row.combinationHash)
   ||selected&&(selected.binding.authorization.issuerId!==actorId||selected.binding.authorization.kind!=='TRAINING_STANDARD_USE'
    ||selected.binding.configuration.kind!=='STANDARD_COMBINATION'||selected.binding.configuration.combinationId!==combinationId
    ||selected.binding.configuration.combinationHash!==receipt.combinationHash))throw new AdminPermissionError(409,'原请求与来源或接收者身份不一致')
  try{await manager(tx,actorId)}catch(error){
   if(!(error instanceof AdminPermissionError)||error.statusCode!==403)throw error
   if(!('authorityGrantId'in receipt)||!selected||selected.binding.configuration.kind!=='STANDARD_COMBINATION')throw error
   await assertExactTrainingDistributionDelegation(tx,actorId,selected.binding.configuration.measurement.releaseId,receipt.authorityGrantId)
  }
  const grant={id:receipt.grantId,version:receipt.useVersion,currentVersion:row.version,revoked:row.version===null||row.revokedAt!==null||row.version!==receipt.useVersion,...(receipt.supersedes?{supersedes:receipt.supersedes}:{})}
  if(!receipt.requestIntent||!receipt.requestIntentHash||!selected)return {operation:{legacy:true,grant,request:null}}
  const intent=receipt.requestIntent
  if(canonicalHash(intent)!==receipt.requestIntentHash||intent.actorId!==actorId||intent.combinationId!==combinationId||intent.userId!==receipt.userId
   ||intent.combinationHash!==receipt.combinationHash||intent.configurationName!==undefined&&intent.configurationName!==receipt.configurationName
   ||intent.expectedUseId!==undefined&&intent.expectedUseId!==receipt.grantId
   ||canonicalHash(intent.replaces??null)!==canonicalHash(trainingReplacementIntent(receipt.supersedes)??null)
   ||receipt.selfGrant!==undefined&&receipt.selfGrant!==(actorId===receipt.userId))throw new AdminPermissionError(409,'原完整授权意图与回执不一致')
  return {operation:{legacy:false,grant,request:{requestId,...intent}}}
 },options)
}
