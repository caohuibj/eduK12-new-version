import {catalogDiscoveryRecords,cognitiveDiscoveryWhere,discoveryFacets,discoveryJoin,discoverySqlFilter,governedDiscoveryIdentity,scaleDiscoveryWhere} from './catalog-discovery'
import {matchesCatalogDiscovery,type CatalogClassificationTag,type CatalogDiscoveryFilters} from '../scale/library/catalog-discovery'
import { assertSjtEntryDistributionAuthority, recheckSjtEntryDistributionAuthority, SjtEntryAuthorityError } from '../situational/entry-authority'
import { SJT_COURSE_GRANT_POLICY } from '../situational/authoring/grant-contract'
import { compileSurveyNativeSituationalHeader,type SurveyNativeSituationalHeader } from './situational-native.definition'
import { SURVEY_NATIVE_SJT_PROTOCOL,SurveySituationalProtocolError } from './situational-native.contract'
import {isGovernedSource} from './governed-tool.model'
import {readGovernedSource} from './governed-tool.service'
import {isSurveyStandardSource,readOnlineStandardSnapshot} from './standard-triplet.catalog'
import {canonicalScalePresentation} from './catalog-scale.presentation'
import { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '../../config/database'
import { canonicalHash } from '../assessment-runtime/canonical'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'
import { isAssessmentOperationallyPaused } from '../assessment-governance/operational-hold'
import { lockInstrumentSourceIdentity } from '../assessment-authorization/source-identity-lock'
import { readPublishedScaleMeasurementSource } from '../scale/measurement-source'
import {getContentReleaseBatch,type StoredRelease} from '../measurement-content/repository'
import { ContentReleaseError } from '../measurement-content/release'
import { getScalePackage } from '../scale/scale-package.registry'
import { hashScaleDefinition, validateScaleDefinition, type ScaleDefinitionV2 } from '../scale/scale-definition'
import { getScaleCustomScorerKeys } from '../scale/scale-scoring'
import { listSituationPackages, getSituationPackage } from '../situational/situation-package.registry'
import { validateSituationPackage, type SituationPackage } from '../situational/situation-package'
import { type SituationDefinitionV2 } from '../situational/situation-branching'
import { assertSurveyDraft, type SurveyKind } from './builder.definition'
import { compileResearchCognitive, initialCognitiveDefinition, SURVEY_GONOGO_CONFIG } from './cognitive.definition'

type Database=Prisma.TransactionClient|PrismaClient
export const CATALOG_ADAPTER_VERSION='survey-catalog-v1' as const
export const CANONICAL_SCALE_ADAPTER_VERSION='survey-catalog-scale-v2' as const
export const NATIVE_SJT_ADAPTER_VERSION='survey-catalog-sjt-native-v1' as const
export const ONLINE_SJT_ADAPTER_VERSION='survey-catalog-sjt-online-v1' as const
export type CatalogSourceRef={kind:SurveyKind;sourceId:string;sourceVersion:string;organizationId?:string}
export type SourceAnswerMapping={type:'SCALE_TYPED_V1';items:Record<string,string>;options:Record<string,string|number>}
export type CatalogSourceSnapshot={ref:CatalogSourceRef;title:string;displayDefinition:unknown;compiledDefinition:unknown;
  definitionDigest:string;scoringDigest:string|null;answerMapping?:SourceAnswerMapping;nativeSituational?:SurveyNativeSituationalHeader;
  adapterVersion:typeof CATALOG_ADAPTER_VERSION|typeof CANONICAL_SCALE_ADAPTER_VERSION|typeof ONLINE_SJT_ADAPTER_VERSION|typeof NATIVE_SJT_ADAPTER_VERSION;provenance:Record<string,unknown>}
export type CatalogSourceRow={ref:CatalogSourceRef;title:string;available:boolean;unsupportedReason:string|null;definitionDigest?:string;classificationTags?:CatalogClassificationTag[]}
const CATALOG_MAX_PAGE=40
export type CatalogSourcePage={list:CatalogSourceRow[];page:number;hasMore:boolean;terminalReason:'PAGE_LIMIT_REACHED'|'END_OF_CATALOG'|null;tagFacets?:ReturnType<typeof discoveryFacets>}
export class CatalogSourceError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){super(code);this.name='CatalogSourceError'}
}
const fail=(code:string):never=>{throw new CatalogSourceError(code)}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
function snapshot(ref:CatalogSourceRef,title:string,original:unknown,display:unknown,compiled:unknown,
  scoringDigest:string|null,provenance:Record<string,unknown>,answerMapping?:SourceAnswerMapping):CatalogSourceSnapshot {
  return copy({ref,title,displayDefinition:assertSurveyDraft(ref.kind,display,true),compiledDefinition:compiled,
    definitionDigest:canonicalHash(original),scoringDigest,adapterVersion:CATALOG_ADAPTER_VERSION,
    provenance,...(answerMapping?{answerMapping}:{})})
}
/** Only presentation identifiers are translated. The canonical score definition is copied byte-for-byte. */
export function adaptCatalogScale(ref:CatalogSourceRef,title:string,definition:ScaleDefinitionV2,
  options:{instrumentClass?:'STANDARD'|'CUSTOM_DESCRIPTIVE';presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'}={}):CatalogSourceSnapshot {
  const valid=validateScaleDefinition(definition,{instrumentClass:options.instrumentClass??'STANDARD',scorerKeys:getScaleCustomScorerKeys()})
  if(!valid.definition||valid.issues.some(i=>i.severity==='error'))fail('SOURCE_SCALE_INVALID')
  // The canonical Training publisher also rejects randomization: never silently flatten it.
  if(definition.display?.randomizeItems||definition.items.some(i=>i.randomizeOptions))fail('SOURCE_SCALE_RANDOMIZATION_RUNTIME_UNSUPPORTED')
  if(definition.items.some(i=>i.type!=='single'))fail('SOURCE_SCALE_RESPONSE_TYPE_RUNTIME_UNSUPPORTED')
  if(definition.items.length>500)fail('SOURCE_SCALE_SURVEY_ANSWER_LIMIT_500_EXCEEDED')
  const {display,mapping}=canonicalScalePresentation(definition,options.presentationMode??'ONE_BY_ONE')
  return copy({ref,title,displayDefinition:display,compiledDefinition:definition,
    definitionDigest:canonicalHash(definition),scoringDigest:canonicalHash(definition.scoring),
    adapterVersion:CANONICAL_SCALE_ADAPTER_VERSION,answerMapping:mapping,
    provenance:{source:definition.source,license:definition.license,originalScoreKeys:definition.scoring.scores.map(s=>s.key),presentationOnly:true}})
}
/** Historical V1 grants keep their exact original presentation, including
 * ALL_AT_ONCE. This adapter is only used to verify an existing immutable grant;
 * new grants always receive the canonical consumption protocol above. */
function adaptLegacyCatalogScale(ref:CatalogSourceRef,title:string,definition:ScaleDefinitionV2):CatalogSourceSnapshot {
  const valid=validateScaleDefinition(definition,{instrumentClass:'STANDARD',scorerKeys:getScaleCustomScorerKeys()})
  if(!valid.definition||valid.issues.some(i=>i.severity==='error'))fail('SOURCE_SCALE_INVALID')
  if(definition.display?.randomizeItems||definition.items.some(i=>i.type!=='single'||!i.required||i.images?.length||i.video||i.randomizeOptions))
    fail('SOURCE_SCALE_PRESENTATION_UNSUPPORTED')
  const ordered=[...definition.items].sort((a,b)=>a.sortOrder-b.sortOrder)
  const sets=ordered.map(i=>definition.responseSets.find(s=>s.key===i.responseSetKey))
  if(!sets[0]||sets.some(s=>!s||canonicalHash(s.options)!==canonicalHash(sets[0]!.options)))fail('SOURCE_SCALE_MIXED_RESPONSE_SETS_UNSUPPORTED')
  const answerMapping:SourceAnswerMapping={type:'SCALE_TYPED_V1',items:{},options:{}}
  const responseOptions=sets[0]!.options.map((o,i)=>{const optionKey='o_'+i;answerMapping.options[optionKey]=o.value;return {optionKey,label:o.label,score:o.score}})
  const scores=definition.scoring.scores.filter(s=>s.source.type==='items')
  if(!scores.length)fail('SOURCE_SCALE_DISPLAY_DIMENSIONS_UNSUPPORTED')
  const dimensions=scores.map((s,i)=>({dimensionKey:'d_'+i,label:s.label,direction:s.direction}))
  const items=ordered.map((item,i)=>{
    const itemKey='i_'+i;answerMapping.items[itemKey]=item.itemCode
    const dimensionKeys=scores.flatMap((s,j)=>s.source.type==='items'&&s.source.items.some(x=>x.itemCode===item.itemCode)?['d_'+j]:[])
    return {itemKey,prompt:item.content,required:true,reverse:definition.scoring.itemRules.some(r=>r.itemCode===item.itemCode&&r.transform.type==='reverse'),dimensionKeys}
  })
  const display={schemaVersion:1,presentationMode:'ALL_AT_ONCE',respondentType:definition.respondentType,responseOptions,dimensions,aggregation:'sum',items}
  return snapshot(ref,title,definition,display,definition,canonicalHash(definition.scoring),
    {source:definition.source,license:definition.license,originalScoreKeys:definition.scoring.scores.map(s=>s.key),presentationOnly:true},answerMapping)
}
/** Read-only compatibility for the historical raw-channel adapter that mislabeled
 * unknown copyright metadata. Never use this projection for a new grant/write. */
function preserveHistoricalSjtLicenseProjection(current:CatalogSourceSnapshot,stored:CatalogSourceSnapshot):CatalogSourceSnapshot {
  const now=current.displayDefinition as {licenseStatus?:string},old=stored.displayDefinition as {licenseStatus?:string}
  const definition=stored.compiledDefinition as {license?:{status?:string}}
  if(stored.ref.kind==='SJT'&&stored.adapterVersion===CATALOG_ADAPTER_VERSION&&current.adapterVersion===CATALOG_ADAPTER_VERSION
    &&definition.license?.status==='unknown'&&now.licenseStatus==='unknown'&&old.licenseStatus==='authorized')
    return {...current,displayDefinition:{...now,licenseStatus:'authorized'}}
  return current
}
export function catalogAdapterForRecheck(current:CatalogSourceSnapshot,stored:CatalogSourceSnapshot):CatalogSourceSnapshot {
  if(Object.prototype.hasOwnProperty.call(stored.provenance,'sourceRights')&&!Object.prototype.hasOwnProperty.call(stored.provenance,'sourceDeploymentIdentity')){
    const legacy=stored.provenance.sourceRights as Record<string,unknown>|null
    const identity=current.provenance.sourceDeploymentIdentity as Record<string,unknown>|null
    if(legacy&&identity&&['runtimePolicyHash','deploymentPolicyHash','deploymentRevision'].some(key=>legacy[key]!==identity[key]))fail('SOURCE_SNAPSHOT_CHANGED')
    const {sourceDeploymentIdentity: _identity,...provenance}=current.provenance
    current={...current,provenance:{...provenance,sourceRights:stored.provenance.sourceRights}}
  }
  if(stored.ref.kind==='SJT'&&stored.adapterVersion===CATALOG_ADAPTER_VERSION&&current.adapterVersion===ONLINE_SJT_ADAPTER_VERSION){
    // A previously admitted raw-channel projection keeps its original digest.
    // New online grants must not rewrite that immutable presentation on recheck.
    return preserveHistoricalSjtLicenseProjection(adaptLegacyCatalogSjt(current.ref,current.title,current.compiledDefinition as SituationDefinitionV2,
      String(current.provenance.definitionHash)),stored)
  }
  current=preserveHistoricalSjtLicenseProjection(current,stored)
  if(stored.ref.kind!=='SCALE'||stored.adapterVersion!==CATALOG_ADAPTER_VERSION||isGovernedSource(stored.ref.sourceId))return current
  const legacy=adaptLegacyCatalogScale(current.ref,current.title,current.compiledDefinition as ScaleDefinitionV2)
  return {...current,...legacy,provenance:{...current.provenance,...legacy.provenance}}
}
/** Exact authorized scoring plane. Online sources retain their validated shared
 * presentation; legacy sources keep the original narrow raw-channel adapter. */
export function adaptCatalogSjt(ref:CatalogSourceRef,title:string,pkg:SituationPackage):CatalogSourceSnapshot {
  if(pkg.releaseStatus!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
  const validation=validateSituationPackage(pkg)
  if(!validation.valid)fail('SOURCE_SJT_INVALID')
  if(pkg.definition.schemaVersion===1)return adaptNativeCatalogSjt(ref,title,pkg,validation.definitionHash)
  const d=pkg.definition as SituationDefinitionV2
  if(d.researchAssignment)fail('SOURCE_SJT_RESEARCH_CAPTURE_UNSUPPORTED')
  const model=d.scoring.model
  if(!model||!['AUTHOR_KEY_SUM','EXPERT_KEY'].includes(model.modelKey)||model.modelVersion!=='1')throw new CatalogSourceError('SOURCE_SJT_MODEL_UNSUPPORTED')
  if(pkg.online){
    // validateSituationPackage above verifies displayHash AND recompiles the
    // shared online protocol against this exact definitionHash. Do not flatten
    // MULTIPLE/refusal/mother-scene semantics back into raw scorer options.
    if(pkg.online.display.scenes.some(scene=>scene.image)&&ref.sourceId.startsWith('registry:'))fail('SOURCE_SJT_ONLINE_MEDIA_REQUIRES_AUTHORIZED_DELIVERY')
    return {...snapshot(ref,title,d,pkg.online.display,d,canonicalHash(d.scoring),
      {source:d.source,license:d.license,definitionHash:validation.definitionHash}),
      adapterVersion:ONLINE_SJT_ADAPTER_VERSION}
  }
  if(d.flow.nodes.some(node=>node.nodeType==='SCENE'&&node.responseStages?.length)){
    // Native staged tools retain their exact scientific protocol; this descriptor
    // cannot be submitted through the historical static Survey answer parser.
    return adaptNativeCatalogSjt(ref,title,pkg,validation.definitionHash)
  }
  return adaptLegacyCatalogSjt(ref,title,d,validation.definitionHash)
}

/** One descriptor for every explicitly qualified shared native definition. */
function adaptNativeCatalogSjt(ref:CatalogSourceRef,title:string,pkg:SituationPackage,definitionHash:string):CatalogSourceSnapshot{
  let nativeSituational:SurveyNativeSituationalHeader
  try{nativeSituational=compileSurveyNativeSituationalHeader(pkg)}
  catch(error){if(error instanceof SurveySituationalProtocolError)fail(error.code);throw error}
  const d=pkg.definition
  return copy({ref,title,compiledDefinition:d,
    displayDefinition:{schemaVersion:1,executionProtocol:SURVEY_NATIVE_SJT_PROTOCOL,title},
    definitionDigest:canonicalHash(d),scoringDigest:canonicalHash(d.scoring),
    adapterVersion:NATIVE_SJT_ADAPTER_VERSION,nativeSituational,
    provenance:{source:d.source,license:d.license,definitionHash}})
}

/** Historical grants are checked using their original projection, not upgraded. */
function adaptLegacyCatalogSjt(ref:CatalogSourceRef,title:string,d:SituationDefinitionV2,definitionHash:string):CatalogSourceSnapshot {
  const model=d.scoring.model
  if(!model||!['AUTHOR_KEY_SUM','EXPERT_KEY'].includes(model.modelKey)||model.modelVersion!=='1')throw new CatalogSourceError('SOURCE_SJT_MODEL_UNSUPPORTED')
  const nodes=new Map(d.flow.nodes.map(n=>[n.nodeKey,n]));const visited=new Set<string>();const scenes:typeof d.scenes=[]
  let key=d.flow.entryNodeKey
  while(true){
    if(visited.has(key))fail('SOURCE_SJT_FLOW_UNSUPPORTED');visited.add(key)
    const node=nodes.get(key);if(!node)fail('SOURCE_SJT_FLOW_UNSUPPORTED')
    if(node!.nodeType==='TERMINAL')break
    if(node!.transition.type!=='NEXT'||node!.stimulusVariants?.length||node!.responseStages?.length||node!.motherSceneKey!==node!.sceneKey||
      node!.channelPolicies?.some(p=>!p.required||p.measurementRole!=='SCORED'))throw new CatalogSourceError('SOURCE_SJT_FLOW_UNSUPPORTED')
    const scene=d.scenes.find(s=>s.sceneKey===node!.sceneKey)
    if(!scene||scene.stimulus.type!=='TEXT_V1'||scene.channels.some(c=>c.responseType!=='SINGLE_CHOICE'||c.options.some(o=>o.nonanswerReason)))fail('SOURCE_SJT_CHANNEL_UNSUPPORTED')
    scenes.push(scene!);key=node!.transition.nextNodeKey
  }
  if(visited.size!==nodes.size||scenes.length!==d.scenes.length||new Set(scenes.map(s=>s.sceneKey)).size!==scenes.length)fail('SOURCE_SJT_FLOW_UNSUPPORTED')
  const seen=new Set<string>()
  const display={schemaVersion:2,respondentType:d.respondentType,title,author:d.source.citation||d.source.title||title,
    sourceNote:d.source.citation||d.source.title||title,licenseStatus:d.license.status==='unknown'?'unknown':d.license.status==='self_authored'?'self_authored':'authorized',
    redistribution:d.license.redistribution,orderPolicy:'FIXED',metrics:d.scoring.publishedMetrics.map(m=>({metricKey:m.key,label:m.label,direction:'descriptive'})),
    scoring:{modelKey:model.modelKey,modelVersion:'1',sourceNote:d.source.citation||title},
    scenes:scenes.map(s=>({sceneKey:s.sceneKey,title:s.title,stimulus:s.stimulus.text,questions:s.channels.map(c=>{
      if(seen.has(c.channelKey)||c.responseType!=='SINGLE_CHOICE')throw new CatalogSourceError('SOURCE_SJT_CHANNEL_KEYS_UNSUPPORTED');seen.add(c.channelKey)
      return {questionKey:c.channelKey,prompt:c.prompt,responseType:'SINGLE',required:true,allowRefusal:false,
        options:c.options.map(o=>({optionKey:o.optionKey,label:o.label,contributions:Object.fromEntries(d.scoring.publishedMetrics.map(m=>{
          const entries=model.expertKey?.filter(e=>e.sceneKey===s.sceneKey&&e.channelKey===c.channelKey&&e.optionKey===o.optionKey&&e.metricKey===m.key)||[]
          if(entries.length!==1)fail('SOURCE_SJT_INCOMPLETE_EXPERT_MATRIX')
          return [m.key,entries[0].contribution]
        }))}))}
    })}))}
  return snapshot(ref,title,d,display,d,canonicalHash(d.scoring),{source:d.source,license:d.license,definitionHash})
}
export function adaptCatalogCognitive(ref:CatalogSourceRef,row:{name:string;testType:string;configVersion:string;engineVersion:string;scoringVersion:string;config:unknown;status:string;accessPolicy:string}):CatalogSourceSnapshot {
  if(row.status!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
  if(row.accessPolicy!=='OPEN')fail('SOURCE_COGNITIVE_ACCESS_POLICY_REQUIRES_SEPARATE_GRANT')
  if(row.testType!=='gonogo'||row.configVersion!=='1.1.0'||row.engineVersion!=='1.0.0'||row.scoringVersion!=='1.0.0'||canonicalHash(row.config)!==canonicalHash(SURVEY_GONOGO_CONFIG))
    fail('SOURCE_COGNITIVE_CONTROLLED_IDENTITY_UNSUPPORTED')
  const display=initialCognitiveDefinition(),compiled=compileResearchCognitive(display)
  return snapshot(ref,row.name,row.config,display,compiled,compiled.measurementDigest,{testType:row.testType,configVersion:row.configVersion,engineVersion:row.engineVersion,scoringVersion:row.scoringVersion,referenceMode:'none'})
}
const questionnaireFormInclude={questionnaire:{select:{id:true,name:true,status:true,creatorId:true,updatedAt:true}},items:{orderBy:{id:'asc' as const}}} as const
export type QuestionnaireCatalogForm=Prisma.QuestionnaireFormSectionGetPayload<{include:typeof questionnaireFormInclude}>
function questionnaireFormContent(row:QuestionnaireCatalogForm){
  return copy({questionnaire:row.questionnaire,section:{id:row.id,questionnaireId:row.questionnaireId,title:row.title,
    description:row.description,position:row.position,contextSection:row.contextSection,updatedAt:row.updatedAt},
    items:[...row.items].sort((a,b)=>(a.sectionPosition??a.position)-(b.sectionPosition??b.position)||a.id.localeCompare(b.id,'en')).map(i=>({
      id:i.id,questionnaireId:i.questionnaireId,sectionId:i.sectionId,type:i.type,label:i.label,placeholder:i.placeholder,
      required:i.required,options:i.options,contextKey:i.contextKey,position:i.position,sectionPosition:i.sectionPosition,updatedAt:i.updatedAt}))})
}
export const questionnaireFormSourceVersion=(row:QuestionnaireCatalogForm)=>canonicalHash(questionnaireFormContent(row))
export function adaptCatalogQuestionnaireForm(ref:CatalogSourceRef,row:QuestionnaireCatalogForm,actorUserId:string):CatalogSourceSnapshot{
  if(row.questionnaire.creatorId!==actorUserId)throw new CatalogSourceError('SOURCE_FORM_OWNER_REQUIRED',403)
  if(row.questionnaire.status!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
  if(ref.organizationId||ref.sourceId!=='questionnaire:'+row.id)fail('SOURCE_FORM_IDENTITY_MISMATCH')
  const original=questionnaireFormContent(row)
  if(canonicalHash(original)!==ref.sourceVersion)fail('SOURCE_FORM_VERSION_CHANGED')
  if(row.contextSection||row.items.some(i=>i.contextKey!==null))fail('SOURCE_FORM_CONTEXT_UNSUPPORTED')
  const formItemMapping:Record<string,{itemId:string;options:Record<string,string>}>=Object.create(null)
  const questions=original.items.map((item,i)=>{
    if(item.type!=='single_choice'||!item.required||!Array.isArray(item.options))throw new CatalogSourceError('SOURCE_FORM_ITEM_TYPE_UNSUPPORTED')
    const itemKey='i_'+i,options:Record<string,string>=Object.create(null),seen=new Set<string>()
    const displayOptions=item.options.map((option,j)=>{
      if(!option||typeof option!=='object'||Array.isArray(option)||typeof option.value!=='string'||!option.value.trim()||typeof option.label!=='string'||!option.label.trim()||seen.has(option.value))
        throw new CatalogSourceError('SOURCE_FORM_OPTIONS_UNSUPPORTED')
      if(Object.keys(option).some(key=>!['value','label'].includes(key)))throw new CatalogSourceError('SOURCE_FORM_OPTION_MEDIA_OR_METADATA_UNSUPPORTED')
      seen.add(option.value);const optionKey='o_'+j;options[optionKey]=option.value
      return {optionKey,label:option.label}
    })
    formItemMapping[itemKey]={itemId:item.id,options}
    return {itemKey,type:'SINGLE',prompt:item.label,required:true,options:displayOptions,rows:[]}
  })
  const display={schemaVersion:2,pages:[{pageKey:'source_section',title:row.title,...(row.description?{description:row.description}:{}),questions}]}
  return snapshot(ref,row.title,original,display,display,null,{reuseAuthority:'OWNER_AUTHORIZED_REUSE',questionnaireId:row.questionnaireId,
    sectionId:row.id,creatorId:row.questionnaire.creatorId,formItemMapping})
}
async function formScope(actorUserId:string,organizationId:string|undefined,db:Database){
  if(!organizationId)throw new CatalogSourceError('SOURCE_FORM_ORGANIZATION_REQUIRED',403)
  const member=await resolveEducationProductMemberScope({actorUserId,organizationId:organizationId!,product:'HUITEACHER'},db)
  if(!member?.productAdmin)throw new CatalogSourceError('SOURCE_FORM_ORGANIZATION_ADMIN_REQUIRED',403)
}
/** Caller owns Survey grant/owner authority; this function independently enforces source scope and freshness. */
export async function getCatalogSourceSnapshot(input:{actorUserId:string;ref:CatalogSourceRef},db:Database=prisma):Promise<CatalogSourceSnapshot>{
  if(db===prisma)return prisma.$transaction(tx=>getCatalogSourceSnapshot(input,tx))
  if(input.ref.kind==='FORM'&&!input.ref.sourceId.startsWith('questionnaire:')&&!isGovernedSource(input.ref.sourceId))await formScope(input.actorUserId,input.ref.organizationId,db)
  await lockCatalogSourceRows([input.ref],db)
  return readCatalogSourceSnapshot(input,db,true)
}
/** The normal legacy UPDATE retirement path conflicts with these transaction-held locks. */
async function lockCatalogSourceRows(refs:CatalogSourceRef[],db:Database):Promise<void>{
  const ids=(kind:SurveyKind)=>[...new Set(refs.filter(r=>r.kind===kind&&!isGovernedSource(r.sourceId)&&!(kind==='SCALE'&&isSurveyStandardSource(r.sourceId))&&!(kind==='SJT'&&r.sourceId.startsWith('registry:'))&&!(kind==='FORM'&&r.sourceId.startsWith('questionnaire:'))).map(r=>r.sourceId))].sort()
  // Source advisory locks must precede Scale row locks. A queued license writer
  // would otherwise invert the explicit converter's source -> Scale order.
  const scaleIds=ids('SCALE')
  const before=scaleIds.length?await db.$queryRaw<Array<{id:string;code:string;instrument_version:string;instrument_class:string}>>(Prisma.sql`SELECT id,code,instrument_version,instrument_class::text FROM scales WHERE id IN (${Prisma.join(scaleIds)}) ORDER BY id`):[]
  for(const row of [...before].filter(row=>row.instrument_class==='STANDARD').sort((a,b)=>a.code.localeCompare(b.code)||a.instrument_version.localeCompare(b.instrument_version)))
    await lockInstrumentSourceIdentity(db as Prisma.TransactionClient,{instrumentKey:row.code,instrumentVersion:row.instrument_version},'READ')
  for(const kind of ['SCALE','SJT','COGNITIVE','FORM'] as const){
    const sourceIds=ids(kind);if(!sourceIds.length)continue
    const table=kind==='SCALE'?Prisma.sql`"scales"`:kind==='SJT'?Prisma.sql`"sjt_author_releases"`:
      kind==='COGNITIVE'?Prisma.sql`"cognitive_test_configs"`:Prisma.sql`"huiteacher_form_instruments"`
    if(kind==='SCALE'){
      const locked=await db.$queryRaw<typeof before>(Prisma.sql`SELECT id,code,instrument_version,instrument_class::text FROM scales WHERE id IN (${Prisma.join(sourceIds)}) ORDER BY id FOR SHARE`)
      if(canonicalHash(locked)!==canonicalHash(before))fail('SOURCE_SCALE_IDENTITY_CHANGED')
    }else await db.$queryRaw(Prisma.sql`SELECT "id" FROM ${table} WHERE "id" IN (${Prisma.join(sourceIds)}) ORDER BY "id" FOR SHARE`)
  }
  const sectionIds=[...new Set(refs.filter(r=>r.kind==='FORM'&&r.sourceId.startsWith('questionnaire:')).map(r=>r.sourceId.slice(14)))].sort()
  if(sectionIds.length){
    await db.$queryRaw(Prisma.sql`SELECT q."id" FROM "questionnaires" q WHERE q."id" IN (SELECT "questionnaire_id" FROM "questionnaire_form_sections" WHERE "id" IN (${Prisma.join(sectionIds)})) ORDER BY q."id" FOR SHARE`)
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "questionnaire_form_sections" WHERE "id" IN (${Prisma.join(sectionIds)}) ORDER BY "id" FOR UPDATE`)
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "questionnaire_form_items" WHERE "section_id" IN (${Prisma.join(sectionIds)}) ORDER BY "id" FOR SHARE`)
  }

}
async function readCatalogSourceSnapshot(input:{actorUserId:string;ref:CatalogSourceRef;pinnedSjtAuthority?:unknown},db:Database,verifiedFormScope:boolean,scaleAuthorityDb:Database=db,scaleReleases?:ReadonlyMap<string,StoredRelease>):Promise<CatalogSourceSnapshot>{
  const {ref}=input
  if(isGovernedSource(ref.sourceId))return readGovernedSource(scaleAuthorityDb,ref.sourceId,ref.sourceVersion)
  if(ref.kind==='SCALE'){
    if(isSurveyStandardSource(ref.sourceId))return readOnlineStandardSnapshot(scaleAuthorityDb,ref.sourceId,ref.sourceVersion)
    const row=await db.scale.findFirst({where:{id:ref.sourceId,instrumentVersion:ref.sourceVersion,status:'PUBLISHED'}})
    if(!row)fail('SOURCE_NOT_PUBLISHED')
    if(isAssessmentOperationallyPaused({family:'SCALE',key:row!.code,version:ref.sourceVersion}))fail('SOURCE_OPERATIONALLY_PAUSED')
    const pkg=getScalePackage(row!.code,ref.sourceVersion)
    if(row!.instrumentClass==='STANDARD'&&(!pkg||pkg.releaseStatus!=='PUBLISHED'))fail('SOURCE_REGISTERED_SCALE_UNAVAILABLE')
    const definition=(row!.instrumentClass==='STANDARD'?pkg!.definition:row!.definition) as ScaleDefinitionV2
    if(!definition||row!.definitionHash!=null&&row!.definitionHash!==hashScaleDefinition(definition))fail('SOURCE_SCALE_DEFINITION_HASH_MISMATCH')
    let admitted:Awaited<ReturnType<typeof readPublishedScaleMeasurementSource>>
    try{admitted=await readPublishedScaleMeasurementSource(scaleAuthorityDb as Prisma.TransactionClient,row!,scaleReleases)}
    catch(error){if(error instanceof ContentReleaseError)fail(error.code.replace('CONTENT_SCALE_SOURCE_','SOURCE_SCALE_'));throw error}
    const result=adaptCatalogScale(ref,row!.name,definition)
    return {...result,provenance:{...result.provenance,code:row!.code,instrumentClass:row!.instrumentClass,
      sourceMeasurementRelease:{releaseId:admitted.release.releaseId,contentHash:admitted.release.contentHash},sourceDeploymentIdentity:admitted.deploymentIdentity}}
  }
  if(ref.kind==='SJT'){
    let pkg:SituationPackage|undefined
    let entryAuthority:Awaited<ReturnType<typeof assertSjtEntryDistributionAuthority>>|undefined
    if(ref.sourceId.startsWith('registry:'))pkg=getSituationPackage(ref.sourceId.slice(9),ref.sourceVersion)
    else{
      const row=await db.sjtAuthorRelease.findFirst({where:{id:ref.sourceId,instrumentVersion:ref.sourceVersion,status:'PUBLISHED'}})
      if(row){
        if(row.authorizationPolicy===SJT_COURSE_GRANT_POLICY){
          try{entryAuthority=await assertSjtEntryDistributionAuthority(scaleAuthorityDb as Prisma.TransactionClient,{
            actorId:input.actorUserId,releaseId:row.id,instrumentVersion:ref.sourceVersion,
            ...(input.pinnedSjtAuthority!==undefined?{pinned:input.pinnedSjtAuthority}:{})})}
          catch(error){if(error instanceof SjtEntryAuthorityError)throw new CatalogSourceError(error.code,403);throw error}
        }else if(row.authorizationPolicy!==null||input.pinnedSjtAuthority!==undefined)fail('SOURCE_SJT_AUTHORIZATION_POLICY_UNSUPPORTED')
        pkg=row.package as unknown as SituationPackage
        const checked=validateSituationPackage(pkg)
        if(!checked.valid||checked.definitionHash!==row.definitionHash||pkg.key!==row.instrumentKey||pkg.instrumentVersion!==row.instrumentVersion)fail('SOURCE_SJT_RELEASE_DIGEST_MISMATCH')}
    }
    if(!pkg||pkg.releaseStatus!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
    if(isAssessmentOperationallyPaused({family:'SITUATIONAL',key:pkg!.key,version:ref.sourceVersion}))fail('SOURCE_OPERATIONALLY_PAUSED')
    const result=adaptCatalogSjt(ref,pkg!.definition.source.title||pkg!.key,pkg!)
    return entryAuthority?{...result,provenance:{...result.provenance,sjtEntryAuthority:entryAuthority}}:result
  }
  if(ref.kind==='COGNITIVE'){
    const row=await db.cognitiveTestConfig.findFirst({where:{id:ref.sourceId,configVersion:ref.sourceVersion,status:'PUBLISHED'}})
    if(!row)fail('SOURCE_NOT_PUBLISHED')
    if(isAssessmentOperationallyPaused({family:'COGNITIVE',key:row!.testType,version:row!.engineVersion,scoringVersion:row!.scoringVersion}))fail('SOURCE_OPERATIONALLY_PAUSED')
    return adaptCatalogCognitive(ref,row!)
  }
  if(ref.kind!=='FORM')fail('SOURCE_KIND_UNSUPPORTED')
  if(ref.sourceId.startsWith('questionnaire:')){
    const row=await db.questionnaireFormSection.findFirst({where:{id:ref.sourceId.slice(14),questionnaire:{creatorId:input.actorUserId,status:'PUBLISHED'}},include:questionnaireFormInclude})
    if(!row)throw new CatalogSourceError('SOURCE_FORM_OWNER_OR_PUBLICATION_REQUIRED',403)
    return adaptCatalogQuestionnaireForm(ref,row,input.actorUserId)
  }
  if(!verifiedFormScope)await formScope(input.actorUserId,ref.organizationId,db)
  const row=await db.huiteacherFormInstrument.findFirst({where:{id:ref.sourceId,organizationId:ref.organizationId,status:'PUBLISHED',revision:Number(ref.sourceVersion)}})
  if(!row||String(row.revision)!==ref.sourceVersion)fail('SOURCE_NOT_PUBLISHED')
  const definition=assertSurveyDraft('FORM',row!.definition,true)
  // Private organization media requires its own cross-product capability transfer.
  if((definition as {pages:Array<{questions:Array<{image?:unknown}>}>}).pages.some(p=>p.questions.some(q=>q.image)))fail('SOURCE_FORM_MEDIA_TRANSFER_UNSUPPORTED')
  if(canonicalHash({kind:'FORM',definition})!==row!.definitionDigest)fail('SOURCE_FORM_DIGEST_MISMATCH')
  return snapshot(ref,row!.title,definition,definition,definition,null,{organizationId:ref.organizationId,revision:row!.revision,definitionDigest:row!.definitionDigest,createdByUserId:row!.createdByUserId})
}
/** Administrative caller owns authorization; omitted kind selects Scale, never a cross-product scan. */
export async function listCatalogSources(input:{actorUserId:string;kind?:SurveyKind;organizationId?:string;page?:number;limit?:number;query?:string;includeGoverned?:boolean;discovery?:CatalogDiscoveryFilters},db:Database=prisma):Promise<CatalogSourcePage>{
  const kind=input.kind??'SCALE'
  if(kind==='SJT'&&db===prisma)return prisma.$transaction(tx=>listCatalogSources(input,tx))
  const limit=Math.min(25,Math.max(1,Math.floor(input.limit||25))),page=Math.max(1,Math.floor(input.page||1))
  if(page>CATALOG_MAX_PAGE)throw new CatalogSourceError('SOURCE_CATALOG_PAGE_LIMIT_EXCEEDED',400)
  let offset=(page-1)*limit
  const query=input.query?.trim()??'',pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%',contains={contains:query,mode:'insensitive' as const}
  const take=limit+1,refs:Array<{ref:CatalogSourceRef;title:string}>=[]
  const records=catalogDiscoveryRecords(),filters=input.discovery??{},sourceTags=new Map<string,CatalogClassificationTag[]>()
  let cached:Database=db
  let scaleReleases:Map<string,StoredRelease>|undefined
  if(kind!=='SCALE'&&input.includeGoverned!==false){
    const governed=await db.$queryRaw<Array<{id:string;title:string;snapshot_hash:string;classification_tags?:CatalogClassificationTag[]}>>(Prisma.sql`SELECT id,title,snapshot_hash,COALESCE(discovery.tags,'[]'::jsonb) AS classification_tags FROM survey_governed_tools t ${discoveryJoin(records,governedDiscoveryIdentity)} WHERE family=${kind} AND state='ONLINE' AND (${query}='' OR title ILIKE ${pattern} OR snapshot_hash ILIKE ${pattern}) AND ${discoverySqlFilter([Prisma.sql`t.title`,Prisma.sql`t.snapshot_hash`],filters)} ORDER BY submitted_at,id`)
    for(const row of governed)sourceTags.set('survey-tool:'+row.id,row.classification_tags??[])
    for(const row of governed.slice(offset,offset+take))refs.push({ref:{kind,sourceId:'survey-tool:'+row.id,sourceVersion:row.snapshot_hash},title:row.title})
    offset=Math.max(0,offset-governed.length)
  }
  if(kind==='SCALE'){
    const online=input.includeGoverned===false?[]:await db.$queryRaw<Array<{id:string;combination_hash:string;snapshot:{title:string};classification_tags?:CatalogClassificationTag[]}>>(Prisma.sql`SELECT id,combination_hash,snapshot,COALESCE(discovery.tags,'[]'::jsonb) AS classification_tags FROM survey_standard_releases t ${discoveryJoin(records,{kind:Prisma.sql`'SCALE'`,key:Prisma.sql`t.tool_key`,version:Prisma.sql`t.snapshot->>'instrumentVersion'`,engine:Prisma.sql`NULL`,scoring:Prisma.sql`NULL`})} WHERE state='ONLINE' AND (${query}='' OR tool_key ILIKE ${pattern} OR snapshot->>'title' ILIKE ${pattern} OR combination_hash ILIKE ${pattern}) AND ${discoverySqlFilter([Prisma.sql`t.tool_key`,Prisma.sql`t.snapshot->>'title'`,Prisma.sql`t.combination_hash`],filters)} ORDER BY tool_key,created_at,id`)
    for(const row of online)sourceTags.set('survey-standard:'+row.id,row.classification_tags??[])
    for(const r of online.slice(offset,offset+take))refs.push({ref:{kind:'SCALE',sourceId:'survey-standard:'+r.id,sourceVersion:r.combination_hash},title:r.snapshot.title})
    const rows=refs.length<take?await db.scale.findMany({where:{status:'PUBLISHED',instrumentClass:'STANDARD',...scaleDiscoveryWhere(records,filters),...(query?{OR:[{name:contains},{code:contains}]}:{}),...(online.length?{NOT:{code:{in:online.map(r=>(r.snapshot as unknown as {toolKey:string}).toolKey)}}}:{})},orderBy:{id:'asc'},skip:Math.max(0,offset-online.length),take:take-refs.length}):[]
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.instrumentVersion},title:row.name})
    for(const row of rows)sourceTags.set(row.id,records.find(record=>record.kind==='SCALE'&&record.key===row.code&&record.version===row.instrumentVersion)?.tags??[])
    scaleReleases=await getContentReleaseBatch(db,rows.slice(0,limit).flatMap(row=>row.measurementReleaseId?[row.measurementReleaseId]:[]))
    cached={scale:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null}} as unknown as Database
  }else if(kind==='SJT'){
    const builtins=listSituationPackages().filter(p=>p.releaseStatus==='PUBLISHED'&&matchesCatalogDiscovery([p.key,p.definition.source.title??''],[],filters)&&(!query||(p.key+' '+p.definition.source.title).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>a.key.localeCompare(b.key,'en')||a.instrumentVersion.localeCompare(b.instrumentVersion,'en'))
    for(const pkg of builtins.slice(offset,offset+Math.max(0,take-refs.length)))refs.push({ref:{kind,sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion},title:pkg.definition.source.title||pkg.key})
    const rows=refs.length<take&&!filters.tags?.length?await db.sjtAuthorRelease.findMany({where:{status:'PUBLISHED',AND:filters.keyword?.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term=>({instrumentKey:{contains:term,mode:'insensitive' as const}})),...(query?{instrumentKey:contains}:{})},orderBy:{id:'asc'},skip:Math.max(0,offset-builtins.length),take:take-refs.length}):[]
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.instrumentVersion},title:row.instrumentKey})
    cached={sjtAuthorRelease:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null}} as unknown as Database
  }else if(kind==='COGNITIVE'){
    const rows=await db.cognitiveTestConfig.findMany({where:{status:'PUBLISHED',...cognitiveDiscoveryWhere(records,filters),...(query?{OR:[{name:contains},{testType:contains}]}:{})},orderBy:{id:'asc'},skip:offset,take:Math.max(0,take-refs.length)})
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.configVersion},title:row.name})
    for(const row of rows)sourceTags.set(row.id,records.find(record=>record.kind==='COGNITIVE'&&record.key===row.testType&&record.engine===row.engineVersion&&record.scoring===row.scoringVersion)?.tags??[])
    cached={cognitiveTestConfig:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.configVersion===where.configVersion)??null}} as unknown as Database
  }else if(kind==='FORM'&&!input.organizationId){
    const rows=filters.tags?.length?[]:await db.questionnaireFormSection.findMany({where:{contextSection:false,AND:filters.keyword?.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term=>({title:{contains:term,mode:'insensitive' as const}})),...(query?{title:contains}:{}),items:{every:{contextKey:null}},questionnaire:{creatorId:input.actorUserId,status:'PUBLISHED'}},include:questionnaireFormInclude,orderBy:{id:'asc'},skip:offset,take:Math.max(0,take-refs.length)})
    for(const row of rows)refs.push({ref:{kind,sourceId:'questionnaire:'+row.id,sourceVersion:questionnaireFormSourceVersion(row)},title:row.title})
    cached={questionnaireFormSection:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.questionnaire.creatorId===where.questionnaire.creatorId)??null}} as unknown as Database
  }else if(kind==='FORM'){
    await formScope(input.actorUserId,input.organizationId,db)
    const rows=filters.tags?.length?[]:await db.huiteacherFormInstrument.findMany({where:{AND:filters.keyword?.trim().toLowerCase().split(/\s+/).filter(Boolean).map(term=>({title:{contains:term,mode:'insensitive' as const}})),organizationId:input.organizationId,status:'PUBLISHED',...(query?{title:contains}:{})},orderBy:{id:'asc'},skip:offset,take:Math.max(0,take-refs.length)})
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:String(row.revision),organizationId:input.organizationId},title:row.title})
    cached={huiteacherFormInstrument:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.organizationId===where.organizationId&&r.revision===where.revision)??null}} as unknown as Database
  }else fail('SOURCE_KIND_UNSUPPORTED')
  const list:CatalogSourceRow[]=[]
  for(const item of refs.slice(0,limit)){try{
    const result=await readCatalogSourceSnapshot({actorUserId:input.actorUserId,ref:item.ref},isGovernedSource(item.ref.sourceId)?db:cached,true,db,scaleReleases)
    list.push({...item,...(sourceTags.get(item.ref.sourceId)?.length?{classificationTags:sourceTags.get(item.ref.sourceId)}:{}),available:true,unsupportedReason:null,definitionDigest:result.definitionDigest})
  }catch(e){
    if(!(e instanceof CatalogSourceError)&&!(e instanceof Error&&e.name==='SurveyDraftError'))throw e
    list.push({...item,...(sourceTags.get(item.ref.sourceId)?.length?{classificationTags:sourceTags.get(item.ref.sourceId)}:{}),available:false,unsupportedReason:e instanceof CatalogSourceError?e.code:'SOURCE_SURVEY_DISPLAY_SHAPE_UNSUPPORTED'})
  }}
  const moreSources=refs.length>limit
  return {list,page,hasMore:moreSources&&page<CATALOG_MAX_PAGE,
    terminalReason:!moreSources?'END_OF_CATALOG':page===CATALOG_MAX_PAGE?'PAGE_LIMIT_REACHED':null,tagFacets:discoveryFacets(records,kind)}
}

