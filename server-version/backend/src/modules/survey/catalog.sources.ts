import { matchSurveyCognitiveProtocol } from './cognitive.protocols'
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
import { compileResearchCognitive, initialCognitiveDefinition } from './cognitive.definition'

type Database=Prisma.TransactionClient|PrismaClient
export const CATALOG_ADAPTER_VERSION='survey-catalog-v1' as const
export const CANONICAL_SCALE_ADAPTER_VERSION='survey-catalog-scale-v2' as const
export type CatalogSourceRef={kind:SurveyKind;sourceId:string;sourceVersion:string;organizationId?:string}
export type SourceAnswerMapping={type:'SCALE_TYPED_V1';items:Record<string,string>;options:Record<string,string|number>}
export type CatalogSourceSnapshot={ref:CatalogSourceRef;title:string;displayDefinition:unknown;compiledDefinition:unknown;
  definitionDigest:string;scoringDigest:string|null;answerMapping?:SourceAnswerMapping;
  adapterVersion:typeof CATALOG_ADAPTER_VERSION|typeof CANONICAL_SCALE_ADAPTER_VERSION;provenance:Record<string,unknown>}
export type CatalogSourceRow={ref:CatalogSourceRef;title:string;available:boolean;unsupportedReason:string|null;definitionDigest?:string}
const CATALOG_MAX_PAGE=40
export type CatalogSourcePage={list:CatalogSourceRow[];page:number;hasMore:boolean;terminalReason:'PAGE_LIMIT_REACHED'|'END_OF_CATALOG'|null}
export class CatalogSourceError extends Error {
  constructor(public readonly code:string,public readonly statusCode=409){super(code);this.name='CatalogSourceError'}
}
const fail=(code:string):never=>{throw new CatalogSourceError(code)}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
function rights(value:{status:string;redistribution:string}|undefined){
  if(!value||!['verified','authorized','self_authored'].includes(value.status)||value.redistribution!=='allowed')
    fail('SOURCE_RIGHTS_DO_NOT_ALLOW_SURVEY_REDISTRIBUTION')
}
function snapshot(ref:CatalogSourceRef,title:string,original:unknown,display:unknown,compiled:unknown,
  scoringDigest:string|null,provenance:Record<string,unknown>,answerMapping?:SourceAnswerMapping):CatalogSourceSnapshot {
  return copy({ref,title,displayDefinition:assertSurveyDraft(ref.kind,display,true),compiledDefinition:compiled,
    definitionDigest:canonicalHash(original),scoringDigest,adapterVersion:CATALOG_ADAPTER_VERSION,
    provenance,...(answerMapping?{answerMapping}:{})})
}
/** Only presentation identifiers are translated. The canonical score definition is copied byte-for-byte. */
export function adaptCatalogScale(ref:CatalogSourceRef,title:string,definition:ScaleDefinitionV2,
  options:{instrumentClass?:'STANDARD'|'CUSTOM_DESCRIPTIVE';presentationMode?:'ONE_BY_ONE'|'ALL_AT_ONCE'}={}):CatalogSourceSnapshot {
  rights(definition.license)
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
  rights(definition.license)
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
export function catalogAdapterForRecheck(current:CatalogSourceSnapshot,stored:CatalogSourceSnapshot):CatalogSourceSnapshot {
  if(stored.ref.kind!=='SCALE'||stored.adapterVersion!==CATALOG_ADAPTER_VERSION)return current
  const legacy=adaptLegacyCatalogScale(current.ref,current.title,current.compiledDefinition as ScaleDefinitionV2)
  return {...current,...legacy,provenance:{...current.provenance,...legacy.provenance}}
}
/** This adapter admits only complete, fixed V2 expert-key presentations; no branch flattening. */
export function adaptCatalogSjt(ref:CatalogSourceRef,title:string,pkg:SituationPackage):CatalogSourceSnapshot {
  rights(pkg.definition.license)
  if(pkg.releaseStatus!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
  const validation=validateSituationPackage(pkg)
  if(!validation.valid)fail('SOURCE_SJT_INVALID')
  if(pkg.definition.schemaVersion!==2)fail('SOURCE_SJT_V1_REQUIRES_SEPARATE_RUNTIME_ADAPTER')
  const d=pkg.definition as SituationDefinitionV2
  if(d.researchAssignment)fail('SOURCE_SJT_RESEARCH_CAPTURE_UNSUPPORTED')
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
    sourceNote:d.source.citation||d.source.title||title,licenseStatus:d.license.status==='self_authored'?'self_authored':'authorized',
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
  return snapshot(ref,title,d,display,d,canonicalHash(d.scoring),{source:d.source,license:d.license,definitionHash:validation.definitionHash})
}
export function adaptCatalogCognitive(ref:CatalogSourceRef,row:{name:string;testType:string;configVersion:string;engineVersion:string;scoringVersion:string;config:unknown;status:string;accessPolicy:string}):CatalogSourceSnapshot {
  if(row.status!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
  if(row.accessPolicy!=='OPEN')fail('SOURCE_COGNITIVE_ACCESS_POLICY_REQUIRES_SEPARATE_GRANT')
  const protocol=matchSurveyCognitiveProtocol(row)
  if(!protocol)
    fail('SOURCE_COGNITIVE_CONTROLLED_IDENTITY_UNSUPPORTED')
  const display={...initialCognitiveDefinition(),templateKey:protocol!.templateKey},compiled=compileResearchCognitive(display)
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
  if(input.ref.kind==='FORM'&&!input.ref.sourceId.startsWith('questionnaire:'))await formScope(input.actorUserId,input.ref.organizationId,db)
  await lockCatalogSourceRows([input.ref],db)
  return readCatalogSourceSnapshot(input,db,true)
}
/** The normal legacy UPDATE retirement path conflicts with these transaction-held locks. */
async function lockCatalogSourceRows(refs:CatalogSourceRef[],db:Database):Promise<void>{
  const ids=(kind:SurveyKind)=>[...new Set(refs.filter(r=>r.kind===kind&&!(kind==='SJT'&&r.sourceId.startsWith('registry:'))&&!(kind==='FORM'&&r.sourceId.startsWith('questionnaire:'))).map(r=>r.sourceId))].sort()
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
async function readCatalogSourceSnapshot(input:{actorUserId:string;ref:CatalogSourceRef},db:Database,verifiedFormScope:boolean,scaleAuthorityDb:Database=db,scaleReleases?:ReadonlyMap<string,StoredRelease>):Promise<CatalogSourceSnapshot>{
  const {ref}=input
  if(ref.kind==='SCALE'){
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
      sourceMeasurementRelease:{releaseId:admitted.release.releaseId,contentHash:admitted.release.contentHash},sourceRights:admitted.rights}}
  }
  if(ref.kind==='SJT'){
    let pkg:SituationPackage|undefined
    if(ref.sourceId.startsWith('registry:'))pkg=getSituationPackage(ref.sourceId.slice(9),ref.sourceVersion)
    else{
      const row=await db.sjtAuthorRelease.findFirst({where:{id:ref.sourceId,instrumentVersion:ref.sourceVersion,status:'PUBLISHED'}})
      if(row){pkg=row.package as unknown as SituationPackage
        const checked=validateSituationPackage(pkg)
        if(!checked.valid||checked.definitionHash!==row.definitionHash||pkg.key!==row.instrumentKey||pkg.instrumentVersion!==row.instrumentVersion)fail('SOURCE_SJT_RELEASE_DIGEST_MISMATCH')}
    }
    if(!pkg||pkg.releaseStatus!=='PUBLISHED')fail('SOURCE_NOT_PUBLISHED')
    if(isAssessmentOperationallyPaused({family:'SITUATIONAL',key:pkg!.key,version:ref.sourceVersion}))fail('SOURCE_OPERATIONALLY_PAUSED')
    return adaptCatalogSjt(ref,pkg!.definition.source.title||pkg!.key,pkg!)
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
export async function listCatalogSources(input:{actorUserId:string;kind?:SurveyKind;organizationId?:string;page?:number;limit?:number},db:Database=prisma):Promise<CatalogSourcePage>{
  const kind=input.kind??'SCALE'
  const limit=Math.min(25,Math.max(1,Math.floor(input.limit||25))),page=Math.max(1,Math.floor(input.page||1))
  if(page>CATALOG_MAX_PAGE)throw new CatalogSourceError('SOURCE_CATALOG_PAGE_LIMIT_EXCEEDED',400)
  const offset=(page-1)*limit,take=limit+1,refs:Array<{ref:CatalogSourceRef;title:string}>=[]
  let cached:Database=db
  let scaleReleases:Map<string,StoredRelease>|undefined
  if(kind==='SCALE'){
    const rows=await db.scale.findMany({where:{status:'PUBLISHED',instrumentClass:'STANDARD'},orderBy:{id:'asc'},skip:offset,take})
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.instrumentVersion},title:row.name})
    scaleReleases=await getContentReleaseBatch(db,rows.slice(0,limit).flatMap(row=>row.measurementReleaseId?[row.measurementReleaseId]:[]))
    cached={scale:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null}} as unknown as Database
  }else if(kind==='SJT'){
    const builtins=listSituationPackages().filter(p=>p.releaseStatus==='PUBLISHED').sort((a,b)=>a.key.localeCompare(b.key,'en')||a.instrumentVersion.localeCompare(b.instrumentVersion,'en'))
    for(const pkg of builtins.slice(offset,offset+take))refs.push({ref:{kind,sourceId:'registry:'+pkg.key,sourceVersion:pkg.instrumentVersion},title:pkg.definition.source.title||pkg.key})
    const rows=refs.length<take?await db.sjtAuthorRelease.findMany({where:{status:'PUBLISHED'},orderBy:{id:'asc'},skip:Math.max(0,offset-builtins.length),take:take-refs.length}):[]
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.instrumentVersion},title:row.instrumentKey})
    cached={sjtAuthorRelease:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.instrumentVersion===where.instrumentVersion)??null}} as unknown as Database
  }else if(kind==='COGNITIVE'){
    const rows=await db.cognitiveTestConfig.findMany({where:{status:'PUBLISHED'},orderBy:{id:'asc'},skip:offset,take})
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:row.configVersion},title:row.name})
    cached={cognitiveTestConfig:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.configVersion===where.configVersion)??null}} as unknown as Database
  }else if(kind==='FORM'&&!input.organizationId){
    const rows=await db.questionnaireFormSection.findMany({where:{contextSection:false,items:{every:{contextKey:null}},questionnaire:{creatorId:input.actorUserId,status:'PUBLISHED'}},include:questionnaireFormInclude,orderBy:{id:'asc'},skip:offset,take})
    for(const row of rows)refs.push({ref:{kind,sourceId:'questionnaire:'+row.id,sourceVersion:questionnaireFormSourceVersion(row)},title:row.title})
    cached={questionnaireFormSection:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.questionnaire.creatorId===where.questionnaire.creatorId)??null}} as unknown as Database
  }else if(kind==='FORM'){
    await formScope(input.actorUserId,input.organizationId,db)
    const rows=await db.huiteacherFormInstrument.findMany({where:{organizationId:input.organizationId,status:'PUBLISHED'},orderBy:{id:'asc'},skip:offset,take})
    for(const row of rows)refs.push({ref:{kind,sourceId:row.id,sourceVersion:String(row.revision),organizationId:input.organizationId},title:row.title})
    cached={huiteacherFormInstrument:{findFirst:async({where}:any)=>rows.find(r=>r.id===where.id&&r.organizationId===where.organizationId&&r.revision===where.revision)??null}} as unknown as Database
  }else fail('SOURCE_KIND_UNSUPPORTED')
  const list:CatalogSourceRow[]=[]
  for(const item of refs.slice(0,limit)){try{
    const result=await readCatalogSourceSnapshot({actorUserId:input.actorUserId,ref:item.ref},cached,true,db,scaleReleases)
    list.push({...item,available:true,unsupportedReason:null,definitionDigest:result.definitionDigest})
  }catch(e){
    if(!(e instanceof CatalogSourceError)&&!(e instanceof Error&&e.name==='SurveyDraftError'))throw e
    list.push({...item,available:false,unsupportedReason:e instanceof CatalogSourceError?e.code:'SOURCE_SURVEY_DISPLAY_SHAPE_UNSUPPORTED'})
  }}
  const moreSources=refs.length>limit
  return {list,page,hasMore:moreSources&&page<CATALOG_MAX_PAGE,
    terminalReason:!moreSources?'END_OF_CATALOG':page===CATALOG_MAX_PAGE?'PAGE_LIMIT_REACHED':null}
}

