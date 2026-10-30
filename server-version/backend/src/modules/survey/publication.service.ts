import {loadSurveyTrackingSource,inheritedSurveyTrackingUnit,surveyTrackingDefaultSelections} from './tracking-source'
import {freezeSurveyTracking,surveyFormTrackingIdentity,type SurveyTrackingSelection,type SurveyTrackingBinding} from './personal-tracking'
import {surveyProfileMeasurementInput} from './cognitive-profile.definition'
import type {SurveyNativeBundle} from '../bundle-product/survey-native'
import { SURVEY_NATIVE_SJT_PROTOCOL } from './situational-native.contract'
import type {SituationRuntimeDefinition} from '../situational/situation-runtime-definition'
import {surveyNativeSituationalRequiresStageNotice,type FrozenSurveyNativeSituationalHeader,type SurveyNativeSituationalHeader } from './situational-native.definition'
import {bindGovernedToolContent} from './governed-tool.content'
import {freezeGovernedPackages} from './governed-package.service'
import type {PackageReport} from './governed-tool.model'
import {bindApprovedTripletContent} from './standard-triplet.content'
import {freezeSurveyParticipantFeedback,type SurveyRawFeedback,type SurveyParticipantFeedbackSelection} from './participant-feedback'
import {freezeSurveyContentSelections,type SurveyContentSelection,type FrozenSurveyContentSelection} from './content-selection'
import {ContentReleaseError} from '../measurement-content/release'
import { cognitiveMeasurementRelease } from '../measurement-content/cognitive'
import { sjtMeasurementRelease } from '../measurement-content/sjt'
import { publishContentRelease,requirePublishedContentRelease } from '../measurement-content/repository'
import { parseFrozenSurveyCognitive } from './cognitive.definition'
import { scaleMeasurementRelease, surveyScaleReleaseContext } from '../measurement-content/scale'
import {catalogSnapshotsForDrafts,compileCatalogUnit} from './catalog.service'
import {recheckCatalogSjtSourceAuthority,type SourceAnswerMapping} from './catalog.sources'
import { freezeSurveyMeasurementNotice,type SurveyMeasurementNotice } from './measurement.notice'
import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { retainSurveyMedia } from './media.references'
import {assertSurveyDraft,surveyKindSchema,formWorstCaseAnswerBytes,
  type FormDraft,type ScaleDraft,type AnySjtDraft} from './builder.definition'
import { compileResearchCognitive } from './cognitive.definition'
import { surveySjtQuestions } from './sjt-structure'
import { compileResearchScale, compileResearchSjt } from './builder.compiler'
import { SurveyWaveError } from './waves.service'
import { compileSurveyFlow,SurveyFlowError,type FrozenSurveyFlow } from './flow.definition'
import { compileGroupQuotaPolicy,compileCheckpointPolicy,
  type SurveyGroupQuotaPolicy,type SurveyCheckpointPolicy } from './operations.definition'

import { freezeGroupIpPolicy,resolveGroupIpOpenWindow,type FrozenGroupIpPolicy } from './group-ip-policy'

/** Stored data contract for PR3 anonymous Wave runtime adapter.
 * This is a frozen research-only definition, NOT a formal scale/SJT
 * publication. The Survey FINAL admission adapter is separate from legacy catalog.
 */
