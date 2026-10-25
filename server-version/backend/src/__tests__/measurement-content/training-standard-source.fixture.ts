import {vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {sourceParts,composeTriplet,type Axis,type Part} from '../../modules/survey/standard-triplet.model'
import {prepareRelease} from '../../modules/measurement-content/release'
import {standardCombinationMeasurementInput} from '../../modules/measurement-content/standard-combination'
import {hashScaleDefinition} from '../../modules/scale/scale-definition'
import {getScaleInstrumentRuntimePolicy} from '../../modules/scale/onboarding/instrument-registry'
import {hashScaleDeploymentPolicy} from '../../modules/scale/policy/deployment'

export const tid=(n:number)=>`50000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export const ids={owner:tid(1),issuer:tid(2),system:tid(3),course:tid(4),composite:tid(5),item:tid(6),scale:tid(7),combo:tid(8),measurement:tid(9),root:tid(10),leaf:tid(11),auth:tid(12),deployment:tid(13),material:tid(14),attempt:tid(15)}

/** Existing-record doubles, never actual issuance, installation, approval or trial.
 * All domain authorization, deployment/license and source validators remain real. */
export function trainingSourceHarness(){
  const parts=Object.fromEntries(sourceParts('who5','1.0.0').map(p=>[p.axis,p])) as Record<Axis,Part>
  const snapshot=composeTriplet('who5',parts)
  const row:any={id:ids.combo,tool_key:'who5',combination_hash:snapshot.combinationHash,state:'ONLINE',approved_by:ids.system,snapshot,measurement_release:null}
  const prepared=prepareRelease(standardCombinationMeasurementInput(row))
  const release:any={id:ids.measurement,layer:prepared.layer,family:prepared.family,content_key:prepared.key,version:prepared.version,
    hash_scheme:prepared.hashScheme,content_hash:prepared.contentHash,content:prepared.content,scope:prepared.scope,provenance:prepared.provenance,
    asset_refs:prepared.assetRefs,source_release_id:prepared.sourceReleaseId,published_by:ids.system,published_at:new Date('2026-10-25T00:00:00Z'),status:'PUBLISHED'}
  row.measurement_release={releaseId:ids.measurement,contentHash:prepared.contentHash}
  const scale:any={id:ids.scale,code:'who5',instrumentVersion:'1.0.0',instrumentClass:'STANDARD',status:'PUBLISHED',visibility:'HIDDEN',creatorId:ids.system,
    libraryEntryId:null,measurementReleaseId:ids.measurement,definition:structuredClone(snapshot.definition),definitionHash:hashScaleDefinition(snapshot.definition)}
  const composite:any={id:ids.composite,status:'DRAFT',createdBy:ids.owner,productKind:'QUESTIONNAIRE',questionnaireType:'COURSE',deliveryMode:'FINAL_ONLY',publicEnabled:false,
    questionnaireCourses:[{courseId:ids.course}],items:[{id:ids.item,type:'SCALE',scaleId:ids.scale,scale}]}
  const principal:any={id:ids.owner,platform_role:'STANDARD',role:'TEACHER',account_domain:'TRAINING',teacher_approved:true,is_active:true,is_frozen:false,must_change_password:false,expires_at:new Date('2099-01-01')}
  const scope={product:'TRAINING',scope_kind:'PLATFORM',scope_id:'scale-library-governance',resource_kind:'material',resource_keys:[ids.measurement]}
  const common={...scope,capabilities:['material.distribute'],remaining_delegation_depth:0,delegable_capabilities:[],valid_from:new Date('2020-01-01'),expires_at:new Date('2099-01-01'),version:1,revoked_at:null,
    subject_active:true,subject_frozen:false,subject_expires_at:new Date('2099-01-01')}
  const grants:any[]=[{...structuredClone(common),id:ids.root,subject_id:ids.issuer,issuer_id:ids.system,parent_grant_id:null,ancestry:[ids.root]}]
  const use:any={id:ids.leaf,teacher_id:ids.owner,resource_id:ids.combo,granted_by:ids.issuer,authority_grant_id:ids.root,standard_combination_hash:row.combination_hash,version:1,revoked_at:null}
  const auth:any={id:ids.auth,authorizationKey:ids.auth,version:1,instrumentKey:'who5',instrumentVersion:'1.0.0',grantor:'SYNTHETIC UNIT FIXTURE',grantee:'SYNTHETIC UNIT FIXTURE',
    electronicAdministration:true,scoring:true,display:true,translation:true,territories:['CN'],locales:['zh-CN'],commercialNature:'NON_COMMERCIAL',
    validFrom:new Date('2020-01-01'),validTo:new Date('2099-01-01'),basis:'SYNTHETIC ONLY; NOT A REAL LICENSE',status:'APPROVED',
    evidenceAssetId:null,evidenceSha256:null,selfApprovalDeclaration:null,approvedByUserId:ids.system,approvedAt:new Date('2020-01-01'),createdByUserId:ids.system,createdAt:new Date('2020-01-01'),updatedAt:new Date('2020-01-01')}
  const policy:any={schemaVersion:1,revision:1,locale:'zh-CN',territory:'CN',commercialNature:'NON_COMMERCIAL',deploymentModes:['COMPOSITE'],requiredRightsActions:['electronicAdministration','scoring','display'],
    authorizationRefs:[ids.auth],runtimePolicyHash:getScaleInstrumentRuntimePolicy('who5','1.0.0')!.runtimePolicyHash,localizationVersion:'1.0.0',inFlightCompletion:'FROZEN_DEADLINE'}
  const deployment:any={id:ids.deployment,scaleId:ids.scale,revision:1,status:'ACTIVE',policyJson:policy,policyHash:hashScaleDeploymentPolicy(policy),authorizationRefs:[ids.auth],createdByUserId:ids.system,
    createdAt:new Date('2020-01-01'),activatedAt:new Date('2020-01-01'),retiredAt:null}
  const h={row,release,scale,composite,principal,grants,use,auth,policy,deployment,rows:new Map([[row.id,row]]),now:new Date('2026-10-25T06:00:00Z'),
    materialActive:true,entryActive:true,entryProduct:'TRAINING',entryRole:'STANDARD',owned:true,courseOwner:ids.owner,courseType:'TRAINING_COURSE',courseLibrary:false,
    emergency:false,scaleStop:false,missingMeasurement:false,expireDuringStop:false,expireLicenseDuringStop:false,sourceChanged:false,writes:[] as string[],calls:[] as string[]}
  const db:any={
    compositeAssessment:{findUnique:vi.fn(async()=>({...structuredClone(h.composite),...(!h.owned?{createdBy:'foreign'}:{})}))},
    scale:{findUnique:vi.fn(async()=>({...structuredClone(h.scale),...(h.sourceChanged?{code:'changed'}:{})}))},
    materialGrant:{findUnique:vi.fn(async()=>h.materialActive?{id:ids.material,teacherId:ids.owner,resourceType:'SCALE',resourceId:ids.scale,legacyScaleGrant:false}:null)},
    instrumentAuthorization:{findMany:vi.fn(async()=>h.auth?[structuredClone(h.auth)]:[])},
    assessmentReferenceSet:{findMany:vi.fn(async()=>h.row.snapshot.references.map((definition:any)=>({instrumentType:'SCALE',instrumentKey:'who5',referenceVersion:definition.referenceVersion,status:definition.status,definition})))},
    $executeRaw:vi.fn(async(query:any)=>{
      const sql=(query.sql??query.join('?')).replace(/\s+/g,' ').trim();h.calls.push(sql)
      if(sql.includes('SELECT pg_advisory_xact_lock_shared'))return 1
      h.writes.push(sql);throw new Error('Unexpected business write: '+sql)
    }),
    $queryRaw:vi.fn(async(query:any,...args:any[])=>{
      const sql=(query.sql??query.join('?')).replace(/\s+/g,' ').trim(),values=Array.isArray(query)?args:query.values;h.calls.push(sql)
      if(sql.includes('FROM composite_assessment_items i JOIN scales'))return h.owned&&values.includes(ids.owner)?[{code:'who5',instrument_version:'1.0.0'}]:[]
      if(sql.includes('SELECT id FROM composite_assessments'))return [{id:ids.composite}]
      if(sql.includes('FROM users WHERE id='))return [values[0]===ids.issuer?{...structuredClone(h.principal),id:ids.issuer,platform_role:h.entryRole}:structuredClone(h.principal)]
      if(sql.includes('FROM courses WHERE id IN'))return h.composite.questionnaireCourses.map((course:any)=>({id:course.courseId,creator_id:h.courseOwner,course_type:h.courseType,is_library:h.courseLibrary}))
      if(sql.includes('clock_timestamp() AS now'))return [{now:h.now}]
      if(sql.includes('SELECT id FROM scales WHERE id='))return [{id:ids.scale}]
      if(sql.includes('SELECT id FROM material_grants'))return h.materialActive?[{id:ids.material}]:[]
      if(sql.includes('SELECT library_entry_id FROM scales'))return [{library_entry_id:null}]
      if(sql.includes('FROM scale_library_use_grants g'))return []
      if(sql.includes('SELECT e.id FROM scale_library_entries'))return []
      if(sql.includes('FROM material_grants WHERE teacher_id='))return h.use&&h.use.teacher_id===values[0]&&h.use.resource_id===values[1]&&(!values[2]||h.use.id===values[2])?[structuredClone(h.use)]:[]
      if(sql.includes('FROM material_grants WHERE id='))return h.use?.id===values[0]?[structuredClone(h.use)]:[]
      if(sql.includes('FROM content_capability_grants leaf'))return values[0]===ids.root?structuredClone(h.grants):[]
      if(sql.includes('SELECT issuer_id FROM content_capability_grants'))return [{issuer_id:h.grants.find(g=>g.id===ids.leaf)?.issuer_id??'missing'}]
      if(sql.includes('JOIN "admin_entry_grants"'))return h.entryActive&&h.entryProduct==='TRAINING'&&h.entryRole==='STANDARD'&&values.includes(ids.issuer)?[{id:ids.issuer}]:[]
      if(sql.includes('SELECT id FROM scale_deployment_policies'))return h.deployment?.status==='ACTIVE'?[{id:ids.deployment}]:[]
      if(sql.includes('FROM "scale_deployment_policies"'))return h.deployment?.status==='ACTIVE'?[structuredClone(h.deployment)]:[]
      if(sql.includes('FROM survey_standard_releases')){
        const found=h.rows.get(values[0]);if(!found)return []
        return sql.includes('SELECT tool_key')?[{tool_key:found.tool_key,instrument_version:found.snapshot.instrumentVersion,measurement_release:structuredClone(found.measurement_release)}]:[structuredClone(found)]
      }
      if(sql.includes('SELECT * FROM measurement_content_releases'))return h.missingMeasurement?[]:[structuredClone(h.release)]
      if(sql.includes('SELECT id,status,content_hash,hash_scheme FROM measurement_content_releases'))return h.missingMeasurement?[]:[{
        id:h.release.id,status:h.release.status,content_hash:h.release.content_hash,hash_scheme:h.release.hash_scheme}]
      if(sql.includes('SELECT id,measurement_release_id FROM scales'))return [{id:ids.scale,measurement_release_id:h.scale.measurementReleaseId}]
      if(sql.includes('WITH RECURSIVE ancestors')){
        if(h.expireDuringStop)h.now=new Date('2100-01-01')
        if(h.expireLicenseDuringStop)h.now=new Date('2028-01-01')
        return [{id:ids.measurement,truncated:false}]
      }
      if(sql.includes('SELECT id FROM measurement_content_releases'))return [{id:ids.measurement}]
      if(sql.includes('FROM scale_library_emergency_stops'))return sql.includes("WHERE target_kind='TRAINING_SCALE' AND target_id=")
        ?h.scaleStop?[{target_id:ids.scale}]:[]:h.emergency?[{target_id:ids.measurement}]:[]
      throw new Error('Unexpected SQL: '+sql)
    }),
  }
  const input={itemId:ids.item,combination:{releaseId:ids.combo,combinationHash:row.combination_hash},useGrantId:ids.leaf}
  const context={actorId:ids.owner,compositeId:ids.composite,courseId:ids.course,attemptId:ids.attempt,epoch:1,publicationHash:canonicalHash({syntheticPublication:1})}
  return {h,db,input,context,root:()=>h.grants[0]!,leaf:()=>h.use}
}
