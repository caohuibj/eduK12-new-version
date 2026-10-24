import {randomUUID} from 'node:crypto'
import type {Prisma} from '@prisma/client'
import {prisma} from '../../config/database'
import {canonicalHash} from '../assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {authorizedProject} from './builder.service'
import {assertSystemSurveyDataAudit,type SystemDataAccess} from './system-data-authority'
import {governedFail} from './governed-tool.service'
import {renderPackageReport} from './governed-tool.reports'
import type {SurveyComputedFinal} from './final.compute'
import type {ResearchFrozenPublication} from './publication.service'
export async function persistGovernedPackageReports(tx:Prisma.TransactionClient,input:{projectId:string;waveId:string;finalId:string;sourceFinalHash:string;snapshot:ResearchFrozenPublication;calculated:SurveyComputedFinal}){
 for(const p of input.snapshot.governedPackages??[]){
  if(!p.report)continue
  const components=p.slots.map(s=>{const u=input.snapshot.units.find(u=>u.draftId===s.draftId&&u.instrumentKey===s.instrumentKey);if(!u)throw new Error('组合报告固定组件缺失');return {slotKey:s.slotKey,unit:{ref:{kind:u.kind},displayDefinition:u.displayDefinition}}})
  const report=renderPackageReport(p.report,components,input.calculated,Object.fromEntries(p.slots.map(s=>[s.slotKey,s.instrumentKey])))
  const value={schemaVersion:1,packageTitle:p.title,packageVersionHash:p.hash,reportVersion:p.report.version,sourceFinalHash:input.sourceFinalHash,report},hash=canonicalHash(value)
  await tx.$executeRaw`INSERT INTO survey_package_report_artifacts(id,project_id,wave_id,final_id,import_id,tool_id,snapshot_hash,source_final_hash,report_hash,report_cipher) VALUES(${randomUUID()},${input.projectId},${input.waveId},${input.finalId},${p.importId},${p.toolId},${p.hash},${input.sourceFinalHash},${hash},${encryptUnifiedRuntimePayload(value)})`
 }
}
export async function readGovernedPackageReports(actor:string,input:{projectId:string;waveId:string;finalId:string;systemAccess?:SystemDataAccess}){return prisma.$transaction(async tx=>{
 if(input.systemAccess)await assertSystemSurveyDataAudit(tx,actor,input.projectId,input.systemAccess);else await authorizedProject(tx,actor,input.projectId,false)
 const final=await tx.surveyWaveFinal.findFirst({where:{id:input.finalId,projectId:input.projectId,waveId:input.waveId,attempt:{status:'COMPLETED',excludedAt:null,OR:[{sampleReview:{is:null}},{sampleReview:{is:{verdict:'INCLUDED'}}}]}},select:{resultsHash:true}})
 if(!final)governedFail(404,'此答卷不存在或已不在当前可读取范围')
 const rows=await tx.$queryRaw<Array<{id:string;tool_id:string;import_id:string;source_final_hash:string;report_hash:string;report_cipher:string;created_at:Date}>>`SELECT * FROM survey_package_report_artifacts WHERE project_id=${input.projectId} AND wave_id=${input.waveId} AND final_id=${input.finalId} ORDER BY created_at,id LIMIT 30`
 return {list:rows.map(row=>{const artifact=decryptUnifiedRuntimePayload<unknown>(row.report_cipher);if(row.source_final_hash!==final!.resultsHash||canonicalHash(artifact)!==row.report_hash)governedFail(409,'已保存组合报告摘要与原答卷不一致');return {id:row.id,toolId:row.tool_id,importId:row.import_id,createdAt:row.created_at,artifact}}),semantics:'SAVED_AT_FINAL_NO_RESCORING',downloadPermission:'NOT_INCLUDED'}
})}

export async function listGovernedPackageReports(actor:string,projectId:string,waveId:string,page:number){return prisma.$transaction(async tx=>{await authorizedProject(tx,actor,projectId,false);const rows=await tx.$queryRaw<Array<{finalId:string;completedAt:Date;count:bigint}>>`SELECT r.final_id AS "finalId",max(r.created_at) AS "completedAt",count(*) AS count FROM survey_package_report_artifacts r JOIN survey_wave_finals f ON f.id=r.final_id JOIN survey_wave_attempts a ON a.id=f.attempt_id LEFT JOIN survey_sample_reviews v ON v.attempt_id=a.id WHERE r.project_id=${projectId} AND r.wave_id=${waveId} AND a.status='COMPLETED' AND a.excluded_at IS NULL AND (v.attempt_id IS NULL OR v.verdict='INCLUDED') GROUP BY r.final_id ORDER BY max(r.created_at) DESC,r.final_id LIMIT 26 OFFSET ${(page-1)*25}`;return {list:rows.slice(0,25).map(r=>({...r,count:Number(r.count)})),page,hasMore:rows.length>25}})}
