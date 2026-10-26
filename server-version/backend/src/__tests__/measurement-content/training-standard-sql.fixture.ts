import {randomUUID} from 'node:crypto'
import {Prisma,type PrismaClient} from '@prisma/client'
import {compileResearchScale} from '../../modules/survey/builder.compiler'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileStandardCombinationReport,standardCombinationHash,standardAxisHashes,standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {publishContentRelease} from '../../modules/measurement-content/repository'
import {toolReference} from '../../modules/survey/tool-reference'
import type {Triplet,Axis,Part} from '../../modules/survey/standard-triplet.model'

export function assertStandardSqlIsolation(){
 const url=new URL(process.env.DATABASE_URL??'')
 if(process.env.NODE_ENV!=='test'||!['localhost','127.0.0.1'].includes(url.hostname)||!/^\/eduk12_combination_flow_\d{8}_\d{6}$/.test(url.pathname))
  throw new Error('Dedicated loopback standard-combination fixture database required')
}
/** Synthetic storage/21B fixture only. It stays APPROVED and has no trial rows:
 * never fabricate ONLINE proof or call installation/approval/trial services. */
export async function seedUntriedStandardSqlFixture(db:PrismaClient){
 assertStandardSqlIsolation()
 const create=(name:string,role:'TEACHER'|'STUDENT',platformRole:'STANDARD'|'SYSTEM_ADMIN'='STANDARD')=>db.user.create({data:{
  username:'standard-sql-'+name+'-'+randomUUID(),passwordHash:'SYNTHETIC FIXTURE ONLY',role,platformRole,accountDomain:'TRAINING',teacherApproved:role==='TEACHER'}})
 const system=await create('system','STUDENT','SYSTEM_ADMIN'),issuer=await create('entry','STUDENT'),teacher=await create('teacher','TEACHER')
 await db.adminEntryGrant.create({data:{id:randomUUID(),userId:issuer.id,entry:'TRAINING',grantedBy:system.id}})
 const definition=compileResearchScale('隔离 SQL/CPU 合成工具',{
  schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'one',label:'较少',score:1},{optionKey:'two',label:'较多',score:2}],
  dimensions:[{dimensionKey:'effort',label:'合成指标',direction:'descriptive'}],
  items:Array.from({length:64},(_,i)=>({itemKey:'synthetic_'+i,prompt:'仅供隔离测试的合成条目 '+i,required:true,reverse:false,dimensionKeys:['effort']})),
 })
 const key='synthetic-sql-'+randomUUID(),reference=toolReference('SCALE',key,{syntheticFixtureOnly:true})
 const {report,referencePolicy,source:_,license:__,...content}=definition
 const payloads={CONTENT:content,PARAMETERS:{referencePolicy,references:[]},REPORT:report}
 const parts=Object.fromEntries((['CONTENT','PARAMETERS','REPORT'] as Axis[]).map(axis=>[axis,{axis,version:'synthetic-'+axis,payload:payloads[axis],hash:canonicalHash(payloads[axis]),sourceVersion:'1.0.0',reference}])) as Record<Axis,Part>
 const combinationHash=standardCombinationHash(key,standardAxisHashes(parts)),id=randomUUID()
 const snapshot:Triplet={schemaVersion:1,toolKey:key,title:'隔离 SQL/CPU 合成工具',instrumentVersion:'1.0.0',parts,definition,references:[],
  template:compileStandardCombinationReport('隔离 SQL/CPU 合成工具',definition,true).template,combinationHash,blockers:[],reference}
 const row={id,tool_key:key,combination_hash:combinationHash,state:'APPROVED',approved_by:system.id,snapshot,measurement_release:null}
 const measurement=await db.$transaction(async tx=>{
  await tx.$executeRaw(Prisma.sql`INSERT INTO survey_standard_releases(id,tool_key,combination_hash,snapshot,reference,state,approved_by)
   VALUES(${id},${key},${combinationHash},${JSON.stringify(snapshot)}::jsonb,${JSON.stringify(reference)}::jsonb,'APPROVED',${system.id})`)
  const measurement=await publishContentRelease(tx,standardCombinationMeasurementInput(row),system.id)
  // A staged C pointer does not manufacture successful execution/trial facts.
  await tx.$executeRaw(Prisma.sql`UPDATE survey_standard_releases SET measurement_release=${JSON.stringify({releaseId:measurement.releaseId,contentHash:measurement.contentHash})}::jsonb WHERE id=${id}`)
  return measurement
 })
 return {system,issuer,teacher,pointer:{releaseId:id,combinationHash},measurement,definition}
}