export interface ResearchFrozenUnit {
  trackingIdentity?:{measurementHash:string;metrics:Array<{key:string;label:string;unit:string}>}
  longitudinalMetricKeys?:string[]
  nativeBundleReport?:{definitionHash:string;audience:'student'|'researcher'|null;policy:import('../scale/projection/types').EffectiveScaleDisclosureSnapshot}
  executionProtocol?:'SITUATIONAL_NATIVE_V1'
  /** Catalog previews carry an unbound header; persisted publication adds time/epoch.
   * Native runtime and receipt consumers must use the strict frozen parser. */
  nativeSituational?:FrozenSurveyNativeSituationalHeader|SurveyNativeSituationalHeader
  revisionSourceReleaseId?:string
  authoringFamilyId?:string
  authoringVersion?:number
  participantFeedback?:SurveyRawFeedback
  contentSelection?:FrozenSurveyContentSelection
  measurementRelease?: { releaseId: string; contentHash: string; measurementHash: string }
  sourceProvenance?:Record<string,unknown>
  sourceAnswerMapping?:SourceAnswerMapping
  /** Administration instruction frozen with this unit's exact source version. */
  instruction?:string
  draftId:string
  instrumentKey:string
  kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE'
  title:string
  draftRevision:number
  sourceDigest:string
  scoringDigest:string|null
  compiledDefinition:unknown
  displayDefinition:unknown
}
export interface FrozenGovernedPackage {nativeBundle?:SurveyNativeBundle;schemaVersion:1;importId:string;toolId:string;hash:string;title:string;family:'COMBINATION'|'BUNDLE';parentGrantId:string;report:PackageReport|null;slots:Array<{slotKey:string;draftId:string;instrumentKey:string;kind:'FORM'|'SCALE'|'SJT'|'COGNITIVE'}>}
export interface ResearchFrozenPublication {
  longitudinal?:SurveyTrackingBinding
  governedPackages?:FrozenGovernedPackage[]
  schemaVersion:1
  purpose:'RESEARCH_ONLY'
  projectId:string
  waveId:string
  collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
  consentVersion:number
  linkageNoticeConfirmed:boolean
  consentDigest:string
  measurementNotice?:SurveyMeasurementNotice
  units:ResearchFrozenUnit[]
  flow?:FrozenSurveyFlow
  quotaPolicy?:SurveyGroupQuotaPolicy
  checkpointPolicy?:SurveyCheckpointPolicy
  groupIpPolicy?:FrozenGroupIpPolicy
  runtimeStatus:'SURVEY_FINAL_V1'
}
const stop=(message:string):never=>{throw new SurveyWaveError(409,message)}

/** One publication rule for read-only preflight and locked freeze. Catalog
 * families still migrated at freeze must not gain an extra manual publish step. */
export function surveyMeasurementPublicationMode(unit:Pick<ResearchFrozenUnit,'kind'|'sourceProvenance'>):'NONE'|'EXPLICIT'|'AT_FREEZE'{
  if(unit.kind==='FORM')return 'NONE'
  return unit.sourceProvenance&&(unit.kind!=='SCALE'||Boolean(unit.sourceProvenance.surveyPackage))
    ?'AT_FREEZE':'EXPLICIT'
}

/** Both paths derive identical identity from the existing compiler and adapters. */
export function surveyMeasurementReleaseInput(unit:ResearchFrozenUnit,actorId:string,projectId:string){
  if(unit.kind==='FORM')throw new SurveyWaveError(400,'普通表单不生成测量版本')
  const scope={kind:'PRIVATE' as const,ownerId:actorId,product:'SURVEY' as const,resourceId:projectId}
  if(unit.kind==='COGNITIVE'){
    const frozen=parseFrozenSurveyCognitive(unit.compiledDefinition),snapshot=frozen.sessionSnapshot
    if(frozen.schemaVersion===2)return surveyProfileMeasurementInput(frozen,{localId:unit.draftId,version:String(unit.draftRevision),scope})
    return cognitiveMeasurementRelease({localId:unit.draftId,version:String(unit.draftRevision),scope,
      testType:snapshot.testType,configVersion:snapshot.configVersion,engineVersion:snapshot.engineVersion,
      scoringVersion:snapshot.scoringVersion,config:snapshot.config,
      protocolContext:{timingPolicy:frozen.timingPolicy,devicePolicy:frozen.devicePolicy,restartLimit:frozen.restartLimit}})
  }
  if(unit.kind==='SJT')return sjtMeasurementRelease({localId:unit.draftId,version:String(unit.draftRevision),
    instrumentVersion:String(unit.sourceProvenance?.governedInstrumentVersion??surveyScaleReleaseContext(unit).instrumentVersion),definition:unit.compiledDefinition,
    ...(unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL?{}:{displayProtocol:unit.displayDefinition}),scope,provenance:unit.sourceProvenance??{}})
  const source=unit.sourceProvenance?.sourceMeasurementRelease as {releaseId?:string}|undefined
  if(unit.sourceProvenance&&!source?.releaseId)throw new SurveyWaveError(409,'目录量表须先由来源管理者完成显式版本转换，再重新授权导入')
  return scaleMeasurementRelease({localId:unit.draftId,version:unit.authoringVersion?`v${unit.authoringVersion}`:String(unit.draftRevision),sourceReleaseId:source?.releaseId??unit.revisionSourceReleaseId??null,
    ...surveyScaleReleaseContext(unit),...(typeof unit.sourceProvenance?.governedInstrumentVersion==='string'?{instrumentVersion:unit.sourceProvenance.governedInstrumentVersion}:typeof unit.sourceProvenance?.standardInstrumentVersion==='string'?{instrumentVersion:unit.sourceProvenance.standardInstrumentVersion}:{}),definition:unit.compiledDefinition,
    instrumentClass:unit.sourceProvenance&&unit.sourceProvenance.instrumentClass!=='CUSTOM_DESCRIPTIVE'?'STANDARD':'CUSTOM_DESCRIPTIVE',provenance:{...(unit.sourceProvenance??{}),
      ...(!unit.sourceProvenance&&unit.authoringFamilyId?{authoringRelationship:unit.revisionSourceReleaseId?((unit.authoringVersion??1)>1?'REVISION':'COPY'):'ORIGINAL',authoringFamilyId:unit.authoringFamilyId??unit.draftId,authoringVersion:unit.authoringVersion??1,
        authoringSnapshot:{title:unit.title,definition:unit.displayDefinition,instrumentClass:'CUSTOM_DESCRIPTIVE',product:'SURVEY'}}:{})},scope})
}
export async function publishSurveyMeasurementUnit(tx:Prisma.TransactionClient,unit:ResearchFrozenUnit,actorId:string,projectId:string){
  const release=await publishContentRelease(tx,surveyMeasurementReleaseInput(unit,actorId,projectId),actorId)
  if(release.layer!=='MEASUREMENT')throw new Error('研究测量发布身份不匹配')
  if(release.status!=='PUBLISHED')throw new SurveyWaveError(409,'该测量版本已停止用于新施测，请发布新版本')
  return release
}
export async function resolveSurveyMeasurementUnit(tx:Prisma.TransactionClient,unit:ResearchFrozenUnit,actorId:string,projectId:string){
  try{
    const release=await requirePublishedContentRelease(tx,surveyMeasurementReleaseInput(unit,actorId,projectId))
    if(release.layer!=='MEASUREMENT')throw new Error('研究测量发布身份不匹配')
    return release
  }catch(error){
    if(error instanceof ContentReleaseError)throw new SurveyWaveError(409,
      error.code==='CONTENT_RELEASE_NOT_PUBLISHED'?'请先显式发布当前修订的测量版本，再冻结波次':'测量发布版本已变化或不可用于新施测，请刷新核对')
    throw error
  }
}

