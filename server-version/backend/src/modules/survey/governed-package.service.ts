import {randomUUID} from 'node:crypto'
import {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {assertSurveyManager} from './admin-role'
import {authorizedProject} from './builder.service'
import {assertGovernedEntryAllowed,assertGovernedDependencies,governedRow,governedFail,approvedComponent} from './governed-tool.service'
import {clone,packageFamily,type GovernedRow} from './governed-tool.model'
import type {CatalogSourceSnapshot} from './catalog.sources'
import type {ResearchFrozenUnit,FrozenGovernedPackage,ResearchFrozenPublication} from './publication.service'
import {assertSurveyToolPolicy,snapshotPolicyIdentity} from './tool-policy'
import {packageReportWorstCaseBytes,assertPackageReportBytes} from './governed-package.budget'
import {governedSummaryColumns,type GovernedSummaryRow} from './governed-tool.summary'
export type PackageGrantRow={id:string;tool_id:string;snapshot_hash:string;user_id:string;status:string;version:number;valid_from:Date;expires_at:Date|null;created_by:string;reason:string;revoked_at:Date|null}
const view=(g:PackageGrantRow,title:string,family:string)=>({id:g.id,toolId:g.tool_id,hash:g.snapshot_hash,title,family,status:g.status,version:g.version,validFrom:g.valid_from,expiresAt:g.expires_at,reason:g.reason,mode:'PACKAGE_ONLY',revokedAt:g.revoked_at})
async function audit(tx:Prisma.TransactionClient,actor:string,action:string,metadata:object,projectId?:string){await tx.surveyEvent.create({data:{id:randomUUID(),actorUserId:actor,projectId,action,metadata:metadata as Prisma.InputJsonValue}})}
async function target(tx:Prisma.TransactionClient,userId:string){
 const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT u.id FROM users u JOIN survey_accounts a ON a.user_id=u.id JOIN survey_researcher_grants g ON g.user_id=u.id WHERE u.id=${userId} AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen AND (u.expires_at IS NULL OR u.expires_at>clock_timestamp()) AND g.status IN ('ACTIVE','PENDING_MFA') FOR SHARE OF u,g`
 if(!rows.length)governedFail(403,'目标不是本入口当前有效研究者')
}
export async function grantSurveyPackage(actor:string,input:{requestId:string;toolId:string;hash:string;userId:string;reason:string;expiresAt?:string|null}){return prisma.$transaction(async tx=>{
 await assertSurveyManager(tx,actor);await target(tx,input.userId)
 const tool=await assertGovernedEntryAllowed(tx,input.toolId,input.hash)
 if(!packageFamily(tool.family))governedFail(400,'此入口只授予整包使用权')
 const expiry=input.expiresAt?new Date(input.expiresAt):null;if(expiry&&expiry<=new Date())governedFail(400,'授权期限必须晚于当前时间')
 const [prior]=await tx.$queryRaw<PackageGrantRow[]>`SELECT * FROM survey_package_grants WHERE id=${input.requestId} FOR SHARE`
 if(prior){if(prior.user_id!==input.userId||prior.tool_id!==input.toolId||prior.snapshot_hash!==input.hash||prior.created_by!==actor||prior.reason!==input.reason||(prior.expires_at?.toISOString()??null)!==(expiry?.toISOString()??null))governedFail(409,'授权请求编号已用于其他内容');return view(prior,tool.title,tool.family)}
 const [active]=await tx.$queryRaw<PackageGrantRow[]>`SELECT * FROM survey_package_grants WHERE tool_id=${input.toolId} AND user_id=${input.userId} AND status='ACTIVE' FOR SHARE`
 if(active)governedFail(409,'该研究者已有此版本整包授权，请核对原授权，不覆盖期限或来源')
 const [row]=await tx.$queryRaw<PackageGrantRow[]>`INSERT INTO survey_package_grants(id,tool_id,snapshot_hash,user_id,expires_at,created_by,reason) VALUES(${input.requestId},${input.toolId},${input.hash},${input.userId},${expiry},${actor},${input.reason}) RETURNING *`
 await audit(tx,actor,'PACKAGE_USE_GRANTED',{grantId:row.id,toolId:tool.id,hash:tool.snapshot_hash,userId:input.userId,mode:'PACKAGE_ONLY',reason:input.reason})
 return view(row,tool.title,tool.family)
})}
export async function revokeSurveyPackage(actor:string,id:string,version:number,reason:string){return prisma.$transaction(async tx=>{
 await assertSurveyManager(tx,actor)
 const [row]=await tx.$queryRaw<PackageGrantRow[]>`UPDATE survey_package_grants SET status='REVOKED',version=version+1,revoked_at=clock_timestamp(),reason=${reason} WHERE id=${id} AND version=${version} AND status='ACTIVE' RETURNING *`
 if(!row)governedFail(409,'整包授权已撤销或状态已变化')
 await audit(tx,actor,'PACKAGE_USE_REVOKED',{grantId:id,reason,historyRetained:true});return {revoked:true}
})}
type ListedPackageGrant=PackageGrantRow&{tool:GovernedSummaryRow;now:Date;decision:string|null;paused:boolean|null}
function packageAvailability(r:ListedPackageGrant){
 const reasons=[...(r.status==='ACTIVE'?[]:['整包授权已撤销']),...(r.valid_from>r.now?['整包授权尚未生效']:[]),...(r.expires_at&&r.expires_at<=r.now?['整包授权已到期']:[]),...(r.tool.state==='ONLINE'?[]:['此精确工具版本未上线或已停止使用']),...(r.tool.snapshot_hash===r.snapshot_hash?[]:['整包精确版本摘要不一致']),...(r.decision==='APPROVED'?[]:['此版本尚未批准 Survey 使用范围']),...(r.paused?['此版本 Survey 使用已暂停']:[])]
 return {ready:reasons.length===0,reasons,requiresFreshCheck:true,summaryOnly:true}
}
async function listedPackageGrants(tx:Prisma.TransactionClient,userId:string,page:number,query:string,activeOnly:boolean){
 const pattern='%'+query.trim().replace(/[\\%_]/g,'\\$&')+'%'
 const rows=await tx.$queryRaw<ListedPackageGrant[]>(Prisma.sql`SELECT g.*,to_jsonb(tool) AS tool,clock_timestamp() AS now,p.decision,p.paused FROM survey_package_grants g
  JOIN LATERAL(SELECT ${governedSummaryColumns} FROM survey_governed_tools t WHERE t.id=g.tool_id) tool ON true
  LEFT JOIN survey_tool_policies p ON p.product='SURVEY' AND p.resource_key='governed-release:'||g.tool_id::text AND p.fingerprint=g.snapshot_hash
  WHERE g.user_id=${userId} ${activeOnly?Prisma.sql`AND g.status='ACTIVE'`:Prisma.empty} AND (${query}='' OR tool.title ILIKE ${pattern} OR g.snapshot_hash ILIKE ${pattern})
  ORDER BY g.created_at DESC,g.id LIMIT 26 OFFSET ${(page-1)*25}`)
 return {list:rows.slice(0,25).map(r=>({...view(r,r.tool.title,r.tool.family),toolVersion:r.tool.tool_version,versions:r.tool.versions,components:r.tool.components,availability:packageAvailability(r)})),page,hasMore:rows.length>25}
}
export async function packageGrantsForManager(actor:string,userId:string,page:number,query=''){return prisma.$transaction(async tx=>{await assertSurveyManager(tx,actor);return listedPackageGrants(tx,userId,page,query,false)})}
export async function packageGrantsForResearcher(actor:string,projectId:string,page:number,query=''){return prisma.$transaction(async tx=>{await authorizedProject(tx,actor,projectId,false);return listedPackageGrants(tx,actor,page,query,true)})}
const exactToolKey=(id:string,hash:string)=>id+':'+hash
async function currentPackageGrant(tx:Prisma.TransactionClient,id:string,actor:string,active=true,verifiedTools?:Map<string,GovernedRow>){
 const [g]=await tx.$queryRaw<PackageGrantRow[]>`SELECT * FROM survey_package_grants WHERE id=${id} AND user_id=${actor} FOR SHARE`
 if(!g)governedFail(403,'整包授权不属于当前研究者')
 if(active){const [clock]=await tx.$queryRaw<Array<{now:Date}>>`SELECT clock_timestamp() AS now`;if(g.status!=='ACTIVE'||g.valid_from>clock.now||g.expires_at&&g.expires_at<=clock.now)governedFail(403,'整包授权已撤销、尚未生效或已到期');const key=exactToolKey(g.tool_id,g.snapshot_hash);if(!verifiedTools?.has(key)){const tool=await assertGovernedEntryAllowed(tx,g.tool_id,g.snapshot_hash);verifiedTools?.set(key,tool)}}
 return g
}
export async function importSurveyPackage(actor:string,projectId:string,grantId:string,requestId:string){return prisma.$transaction(async tx=>{
 await authorizedProject(tx,actor,projectId,true)
 const grant=await currentPackageGrant(tx,grantId,actor),tool=await governedRow(tx,grant.tool_id)
 if(!packageFamily(tool.family))governedFail(409,'授权对象不是问卷组合或组合包')
 const [prior]=await tx.$queryRaw<Array<{grant_id:string;project_id:string;bindings:Array<{draftId:string;slotKey:string;instrumentKey:string}>}>>`SELECT * FROM survey_package_imports WHERE id=${requestId} FOR SHARE`
 if(prior){if(prior.grant_id!==grantId||prior.project_id!==projectId)governedFail(409,'导入编号已用于其他项目或组合');return {importId:requestId,title:tool.title,bindings:prior.bindings,idempotent:true}}
 const bindings=[]
 for(const [index,component] of tool.snapshot.components.entries()){
  const approvedSource=await approvedComponent(tx,component.source),technicalGrantId=randomUUID(),draftId=randomUUID(),instrumentKey='pkg_'+requestId.replace(/-/g,'').slice(0,16)+'_'+index
  const source={...approvedSource,provenance:{...approvedSource.provenance,packageBindingIdentity:{importId:requestId,draftId,slotKey:component.slotKey}}}
  // Internal binding only. This row is excluded from standalone discovery and all
  // consumers must recheck the parent grant and the complete package membership.
  await tx.$executeRaw`INSERT INTO survey_tool_grants(id,user_id,status,snapshot,snapshot_digest,created_by) VALUES(${technicalGrantId},${actor},'ACTIVE',${JSON.stringify(source)}::jsonb,${canonicalHash(source)},${grant.created_by})`
  await tx.surveyInstrumentDraft.create({data:{id:draftId,projectId,instrumentKey,kind:source.ref.kind,title:source.title,definition:source.displayDefinition as Prisma.InputJsonValue,catalogGrantId:technicalGrantId}})
  bindings.push({draftId,slotKey:component.slotKey,instrumentKey,technicalGrantId})
 }
 await tx.$executeRaw`INSERT INTO survey_package_imports(id,grant_id,project_id,tool_id,snapshot_hash,bindings) VALUES(${requestId},${grantId},${projectId},${tool.id},${tool.snapshot_hash},${JSON.stringify(bindings)}::jsonb)`
 for(const b of bindings)await tx.$executeRaw`INSERT INTO survey_package_members(draft_id,import_id,slot_key,technical_grant_id) VALUES(${b.draftId},${requestId},${b.slotKey},${b.technicalGrantId})`
 await audit(tx,actor,'PACKAGE_IMPORTED',{grantId,toolId:tool.id,importId:requestId,componentCount:bindings.length,standaloneRightsCreated:false},projectId)
 return {importId:requestId,title:tool.title,bindings,idempotent:false}
},{timeout:20000})}
/** Adds server-owned membership to in-memory snapshots only; stored grant digests remain exact source snapshots. */
export async function packageBoundCatalogSnapshots(tx:Prisma.TransactionClient,actor:string,map:Map<string,CatalogSourceSnapshot>,active:boolean){
 if(!map.size)return map
 const rows=await tx.$queryRaw<Array<{technical_grant_id:string;draft_id:string;import_id:string;slot_key:string;grant_id:string;project_id:string;tool_id:string;snapshot_hash:string}>>(Prisma.sql`SELECT m.*,i.grant_id,i.project_id,i.tool_id,i.snapshot_hash FROM survey_package_members m JOIN survey_package_imports i ON i.id=m.import_id WHERE m.technical_grant_id IN (${Prisma.join([...map.keys()])}) ORDER BY i.grant_id,m.draft_id`)
 const checked=new Map<string,PackageGrantRow>(),bound=new Set<string>(),verifiedTools=new Map<string,GovernedRow>()
 for(const b of rows){
  if(!checked.has(b.grant_id))checked.set(b.grant_id,await currentPackageGrant(tx,b.grant_id,actor,active,verifiedTools))
  const grant=checked.get(b.grant_id)!
  if(grant.tool_id!==b.tool_id||grant.snapshot_hash!==b.snapshot_hash)governedFail(409,'整包导入与当前精确授权不一致')
  const snapshot=map.get(b.technical_grant_id)!,{packageBindingIdentity,...provenance}=snapshot.provenance,identity=packageBindingIdentity as {importId?:string;draftId?:string;slotKey?:string}|undefined
  if(!identity||identity.importId!==b.import_id||identity.draftId!==b.draft_id||identity.slotKey!==b.slot_key)governedFail(409,'整包内部绑定身份不一致')
  const key=exactToolKey(b.tool_id,b.snapshot_hash)
  let tool=verifiedTools.get(key)
  if(!tool){tool=await governedRow(tx,b.tool_id);if(tool.snapshot_hash!==b.snapshot_hash)governedFail(409,'整包冻结版本摘要不一致');verifiedTools.set(key,tool)}
  const component=tool.snapshot.components.find(c=>c.slotKey===b.slot_key)
  if(!component||canonicalHash({...snapshot,provenance})!==canonicalHash(component.unit))governedFail(409,'整包内部绑定与批准组件不一致')
  bound.add(b.technical_grant_id)
  map.set(b.technical_grant_id,{...snapshot,provenance:{...provenance,surveyPackage:{importId:b.import_id,slotKey:b.slot_key,draftId:b.draft_id,projectId:b.project_id,parentGrantId:b.grant_id,toolId:b.tool_id,hash:b.snapshot_hash}}})
 }
 for(const [id,snapshot] of map)if(snapshot.provenance.packageBindingIdentity&&!bound.has(id))governedFail(403,'整包内部绑定缺少原导入记录')
 return map
}
export async function assertNotTechnicalPackageGrant(tx:Prisma.TransactionClient,id:string){const rows=await tx.$queryRaw<Array<{draft_id:string}>>`SELECT draft_id FROM survey_package_members WHERE technical_grant_id=${id}`;if(rows.length)governedFail(403,'整包绑定不能作为单独工具导入、复制或撤销；请操作整包授权')}
export async function freezeGovernedPackages(tx:Prisma.TransactionClient,actor:string,projectId:string,units:ResearchFrozenUnit[],flow:ResearchFrozenPublication['flow']):Promise<FrozenGovernedPackage[]>{
 let reportBytes=0
 const ids=[...new Set(units.flatMap(u=>{const p=u.sourceProvenance?.surveyPackage as {importId?:string}|undefined;return p?.importId?[p.importId]:[]}))].sort(),frozen:FrozenGovernedPackage[]=[]
 for(const id of ids){
  const [instance]=await tx.$queryRaw<Array<{grant_id:string;tool_id:string;project_id:string;snapshot_hash:string;bindings:Array<{draftId:string;slotKey:string;instrumentKey:string;technicalGrantId:string}>}>>`SELECT * FROM survey_package_imports WHERE id=${id} AND project_id=${projectId} FOR SHARE`
  if(!instance)governedFail(403,'组合导入不属于当前项目')
  const grant=await currentPackageGrant(tx,instance.grant_id,actor),tool=await governedRow(tx,instance.tool_id)
  if(grant.tool_id!==tool.id||instance.snapshot_hash!==tool.snapshot_hash||!packageFamily(tool.family))governedFail(409,'组合授权与固定版本不一致')
  const members=units.filter(u=>(u.sourceProvenance?.surveyPackage as {importId?:string}|undefined)?.importId===id)
  if(members.length!==instance.bindings.length||members.length!==tool.snapshot.components.length)governedFail(409,'整包授权禁止拆用；必须包含全部固定组件')
  const positions=instance.bindings.map(b=>units.findIndex(u=>u.draftId===b.draftId&&u.instrumentKey===b.instrumentKey))
  if(positions.some((p,i)=>p<0||i>0&&p!==positions[i-1]+1))governedFail(409,'组合组件必须按已批准顺序连续投放，禁止拆分或重排')
  for(const b of instance.bindings){
   const u=members.find(u=>u.draftId===b.draftId),c=tool.snapshot.components.find(c=>c.slotKey===b.slotKey)
   if(!u||!c||u.kind!==c.unit.ref.kind||canonicalHash(u.compiledDefinition)!==canonicalHash(c.unit.compiledDefinition)||canonicalHash(u.displayDefinition)!==canonicalHash(c.unit.displayDefinition))governedFail(409,'组合组件定义或绑定被更改')
  }
  if(flow){for(const b of instance.bindings){const blocks=flow.blocks.filter(block=>block.kind==='INSTRUMENT'&&block.instrumentKey===b.instrumentKey);if(blocks.length!==1||blocks[0].when)governedFail(409,'组合组件不能被条件跳过或分到不同问卷子版本')}}
  // Flow, rather than the units/result array, determines administration order.
  // Preserve the existing allowance for unconditional MATERIAL blocks; they do
  // not administer another instrument. External instruments may not interleave.
  if(flow){const execution=flow.blocks.filter(block=>block.kind==='INSTRUMENT'),start=execution.findIndex(block=>block.instrumentKey===instance.bindings[0].instrumentKey)
   if(start<0||instance.bindings.some((b,i)=>execution[start+i]?.instrumentKey!==b.instrumentKey))governedFail(409,'实际研究流程必须按已批准顺序连续执行整包工具，禁止重排或插入其他工具')}
  if(flow){const last=Math.max(...instance.bindings.map(b=>flow.blocks.findIndex(block=>block.kind==='INSTRUMENT'&&block.instrumentKey===b.instrumentKey)));if(flow.blocks.slice(0,last+1).some(block=>block.kind==='END'||block.when))governedFail(409,'整包组件完成前不能结束或使用条件分支')}
  if(flow?.experiment)governedFail(409,'整包版本不能拆入实验分支；请将完整组合独立投放')
  if(tool.snapshot.packageReport){reportBytes+=packageReportWorstCaseBytes(tool.snapshot.packageReport,tool.snapshot.components,tool.title);assertPackageReportBytes(reportBytes,'波次所有整包最坏展开合计')}
  frozen.push({schemaVersion:1,importId:id,toolId:tool.id,hash:tool.snapshot_hash,title:tool.title,family:tool.family as 'COMBINATION'|'BUNDLE',parentGrantId:grant.id,report:clone(tool.snapshot.packageReport),slots:instance.bindings.map(b=>({slotKey:b.slotKey,draftId:b.draftId,instrumentKey:b.instrumentKey,kind:members.find(u=>u.draftId===b.draftId)!.kind}))})
 }
 return frozen
}
/** Fresh new-admission/collection authority; stored results keep their exact package. */
export async function assertFrozenPackageAdmissions(tx:Prisma.TransactionClient,snapshot:ResearchFrozenPublication){
 if(!snapshot.governedPackages?.length)return
 const [project]=await tx.$queryRaw<Array<{owner_user_id:string}>>`SELECT owner_user_id FROM survey_projects WHERE id=${snapshot.projectId} FOR SHARE`
 if(!project)governedFail(403,'研究项目不可用')
 const verifiedTools=new Map<string,GovernedRow>()
 for(const p of snapshot.governedPackages??[]){
  const grant=await currentPackageGrant(tx,p.parentGrantId,project.owner_user_id,true,verifiedTools)
  if(grant.tool_id!==p.toolId||grant.snapshot_hash!==p.hash)governedFail(409,'冻结组合与当前授权不一致')
 }
}

async function packageImportSummaries(tx:Prisma.TransactionClient,projectId:string,input:{page:number}|{draftIds:string[]}){
 const rows=await tx.$queryRaw<Array<ListedPackageGrant&{import_id:string;bindings:Array<{draftId:string;slotKey:string;instrumentKey:string}>}>>(Prisma.sql`
  SELECT g.*,i.id AS import_id,i.bindings,to_jsonb(tool) AS tool,clock_timestamp() AS now,p.decision,p.paused
  FROM survey_package_imports i JOIN survey_package_grants g ON g.id=i.grant_id
  JOIN LATERAL(SELECT ${governedSummaryColumns} FROM survey_governed_tools t WHERE t.id=i.tool_id AND t.snapshot_hash=i.snapshot_hash) tool ON true
  LEFT JOIN survey_tool_policies p ON p.product='SURVEY' AND p.resource_key='governed-release:'||g.tool_id::text AND p.fingerprint=g.snapshot_hash
  WHERE i.project_id=${projectId} ${'draftIds'in input?Prisma.sql`AND EXISTS(SELECT 1 FROM survey_package_members member WHERE member.import_id=i.id AND member.draft_id=ANY(${input.draftIds}::text[]))`:Prisma.empty}
  ORDER BY i.created_at DESC,i.id ${'page'in input?Prisma.sql`LIMIT 26 OFFSET ${(input.page-1)*25}`:Prisma.sql`LIMIT 31`}`)
 if('draftIds'in input&&rows.length>30)governedFail(409,'选用整包身份数量超限，不能截断编排身份')
 return rows.map(r=>({...view(r,r.tool.title,r.tool.family),id:r.import_id,bindings:r.bindings,versions:r.tool.versions,components:r.tool.components,availability:packageAvailability(r)}))
}
export async function listProjectPackageImports(actor:string,projectId:string,page:number){return prisma.$transaction(async tx=>{
 await authorizedProject(tx,actor,projectId,false)
 const rows=await packageImportSummaries(tx,projectId,{page})
 return {list:rows.slice(0,25),page,hasMore:rows.length>25}
})}
/** Exact selected draft scope, independent of catalog/import-list pagination. */
export async function selectedPackageMemberships(actor:string,projectId:string,draftIds:string[]){return prisma.$transaction(async tx=>{
 await authorizedProject(tx,actor,projectId,false)
 if(!draftIds.length)return {list:[]}
 if(draftIds.length>30)governedFail(400,'选用工具身份数量超限')
 return {list:(await packageImportSummaries(tx,projectId,{draftIds:[...new Set(draftIds)]})).map(p=>({...p,bindings:p.bindings.map(b=>({draftId:b.draftId,slotKey:b.slotKey,instrumentKey:b.instrumentKey}))}))}
})}
