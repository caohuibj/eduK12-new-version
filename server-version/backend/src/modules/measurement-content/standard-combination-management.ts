import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {prisma} from '../../config/database'
import {assertEntryAdmin,AdminPermissionError} from '../admin-permissions/service'
import {libraryActor} from '../scale-library-governance/authority'

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
      issuerId:string;version:number;revokedAt:Date|null;combinationHash:string}>>(Prisma.sql`
      SELECT g.id,g.teacher_id AS "userId",u.username,u.nickname,g.granted_by AS "issuerId",
        g.version,g.revoked_at AS "revokedAt",g.standard_combination_hash AS "combinationHash"
      FROM material_grants g JOIN users u ON u.id=g.teacher_id
      WHERE g.resource_type='STANDARD_COMBINATION' AND g.resource_id=${id}
        AND u.account_domain IN ('TRAINING','LEGACY')
        ${input.userId?Prisma.sql`AND g.teacher_id=${input.userId}`:Prisma.empty}
      ORDER BY u.username,g.id LIMIT ${size+1} OFFSET ${(currentPage-1)*size}`)
    return {page:currentPage,hasMore:rows.length>size,list:rows.slice(0,size).map(row=>({...row,canManage:row.issuerId===actorId}))}
  },options)
}