export function compileFrozenResearchUnit(draft:{
  id:string;instrumentKey:string;kind:string;title:string;revision:number;definition:unknown;authoringFamilyId?:string|null;authoringVersion?:number|null;revisionSourceReleaseId?:string|null
}):ResearchFrozenUnit {
  const kind=surveyKindSchema.parse(draft.kind)
  const normalized=assertSurveyDraft(kind,draft.definition,true)
  const sourceDigest=canonicalHash(JSON.parse(JSON.stringify({kind,definition:normalized})))
  if(kind==='FORM'){
    return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
      draftRevision:draft.revision,sourceDigest,scoringDigest:null,
      compiledDefinition:normalized,displayDefinition:normalized}
  }
  if(kind==='SCALE'){
    const compiled=compileResearchScale(draft.title,normalized)
    return {...(draft.authoringFamilyId?{authoringFamilyId:draft.authoringFamilyId,authoringVersion:draft.authoringVersion??1,...(draft.revisionSourceReleaseId?{revisionSourceReleaseId:draft.revisionSourceReleaseId}:{})}:{}),draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
      draftRevision:draft.revision,sourceDigest,
      scoringDigest:canonicalHash(compiled.scoring),compiledDefinition:compiled,displayDefinition:normalized}
  }
  if(kind==='COGNITIVE'){
    const compiled=compileResearchCognitive(normalized)
    return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
      draftRevision:draft.revision,sourceDigest,scoringDigest:compiled.measurementDigest,
      compiledDefinition:compiled,displayDefinition:normalized}
  }
  const sjt=compileResearchSjt(draft.instrumentKey,normalized)
  return {draftId:draft.id,instrumentKey:draft.instrumentKey,kind,title:draft.title,
    draftRevision:draft.revision,sourceDigest,
    scoringDigest:canonicalHash(sjt.package.definition.scoring),
    compiledDefinition:sjt.package.definition,displayDefinition:normalized}
}

/** Freeze one immutable research publication. OPEN admission is a separate
 * authenticated action and remains fail-closed behind SURVEY_PUBLICATION_ENABLED.
 */