/** One source-row lock and one bounded source read per family, plus one authority read per distinct Form grantor/organization.
 * Rechecks are only for new publication, never execution of already frozen research. */
export async function assertCatalogSourcesCurrent(entries:Array<{snapshot:CatalogSourceSnapshot;actorUserId:string}>,db:Database=prisma):Promise<void>{
  if(!entries.length)return
  if(db===prisma)return prisma.$transaction(tx=>assertCatalogSourcesCurrent(entries,tx))
  if(entries.length>30)fail('SOURCE_PUBLICATION_LIMIT')
  const refs=entries.map(e=>e.snapshot.ref)
  await lockCatalogSourceRows(refs,db)
  const scales=refs.filter(r=>r.kind==='SCALE'&&!isGovernedSource(r.sourceId)),sjts=refs.filter(r=>r.kind==='SJT'&&!isGovernedSource(r.sourceId)&&!r.sourceId.startsWith('registry:')),
    cognitive=refs.filter(r=>r.kind==='COGNITIVE'&&!isGovernedSource(r.sourceId)),forms=refs.filter(r=>r.kind==='FORM'&&!isGovernedSource(r.sourceId)&&!r.sourceId.startsWith('questionnaire:')),questionnaireForms=refs.filter(r=>r.kind==='FORM'&&r.sourceId.startsWith('questionnaire:'))
  const [scaleRows,sjtRows,cognitiveRows,formRows,questionnaireRows]=await Promise.all([
    scales.length?db.scale.findMany({where:{status:'PUBLISHED',OR:scales.map(r=>({id:r.sourceId,instrumentVersion:r.sourceVersion}))},take:30}):[],
    sjts.length?db.sjtAuthorRelease.findMany({where:{status:'PUBLISHED',OR:sjts.map(r=>({id:r.sourceId,instrumentVersion:r.sourceVersion}))},take:30}):[],
    cognitive.length?db.cognitiveTestConfig.findMany({where:{status:'PUBLISHED',OR:cognitive.map(r=>({id:r.sourceId,configVersion:r.sourceVersion}))},take:30}):[],
    forms.length?db.huiteacherFormInstrument.findMany({where:{status:'PUBLISHED',OR:forms.map(r=>({id:r.sourceId,organizationId:r.organizationId??'',revision:Number(r.sourceVersion)}))},take:30}):[],
    questionnaireForms.length?db.questionnaireFormSection.findMany({where:{id:{in:questionnaireForms.map(r=>r.sourceId.slice(14))},questionnaire:{status:'PUBLISHED'}},include:questionnaireFormInclude,take:30}):[],
  ])
  const scaleReleases=await getContentReleaseBatch(db,scaleRows.flatMap(row=>row.measurementReleaseId?[row.measurementReleaseId]:[]),true)
  const verifiedScopes=new Set<string>()
  for(const entry of entries)if(entry.snapshot.ref.kind==='FORM'&&!entry.snapshot.ref.sourceId.startsWith('questionnaire:')&&!isGovernedSource(entry.snapshot.ref.sourceId)){
    const key=JSON.stringify([entry.actorUserId,entry.snapshot.ref.organizationId])
    if(!verifiedScopes.has(key)){await formScope(entry.actorUserId,entry.snapshot.ref.organizationId,db);verifiedScopes.add(key)}
  }
  // Private read facade avoids per-unit database queries while reusing exactly the same source fences.
  const cached={
    questionnaireFormSection:{findFirst:async({where}:any)=>questionnaireRows.find(r=>r.id===where.id&&r.questionnaire.creatorId===where.questionnaire.creatorId)??null},
    scale:{findFirst:async({where}:any)=>scaleRows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null},
    sjtAuthorRelease:{findFirst:async({where}:any)=>sjtRows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null},
    cognitiveTestConfig:{findFirst:async({where}:any)=>cognitiveRows.find(r=>r.id===where.id&&r.configVersion===where.configVersion)??null},
    huiteacherFormInstrument:{findFirst:async({where}:any)=>formRows.find(r=>r.id===where.id&&r.organizationId===where.organizationId&&r.revision===where.revision)??null},
  } as unknown as Database
  const verified=new Map<string,CatalogSourceSnapshot>()
  for(const entry of entries){
    const key=canonicalHash({ref:entry.snapshot.ref,actorUserId:entry.actorUserId,pinnedSjtAuthority:entry.snapshot.provenance.sjtEntryAuthority??null})
    let current=verified.get(key)
    if(!current){current=await readCatalogSourceSnapshot({actorUserId:entry.actorUserId,ref:entry.snapshot.ref,pinnedSjtAuthority:entry.snapshot.provenance.sjtEntryAuthority},cached,true,db,scaleReleases);verified.set(key,current)}
    // Whole immutable adapter identity includes original scorer, presentation, typed mapping and provenance.
    if(canonicalHash(catalogAdapterForRecheck(current,entry.snapshot))!==canonicalHash(entry.snapshot))fail('SOURCE_SNAPSHOT_CHANGED')
  }
}

/** @deprecated Copyright expiry is no longer a gate. Kept only for old callers.
 * First source verification already holds transaction-scoped source identity,
 * Scale/deployment and measurement-release SHARE locks. No mutable license
 * clock condition remains, so do not repeat identity SQL after later waits. */
export async function recheckCatalogScaleSourceExpiry(_db:Prisma.TransactionClient,_snapshots:Iterable<CatalogSourceSnapshot>):Promise<void> {}

export async function recheckCatalogSjtSourceAuthority(db:Prisma.TransactionClient,snapshots:Iterable<CatalogSourceSnapshot>){
  const seen=new Set<string>()
  for(const snapshot of snapshots){
    const receipt=snapshot.provenance.sjtEntryAuthority
    if(snapshot.ref.kind!=='SJT'||receipt===undefined)continue
    const key=canonicalHash(receipt);if(seen.has(key))continue
    seen.add(key)
    try{await recheckSjtEntryDistributionAuthority(db,receipt)}
    catch(error){if(error instanceof SjtEntryAuthorityError)throw new CatalogSourceError(error.code,403);throw error}
  }
}