/** One source-row lock and one bounded source read per family, plus one authority read per distinct Form grantor/organization.
 * Rechecks are only for new publication, never execution of already frozen research. */
export async function assertCatalogSourcesCurrent(entries:Array<{snapshot:CatalogSourceSnapshot;actorUserId:string}>,db:Database=prisma):Promise<void>{
  if(!entries.length)return
  if(db===prisma)return prisma.$transaction(tx=>assertCatalogSourcesCurrent(entries,tx))
  if(entries.length>30)fail('SOURCE_PUBLICATION_LIMIT')
  const refs=entries.map(e=>e.snapshot.ref)
  await lockCatalogSourceRows(refs,db)
  const scales=refs.filter(r=>r.kind==='SCALE'),sjts=refs.filter(r=>r.kind==='SJT'&&!r.sourceId.startsWith('registry:')),
    cognitive=refs.filter(r=>r.kind==='COGNITIVE'),forms=refs.filter(r=>r.kind==='FORM'&&!r.sourceId.startsWith('questionnaire:')),questionnaireForms=refs.filter(r=>r.kind==='FORM'&&r.sourceId.startsWith('questionnaire:'))
  const [scaleRows,sjtRows,cognitiveRows,formRows,questionnaireRows]=await Promise.all([
    scales.length?db.scale.findMany({where:{status:'PUBLISHED',OR:scales.map(r=>({id:r.sourceId,instrumentVersion:r.sourceVersion}))},take:30}):[],
    sjts.length?db.sjtAuthorRelease.findMany({where:{status:'PUBLISHED',OR:sjts.map(r=>({id:r.sourceId,instrumentVersion:r.sourceVersion}))},take:30}):[],
    cognitive.length?db.cognitiveTestConfig.findMany({where:{status:'PUBLISHED',OR:cognitive.map(r=>({id:r.sourceId,configVersion:r.sourceVersion}))},take:30}):[],
    forms.length?db.huiteacherFormInstrument.findMany({where:{status:'PUBLISHED',OR:forms.map(r=>({id:r.sourceId,organizationId:r.organizationId??'',revision:Number(r.sourceVersion)}))},take:30}):[],
    questionnaireForms.length?db.questionnaireFormSection.findMany({where:{id:{in:questionnaireForms.map(r=>r.sourceId.slice(14))},questionnaire:{status:'PUBLISHED'}},include:questionnaireFormInclude,take:30}):[],
  ])
  const scaleReleases=await getContentReleaseBatch(db,scaleRows.flatMap(row=>row.measurementReleaseId?[row.measurementReleaseId]:[]),true)
  const verifiedScopes=new Set<string>()
  for(const entry of entries)if(entry.snapshot.ref.kind==='FORM'&&!entry.snapshot.ref.sourceId.startsWith('questionnaire:')){
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
    const key=canonicalHash({ref:entry.snapshot.ref,actorUserId:entry.actorUserId})
    let current=verified.get(key)
    if(!current){current=await readCatalogSourceSnapshot({actorUserId:entry.actorUserId,ref:entry.snapshot.ref},cached,true,db,scaleReleases);verified.set(key,current)}
    // Whole immutable adapter identity includes original scorer, presentation, typed mapping and provenance.
    if(canonicalHash(catalogAdapterForRecheck(current,entry.snapshot))!==canonicalHash(entry.snapshot))fail('SOURCE_SNAPSHOT_CHANGED')
  }
}

/** Current grants/sources were already verified and SHARE-locked by this caller.
 * Only elapsed time can change now. Reuse the verified snapshot after later
 * publication/asset waits instead of rereading/compiling entire packages. */
export async function recheckCatalogScaleSourceExpiry(db:Prisma.TransactionClient,snapshots:Iterable<CatalogSourceSnapshot>){
  const managed=[...snapshots].filter(snapshot=>snapshot.ref.kind==='SCALE'&&snapshot.provenance.instrumentClass==='STANDARD')
  if(!managed.length)return
  const [clock]=await db.$queryRaw<Array<{now:Date}>>(Prisma.sql`SELECT clock_timestamp() AS now`)
  if(!clock)fail('SOURCE_SCALE_CLOCK_UNAVAILABLE')
  for(const snapshot of managed){
    const rights=snapshot.provenance.sourceRights as {validFrom?:string;validTo?:string}|undefined
    const from=Date.parse(rights?.validFrom??''),to=Date.parse(rights?.validTo??'')
    if(!Number.isFinite(from)||!Number.isFinite(to)||clock.now.getTime()<from||clock.now.getTime()>=to)fail('SOURCE_SCALE_LICENSE_EXPIRED')
  }
}