export async function freezeResearchWaveDraft(input:{
  actorUserId:string;projectId:string;waveId:string;revision:number;tracking?:SurveyTrackingSelection;contentSelections?:SurveyContentSelection[];participantFeedback?:SurveyParticipantFeedbackSelection[]
}):Promise<{publicationId:string;version:number;digest:string;waveId:string;runtimeReady:true}> {
  return prisma.$transaction(async tx=>{
    // Lock project first so concurrent freezes share one exact publication sequence.
    const locked=await tx.$queryRaw<Array<{id:string;status:string;collectionMode:string;expires_at:Date|null;checked_at:Date}>>`
      WITH locked AS MATERIALIZED (
      SELECT p.id,p.status,p.collection_mode AS "collectionMode",u.expires_at
      FROM "survey_projects" p
      JOIN "users" u ON u.id=p.owner_user_id
      JOIN "survey_researcher_grants" g ON g.user_id=u.id
      JOIN "survey_mfa_credentials" m ON m.user_id=u.id
      WHERE p.id=${input.projectId} AND p.owner_user_id=${input.actorUserId}
        AND u.account_domain='SURVEY' AND u.is_active AND NOT u.is_frozen
        AND (u.expires_at IS NULL OR u.expires_at>statement_timestamp())
        AND g.status='ACTIVE' AND m.enabled=TRUE
      FOR UPDATE OF p FOR SHARE OF u,g,m
      ) SELECT locked.*,clock_timestamp() AS checked_at FROM locked
    `
    const project=locked[0]
    if(!project||(project.expires_at&&project.expires_at<=project.checked_at))stop('该研究不属于当前研究者')
    if(!['DRAFT','ACTIVE'].includes(project.status))stop('项目状态不允许冻结新的研究内容')
    const lockedWave=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "survey_waves"
      WHERE "id"=${input.waveId} AND "project_id"=${input.projectId}
      FOR UPDATE
    `
    if(!lockedWave.length)stop('研究波次不存在')
    const wave=await tx.surveyWave.findUniqueOrThrow({where:{id:input.waveId}})
    if(wave.revision!==input.revision||wave.status!=='DRAFT'||wave.publicationId)
      stop('波次已经冻结或被其他编辑会话修改')
    if(wave.consentText.trim().length<20)stop('知情同意信息至少需要 20 字')
    if(project.collectionMode==='LINKED_WAVES'&&!wave.linkageNoticeConfirmed)
      stop('跨波次研究需先确认已明确告知研究编号会关联历次作答')
    const ids=Array.isArray(wave.instrumentIds)?wave.instrumentIds:[]
    if(!ids.length||ids.length>30||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)
      stop('波次必须准确选择 1–30 个不同研究工具')
    const orderedIds=ids as string[]
    // Rows locked before snapshot so a simultaneous draft update cannot
    // change the definition between compiler read and commit.
    const locks=await tx.$queryRaw<Array<{id:string}>>`
      SELECT "id" FROM "survey_instrument_drafts"
      WHERE "project_id"=${input.projectId} AND "id" IN (${Prisma.join(orderedIds)})
        AND "status" IN ('DRAFT','PUBLISHED')
      ORDER BY "id" FOR SHARE
    `
    if(locks.length!==orderedIds.length)stop('波次中存在被删除、归档或越权的研究工具')
    const rows=await tx.surveyInstrumentDraft.findMany({
      where:{projectId:input.projectId,id:{in:orderedIds},status:{in:['DRAFT','PUBLISHED']}},
    })
    const inheritedSnapshot=await loadSurveyTrackingSource(tx,input.projectId,wave.longitudinalSourceWaveId)
    const sources=await catalogSnapshotsForDrafts(tx,input.actorUserId,rows.flatMap(r=>r.catalogGrantId?[r.catalogGrantId]:[]))
    const byId=new Map(rows.map(row=>[row.id,row]))
    const frozenAt=new Date()
    const units=orderedIds.map(id=>{
      const draft=byId.get(id)
      if(!draft)stop('研究工具来源已发生变化')
      const catalogUnit=draft!.catalogGrantId?compileCatalogUnit(draft!,sources.get(draft!.catalogGrantId)!):undefined
      const inherited=inheritedSurveyTrackingUnit(inheritedSnapshot,draft!)
      if(inherited&&catalogUnit&&inherited.sourceDigest!==catalogUnit.sourceDigest)stop('冻结追踪工具的授权来源版本已变化')
      const unit=inherited??catalogUnit??compileFrozenResearchUnit(draft!)
      return unit.nativeSituational?{...unit,nativeSituational:{...unit.nativeSituational,attemptEpoch:1 as const,frozenAt:frozenAt.toISOString()}}:unit
    })
    const feedbackMetrics=new Map<string,string[]>()
    for (const unit of units) {
      if (unit.kind === 'FORM') {unit.trackingIdentity=surveyFormTrackingIdentity(unit);continue}
      // Scale catalog imports now use the same explicit publication action as
      // native drafts. Other catalog families retain their separate migration.
      const release=surveyMeasurementPublicationMode(unit)==='AT_FREEZE'
        ?await publishSurveyMeasurementUnit(tx,unit,input.actorUserId,input.projectId)
        :await resolveSurveyMeasurementUnit(tx,unit,input.actorUserId,input.projectId)
      const scoring=unit.compiledDefinition as {scoring?:{scores?:Array<{key:string;label:string}>;publishedMetrics?:Array<{key:string;label:string}>}}
      const labels=unit.kind==='SCALE'?scoring.scoring?.scores:scoring.scoring?.publishedMetrics
      unit.trackingIdentity={measurementHash:release.content.measurementHash,metrics:release.content.metrics.map(metric=>({
        key:metric.metricKey,unit:metric.unit,label:labels?.find(m=>m.key===metric.metricKey)?.label??metric.metricKey}))}
      feedbackMetrics.set(unit.draftId,release.content.metrics.map(metric=>metric.metricKey))
      unit.measurementRelease = { releaseId: release.releaseId, contentHash: release.contentHash,
        measurementHash: release.content.measurementHash }
    }
    for(const unit of units){await bindApprovedTripletContent(tx,unit,input.actorUserId);await bindGovernedToolContent(tx,unit,input.actorUserId)}
    const defaults=surveyTrackingDefaultSelections(inheritedSnapshot,units)
    const participantFeedback=input.participantFeedback??defaults.participantFeedback
    const contentSelections=input.contentSelections??defaults.contentSelections
    if(participantFeedback.some(s=>units.some(u=>s.feedback.mode==='DESCRIPTIVE'&&u.draftId===s.instrumentId&&(u.sourceProvenance?.surveyStandardReleaseId||u.sourceProvenance?.surveyToolReleaseId)&&u.sourceProvenance?.reportConfigured===false)))stop('已批准组合明确不反馈，不能在投放时添加报告反馈')
    if((input.contentSelections??[]).some(s=>units.some(u=>u.draftId===s.instrumentId&&(u.sourceProvenance?.surveyStandardReleaseId||u.sourceProvenance?.surveyToolReleaseId))))stop('已批准标准工具的参数与报告组合已冻结，不能在投放时替换版本')
    freezeSurveyParticipantFeedback(units,participantFeedback,feedbackMetrics)
    await freezeSurveyContentSelections(tx,input.actorUserId,input.projectId,units,contentSelections)
    // Initial bounded research safety limit, not a measured capacity claim.
    if(units.filter(unit=>unit.kind==='COGNITIVE').length>4)
      stop('一个波次最多包含 4 个受控认知任务（480 个正式试次）')
    // Freeze-time budget must guarantee eventual FINAL can carry both answers
    // and the optional timing records; never publish an unfinishable study.
    const timedItems=units.reduce((total,u)=>total+(u.kind==='SCALE'&&
      (u.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE'
      ?(u.displayDefinition as ScaleDraft).items.length:0),0)
    if(timedItems>3000)stop('逐题计时量表超过单次 FINAL 3000 题的安全提交预算')
    let checkpointBudgetBytes=0
    if(timedItems||units.some(unit=>unit.kind==='COGNITIVE'||unit.kind==='SJT'&&
      (unit.displayDefinition as AnySjtDraft).schemaVersion===2)){
      // Worst-case answer + timing JSON must fit the one-MiB FINAL budget.
      // A count-only budget (e.g. 3000 max-length option keys) is insufficient.
      // Reserve explicit envelope, metadata, escaping and future-format headroom.
      const timingBytes=Buffer.byteLength(JSON.stringify({
        schemaVersion:1,firstResponseMs:86400000,activeTimeMs:86400000,
        changeCount:10000,revisitCount:10000,visits:10000,
        interrupted:true,recoveredWithoutClock:true,
      }),'utf8')
      const quote=(raw:string)=>Buffer.byteLength(JSON.stringify(raw),'utf8')
      let worst=4096
      let worstTiming=2
      for(const unit of units){
        worst+=quote(unit.instrumentKey)+8
        if(unit.kind==='SCALE'&&
          (unit.displayDefinition as ScaleDraft).presentationMode==='ONE_BY_ONE')
          worstTiming+=quote(unit.instrumentKey)+4
        if(unit.kind==='FORM'){
          worst+=formWorstCaseAnswerBytes(unit.displayDefinition as FormDraft)
        }else if(unit.kind==='SCALE'){
          const d=unit.displayDefinition as ScaleDraft
          const maxOption=Math.max(4,...d.responseOptions.map(o=>quote(o.optionKey)))
          for(const item of d.items){
            worst+=quote(item.itemKey)+maxOption+4
            if(d.presentationMode==='ONE_BY_ONE'){
              const itemBytes=quote(item.itemKey)+timingBytes+4
              worst+=itemBytes
              worstTiming+=itemBytes
            }
          }
        }else if(unit.kind==='SJT'){
          if(unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL){worst+=1024;continue}
          const d=unit.displayDefinition as AnySjtDraft
          for(const item of surveySjtQuestions(d)){
            const options=item.options.map(o=>quote(o.optionKey))
            worst+=quote(item.questionKey)+4+(item.responseType==='MULTIPLE'
              ?2+options.reduce((n,v)=>n+v+1,0):Math.max(item.allowRefusal?23:4,...options))
          }
        }
      }
      // The timing validator has its own 400 KB cap, independent of the
      // combined one-MiB FINAL. Keep margin for envelope serialization.
      if(worstTiming>390000)
        stop('逐题计时元数据最大体积超过 390 KB 发布预算，请减少量表题目')
      checkpointBudgetBytes=worst
      if(worst>900000)
        stop('量表逐题计时与其他工具组合的最大 FINAL 超过 900 KB 发布预算，请缩短内容或拆分波次')
    }
    let frozenFlow:FrozenSurveyFlow|undefined
    if(wave.flowDefinition){
      try{
        frozenFlow=compileSurveyFlow(wave.flowDefinition,units,
          project.collectionMode as ResearchFrozenPublication['collectionMode'])
      }catch(e){
        if(e instanceof SurveyFlowError)stop('冻结 Flow 结构未通过校验：'+
          e.issues.slice(0,5).map(i=>i.path+': '+i.message).join('；'))
        throw e
      }
    }
    let quotaPolicy:SurveyGroupQuotaPolicy|undefined
    let checkpointPolicy:SurveyCheckpointPolicy|undefined
    try{
      quotaPolicy=compileGroupQuotaPolicy(wave.quotaPolicy,frozenFlow)
      checkpointPolicy=compileCheckpointPolicy(wave.checkpointPolicy)
      if(checkpointPolicy?.enabled&&checkpointBudgetBytes>65536)
        stop('本轮完整临时答案预算超过 64KB，请减少题目或关闭服务器临时存档')
    }catch(e){
      stop(e instanceof Error?e.message:'研究运营设置未通过冻结校验')
    }
    // Reuse the single server-local publication time frozen under the host locks.
    const groupIpPolicy=freezeGroupIpPolicy(wave.groupIpPolicy,frozenAt)
    // Reject an unusable schedule before the immutable publication is persisted.
    resolveGroupIpOpenWindow(groupIpPolicy,wave,frozenAt)
    const measurementNotice=freezeSurveyMeasurementNotice({cognitive:units.some(unit=>unit.kind==='COGNITIVE'),
      stagedSituational:units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL
        &&surveyNativeSituationalRequiresStageNotice(unit.compiledDefinition as SituationRuntimeDefinition)),
      linearSituational:units.some(unit=>unit.executionProtocol===SURVEY_NATIVE_SJT_PROTOCOL
        &&!surveyNativeSituationalRequiresStageNotice(unit.compiledDefinition as SituationRuntimeDefinition))})
    const governedPackages=await freezeGovernedPackages(tx,input.actorUserId,input.projectId,units,frozenFlow)
    const trackingProject=await tx.surveyProject.findUniqueOrThrow({where:{id:input.projectId},select:{longitudinalPlan:true,firstPublishedAt:true}})
    if(trackingProject.longitudinalPlan&&!wave.longitudinalSourceWaveId)stop('请通过已发布纵向波次创建下一轮，以继承测量来源与计划')
    const tracking=freezeSurveyTracking({projectId:input.projectId,waveId:input.waveId,ordinal:wave.ordinal,
      collectionMode:project.collectionMode,existing:trackingProject.longitudinalPlan,firstPublishedAt:trackingProject.firstPublishedAt,
      selection:input.tracking,units})
    if(tracking&&!trackingProject.longitudinalPlan)await tx.surveyProject.update({where:{id:input.projectId},data:{longitudinalPlan:tracking.plan as Prisma.InputJsonValue}})
    const snapshot:ResearchFrozenPublication={
      ...(tracking?{longitudinal:tracking.binding}:{}),
      schemaVersion:1,purpose:'RESEARCH_ONLY',projectId:input.projectId,
      waveId:input.waveId,collectionMode:project.collectionMode as ResearchFrozenPublication['collectionMode'],
      consentVersion:wave.consentVersion,
      linkageNoticeConfirmed:wave.linkageNoticeConfirmed,
      consentDigest:canonicalHash({text:wave.consentText,version:wave.consentVersion,
        linkedConfirmed:wave.linkageNoticeConfirmed,...(measurementNotice?{measurementNotice}:{})}),
      ...(measurementNotice?{measurementNotice}:{}),
      units,...(governedPackages.length?{governedPackages}:{}),...(frozenFlow?{flow:frozenFlow}:{}),
      ...(quotaPolicy?{quotaPolicy}:{}),
      ...(checkpointPolicy?{checkpointPolicy}:{}),
      ...(groupIpPolicy?{groupIpPolicy}:{}),
      runtimeStatus:'SURVEY_FINAL_V1',
    }
    const serial=JSON.stringify(snapshot)
    if(Buffer.byteLength(serial,'utf8')>4000000)stop('波次研究内容超出安全体积')
    const digest=canonicalHash(JSON.parse(serial))
    const version=(await tx.surveyPublication.aggregate({where:{projectId:input.projectId},_max:{version:true}}))._max.version||0
    const publicationId=randomUUID()
    await retainSurveyMedia(tx,input.actorUserId,input.projectId,publicationId,
      units.map(unit=>({kind:unit.kind,definition:unit.displayDefinition,compiledDefinition:unit.compiledDefinition,sourceProvenance:unit.sourceProvenance})))
    await tx.surveyPublication.create({data:{
      id:publicationId,projectId:input.projectId,
      version:version+1,definitionDigest:digest,
      compiledSnapshot:JSON.parse(serial) as Prisma.InputJsonValue,
      consentVersion:wave.consentVersion,purpose:'RESEARCH_ONLY',createdAt:frozenAt,
    }})
    if(quotaPolicy){
      await tx.surveyExperimentQuotaBucket.createMany({data:
        Object.entries(quotaPolicy.groupLimits).map(([groupKey,maxAssigned])=>({
          id:randomUUID(),projectId:input.projectId,waveId:input.waveId,
          groupKey,maxAssigned,assignedCount:0,
        })),
      })
    }
    const changed=await tx.surveyWave.updateMany({
      where:{id:input.waveId,projectId:input.projectId,status:'DRAFT',
        publicationId:null,revision:input.revision},
      data:{publicationId,groupIpPolicy:groupIpPolicy===null?Prisma.DbNull:groupIpPolicy as Prisma.InputJsonValue,
        revision:{increment:1},updatedAt:frozenAt},
    })
    if(changed.count!==1)stop('波次已由其他会话冻结')
    const first=await tx.surveyProject.findUniqueOrThrow({where:{id:input.projectId}})
    if(!first.firstPublishedAt){
      await tx.surveyProject.update({
        where:{id:input.projectId},data:{firstPublishedAt:new Date(),revision:{increment:1}},
      })
    }
    await tx.surveyEvent.create({data:{
      id:randomUUID(),actorUserId:input.actorUserId,projectId:input.projectId,
      action:'WAVE_RESEARCH_DEFINITION_FROZEN',
      metadata:{waveId:input.waveId,publicationId,definitionDigest:digest,
        runtimeReady:true,sourceVersions:units.map(x=>[x.instrumentKey,x.draftRevision])},
    }})
    await recheckCatalogSjtSourceAuthority(tx,sources.values())
    return {publicationId,version:version+1,digest,waveId:input.waveId,runtimeReady:true}
  })
}
