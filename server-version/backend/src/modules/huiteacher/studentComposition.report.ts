import {Prisma} from '@prisma/client'
import {decryptUnifiedRuntimePayload} from '../assessment-runtime/security'
import {readFormSectionCollectionFacts} from '../assessment-runtime/form-facts'
import {loadFrozenActiveSlotSet,compositeItemSlotKey,formSectionSlotKey} from '../assessment-runtime/slot-set'
import {createStoredScaleFactsReader,loadStoredCanonicalUnitResults} from '../assessment-runtime/compact-assessment-storage'
import {readFrozenCompositionIdentity} from '../assessment-run/educationCompositionExecution'
import type {RunResourcePolicy} from '../assessment-run/resourceAuthority'
import {formDraftSchema} from '../assessment-core/form/definition'
import {createProtectedFormItems,recordProtectedFormAnswers,discloseProtectedFormItems} from './groupReport.service'
import {createStudentScaleMetrics,recordStudentScaleMetrics,discloseStudentScaleMetrics} from './studentComposition.reducer'
import {studentCompositionRef,studentFormComparableKey} from './studentCompositionResource'
import type {PrivacyOptions} from '../report-privacy/schema'
import {privateToolFail} from '../education-tools/private-tool.contracts'

function fail():never{return privateToolFail('STUDENT_COMPOSITION_REPORT_SOURCE_INTEGRITY',409)}
type Tx=Prisma.TransactionClient
export async function collectStudentCompositionFinals(tx:Tx,input:{organizationId:string;runId:string;teacherUserId:string;
 versionId:string;contentHash:string;count:number;minimum:number;options?:PrivacyOptions}){
 const ref=studentCompositionRef(input.versionId)
 const [track]=await tx.$queryRaw<Array<{key:string;version:string;policy:RunResourcePolicy;policyHash:string}>>(Prisma.sql`
  SELECT resource_key AS key,resource_version AS version,frozen_resource_policy AS policy,resource_policy_hash AS "policyHash" FROM assessment_run_tracks
  WHERE organization_id=${input.organizationId} AND run_id=${input.runId} AND resource_family='BUNDLE' AND resource_key=${ref.key} AND resource_version=${ref.version}`)
 if(!track)fail()
 const identity=await readFrozenCompositionIdentity(tx,{...track,organizationId:input.organizationId})
 if(identity.origin.variantKey!=='TEACHER:STUDENT_REPORT'||identity.origin.contentHash!==input.contentHash)fail()
 // Read original Form definitions once for immutable question identity and
 // comparable hashes; Scale reporting needs only score labels, never formulas.
 const definitions=await tx.$queryRaw<Array<{blockId:string;definition:unknown;scores:Array<{key:string;label:string;displayPrecision?:number}>|null}>>(Prisma.sql`
  SELECT b->>'blockId' AS "blockId",
   CASE WHEN b->>'kind'='FORM' THEN COALESCE(v.definition,g.snapshot#>'{unit,displayDefinition}') END AS definition,
   CASE WHEN b->>'kind'='SCALE' THEN (SELECT jsonb_agg(jsonb_build_object('key',score->>'key','label',score->>'label','displayPrecision',score->'displayPrecision'))
    FROM jsonb_array_elements(COALESCE(v.definition,std.snapshot->'definition',library.snapshot->'compiledDefinition')->'scoring'->'scores') score) END AS scores
  FROM composite_assessments c CROSS JOIN LATERAL jsonb_array_elements(c.training_content_snapshot#>'{educationBinding,manifest}') b
  LEFT JOIN education_private_tool_versions v ON v.id=b->>'versionId' AND b->>'sourceProvider'='PRIVATE_VERSION'
  LEFT JOIN survey_governed_tools g ON g.id=b->>'versionId' AND b->>'sourceProvider'='PUBLIC_FORM' AND g.snapshot_hash=b->>'contentHash'
  LEFT JOIN survey_standard_releases std ON std.id=b->>'versionId' AND b->>'sourceProvider'='STANDARD_SCALE' AND std.combination_hash=b->>'contentHash'
  LEFT JOIN scale_library_entries entry ON entry.id=b->>'versionId' AND b->>'sourceProvider'='LIBRARY_SCALE'
  LEFT JOIN scale_library_submissions library ON library.id=entry.submission_id AND library.snapshot_hash=b->>'contentHash'
  WHERE c.id=${identity.compositeId} AND c.training_content_snapshot_hash=${identity.binding.manifestHash}`)
 if(definitions.length!==identity.manifest.length)fail()
 const blocks=identity.manifest.map(block=>{
  const definition=definitions.find(row=>row.blockId===block.blockId);if(!definition)fail()
  if(block.kind==='FORM'){
   const form=formDraftSchema.parse(definition.definition)
   if(form.pages.length!==block.sectionIds.length||form.pages.reduce((n,page)=>n+page.questions.length,0)!==block.itemIds.length)fail()
   return {block,form,unit:null,items:createProtectedFormItems(form),metrics:null,comparableKey:studentFormComparableKey(form)}
  }
  const unit=identity.units.find(unit=>unit.itemId===block.itemIds[0]),ceiling=identity.binding.unitReports.find(unit=>unit.blockId===block.blockId)
  if(!unit||!ceiling||ceiling.versionId!==block.versionId||ceiling.contentHash!==block.contentHash||!definition.scores)fail()
  const allowed=ceiling.subject?.mode==='AGGREGATE_ONLY'?ceiling.subject.metricKeys:[]
  if(allowed.some(key=>!definition.scores!.some(score=>score.key===key)))fail()
  return {block,unit,form:null,items:null,metrics:createStudentScaleMetrics(definition.scores.filter(score=>allowed.includes(score.key))),comparableKey:'SCALE:'+unit.measurementHash}
 })
 const scaleBlocks=blocks.filter(block=>block.metrics?.length),respondents=new Set<string>()
 const slots=blocks.flatMap(({block})=>block.kind==='SCALE'?(scaleBlocks.some(source=>source.block.blockId===block.blockId)?[compositeItemSlotKey(block.itemIds[0],'SCALE')]:[]):block.sectionIds.map(formSectionSlotKey))
 let cursor='',seen=0
 for(;;){
  const parents=await tx.$queryRaw<Array<{id:string;userId:string;subjectUserId:string;respondentUserId:string;attemptEpoch:number;contextSnapshotHash:string|null;frozenSlots:string;frozenSlotsHash:string}>>(Prisma.sql`
   SELECT p.id,p.user_id AS "userId",p.subject_user_id AS "subjectUserId",p.respondent_user_id AS "respondentUserId",p.attempt_epoch AS "attemptEpoch",
    p.context_snapshot_hash AS "contextSnapshotHash",p.frozen_active_slot_set_encrypted AS "frozenSlots",p.frozen_active_slot_set_hash AS "frozenSlotsHash"
   FROM assessment_run_executions e JOIN assessment_run_tracks t ON t.id=e.track_id AND t.run_id=e.run_id AND t.organization_id=e.organization_id
   JOIN assessment_run_actor_snapshots respondent ON respondent.id=e.respondent_actor_snapshot_id AND respondent.run_id=e.run_id AND respondent.organization_id=e.organization_id AND respondent.actor_role='STUDENT'
   JOIN assessment_run_actor_snapshots subject ON subject.id=e.subject_actor_snapshot_id AND subject.run_id=e.run_id AND subject.organization_id=e.organization_id AND subject.actor_role='TEACHER' AND subject.user_id=${input.teacherUserId}
   JOIN relational_assessment_assignments a ON a.id=e.relational_assignment_id AND a.policy_domain='ORGANIZATION_RUN' AND a.status='COMPLETED'
    AND a.subject_user_id=subject.user_id AND a.respondent_user_id=respondent.user_id AND a.analysis_mode='COHORT_AGGREGATE'
   JOIN composite_assessment_attempts p ON e.runtime_binding_kind='COMPOSITE' AND p.id=e.runtime_binding_ref AND p.assignment_ref=a.id AND p.episode_id=a.episode_id
    AND p.user_id=respondent.user_id AND p.respondent_user_id=respondent.user_id AND p.subject_user_id=subject.user_id
    AND p.composite_assessment_id=${identity.compositeId} AND p.status='COMPLETED' AND p.delivery_mode='FINAL_ONLY' AND p.runtime_generation='UNIFIED_V1'
   WHERE e.organization_id=${input.organizationId} AND e.run_id=${input.runId} AND e.status='COMPLETED' AND t.resource_family='BUNDLE'
    AND t.resource_key=${ref.key} AND t.resource_version=${ref.version} AND p.id>${cursor} ORDER BY p.id LIMIT 50`)
  if(!parents.length)break
  const epochs=parents.map(parent=>({compositeAttemptId:parent.id,attemptEpoch:parent.attemptEpoch}))
  const finals=await tx.assessmentUnitSnapshot.findMany({where:{OR:epochs,slotKey:{in:slots},terminalState:'COMPLETED'}})
  const sections=await tx.compositeFormSectionAttempt.findMany({where:{OR:parents.map(parent=>({attemptId:parent.id,attemptEpoch:parent.attemptEpoch})),
   sectionId:{in:blocks.flatMap(source=>source.block.sectionIds)},status:'COMPLETED'}})
  const children=scaleBlocks.length?await tx.assessment.findMany({where:{OR:epochs,compositeItemId:{in:scaleBlocks.map(block=>block.block.itemIds[0])}}}):[]
  const scaleFinals=finals.filter(final=>final.unitType==='SCALE')
  if(scaleFinals.some(final=>!final.canonicalResultEncrypted))fail()
  const reader=scaleFinals.length?await createStoredScaleFactsReader(children,tx):undefined
  const canonical=scaleFinals.length?await loadStoredCanonicalUnitResults(scaleFinals.map(final=>final.canonicalResultEncrypted!),tx,[],reader):[]
  for(const parent of parents){
   if(respondents.has(parent.userId))fail();respondents.add(parent.userId)
   const set=await loadFrozenActiveSlotSet(parent.frozenSlots,tx)
   if(set.snapshotHash!==parent.frozenSlotsHash||set.attemptEpoch!==parent.attemptEpoch)fail()
   for(const source of blocks){
    if(source.form){
     const answers:Record<string,unknown>={},missing:Array<{itemKey:string;reason:string}>=[];let offset=0
     for(const [index,page] of source.form.pages.entries()){
      const sectionId=source.block.sectionIds[index],final=finals.find(final=>final.compositeAttemptId===parent.id&&final.attemptEpoch===parent.attemptEpoch&&final.slotKey===formSectionSlotKey(sectionId))
      const slot=set.slots.find(slot=>slot.slotKey===formSectionSlotKey(sectionId))
      const section=sections.find(section=>section.attemptId===parent.id&&section.attemptEpoch===parent.attemptEpoch&&section.sectionId===sectionId)
      if(!final||!slot||!section||!section.submissionId||section.id!==final.sourceAttemptId||section.submissionId!==final.sourceSubmissionId
       ||final.unitType!=='FORM_SECTION'||!final.collectionFactsEncrypted||final.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash)fail()
      const facts=readFormSectionCollectionFacts(decryptUnifiedRuntimePayload(final.collectionFactsEncrypted))
      if(facts.schemaVersion!==3||facts.sectionKey!==sectionId||facts.items.length!==page.questions.length)fail()
      for(const [position,question] of page.questions.entries()){
       const fact=facts.items.find(item=>item.key===source.block.itemIds[offset+position]);if(!fact||fact.label!==question.prompt)fail()
       if(fact.state!=='ANSWERED')missing.push({itemKey:question.itemKey,reason:fact.state})
       else if(fact.rowStates&&fact.value&&typeof fact.value==='object'&&!Array.isArray(fact.value)){
        const value:Record<string,unknown>={...fact.value}
        for(const [row,state] of Object.entries(fact.rowStates))if(state!=='ANSWERED'){delete value[row];missing.push({itemKey:question.itemKey+':'+row,reason:state})}
        answers[question.itemKey]=value
       }else answers[question.itemKey]=fact.value
      }
      offset+=page.questions.length
     }
     recordProtectedFormAnswers(source.items!,answers,missing)
    }else if(source.metrics.length){
     const itemId=source.block.itemIds[0],slot=set.slots.find(slot=>slot.slotKey===compositeItemSlotKey(itemId,'SCALE'))
     const finalIndex=scaleFinals.findIndex(final=>final.compositeAttemptId===parent.id&&final.attemptEpoch===parent.attemptEpoch&&final.slotKey===compositeItemSlotKey(itemId,'SCALE'))
     const child=children.find(child=>child.compositeAttemptId===parent.id&&child.attemptEpoch===parent.attemptEpoch&&child.compositeItemId===itemId)
     if(!slot||!child||finalIndex<0||child.scaleId!==source.unit!.scaleId||child.status!=='COMPLETED'||child.subjectUserId!==input.teacherUserId
      ||child.userId!==parent.userId||child.respondentUserId!==parent.userId||!child.submissionId)fail()
     const final=scaleFinals[finalIndex],result=canonical[finalIndex]
     if(result.core.unitType!=='SCALE'||final.sourceAttemptId!==child.id||final.sourceSubmissionId!==child.submissionId||final.sourceDefinitionHash!==source.unit!.definitionHash
      ||final.sourceDefinitionHash!==slot.sourceDefinitionIdentity.hash||final.compiledRuntimeHash!==child.compiledRuntimeHash
      ||result.core.sourceDefinitionHash!==final.sourceDefinitionHash||result.core.compiledRuntimeHash!==final.compiledRuntimeHash
      ||result.core.contextHash!==parent.contextSnapshotHash||result.persistenceProvenance.sourceType!=='ASSESSMENT'
      ||result.persistenceProvenance.sourceAttemptId!==child.id||result.persistenceProvenance.sourceSubmissionId!==child.submissionId)fail()
     recordStudentScaleMetrics(source.metrics,result.core.metrics,result.core.quality.status)
    }
   }
  }
  seen+=parents.length;if(seen>input.count)fail();cursor=parents[parents.length-1].id
 }
 if(seen!==input.count)fail()
 return {respondents,comparableKeys:[...new Set(blocks.map(block=>block.comparableKey))],units:blocks.map(source=>({
  blockId:source.block.blockId,kind:source.block.kind,title:source.block.title,versionId:source.block.versionId,contentHash:source.block.contentHash,
  ...(source.form?{distributions:discloseProtectedFormItems(source.items!,input.count,input.options)}:
   {metrics:discloseStudentScaleMetrics(source.metrics,input.count,input.minimum,input.options),...(source.metrics.length?{}:{state:'WITHHELD' as const,reason:'AUDIENCE_NOT_ALLOWED'})}),
 }))}
}
