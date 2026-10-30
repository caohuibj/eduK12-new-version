import type {CatalogGrant,CatalogSourceRef} from '../survey/ResearchCatalog'
export type SurveyStandardReplacement={grantId:string;expectedVersion:1;reason:string}
export type SurveyStandardPending={requestId:string;recipientId:string;source:CatalogSourceRef;configurationName:string;title:string;replaces?:SurveyStandardReplacement}
export type SurveyStandardOperation={grant:CatalogGrant;request:{requestId:string;userId:string;configurationName:string;source:CatalogSourceRef;replaces?:SurveyStandardReplacement}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/
const keys=(value:object,names:string[])=>Object.keys(value).sort().join('|')===names.sort().join('|')
export const isSurveyStandardSource=(source:CatalogSourceRef)=>source?.kind==='SCALE'&&typeof source.sourceId==='string'&&source.sourceId.startsWith('survey-standard:')
export const isSurveyCognitiveProfileSource=(source:CatalogSourceRef)=>{
 if(!source||typeof source.sourceId!=='string'||typeof source.sourceVersion!=='string')return false
 const [prefix,id,profile,...extra]=source.sourceId.split(':')
 return source.kind==='COGNITIVE'&&prefix==='cognitive-profile'&&!extra.length&&uuid.test(id)&&['experience','standard','research'].includes(profile)&&hash.test(String(source.sourceVersion))&&!source.organizationId
}
export const isSurveyExactConfigurationSource=(source:CatalogSourceRef)=>isSurveyStandardSource(source)||isSurveyCognitiveProfileSource(source)
export function isSurveyStandardPending(raw:unknown):raw is SurveyStandardPending{
 if(!raw||typeof raw!=='object')return false
 const v=raw as SurveyStandardPending,s=v.source
 const r=v.replaces
 return keys(v,['requestId','recipientId','source','configurationName','title',...(r===undefined?[]:['replaces'])])&&uuid.test(v.requestId)&&uuid.test(v.recipientId)
  &&Boolean(s)&&keys(s,['kind','sourceId','sourceVersion'])&&isSurveyExactConfigurationSource(s)&&(!isSurveyStandardSource(s)||uuid.test(s.sourceId.slice(16)))&&typeof s.sourceVersion==='string'&&hash.test(s.sourceVersion)
  &&typeof v.configurationName==='string'&&v.configurationName.trim().length>0&&v.configurationName.length<=120
  &&typeof v.title==='string'&&v.title.length>0&&v.title.length<=1000
  &&(r===undefined||Boolean(r)&&keys(r,['grantId','expectedVersion','reason'])&&uuid.test(r.grantId)&&r.grantId!==v.requestId&&r.expectedVersion===1
    &&typeof r.reason==='string'&&r.reason.trim().length>0&&r.reason.length<=500)
}
export const sameSurveyStandardSource=(a:CatalogSourceRef,b:CatalogSourceRef)=>Boolean(a&&b&&a.kind===b.kind&&a.sourceId===b.sourceId&&String(a.sourceVersion)===String(b.sourceVersion)&&!a.organizationId&&!b.organizationId)
export function sameSurveyStandardOperation(value:SurveyStandardPending,found:SurveyStandardOperation){
 const r=found?.request,g=found?.grant
 return Boolean(r&&g&&g.id===value.requestId&&r.requestId===value.requestId&&r.userId===value.recipientId&&g.recipientId===value.recipientId&&['ACTIVE','REVOKED'].includes(g.status)
  &&r.configurationName===value.configurationName&&g.configurationName===value.configurationName
  &&sameSurveyStandardSource(r.source,value.source)&&sameSurveyStandardSource(g.sourceRef,value.source)
  &&g.selectedBinding?.authorizationId===value.requestId&&g.selectedBinding.authorizationRevision===1
  &&hash.test(g.selectedBinding.bindingHash)&&hash.test(g.selectedBinding.configurationHash))
  &&(value.replaces===undefined?r.replaces===undefined&&g.supersedes==null:Boolean(r.replaces&&g.supersedes)
    &&r.replaces!.grantId===value.replaces.grantId&&r.replaces!.expectedVersion===1&&r.replaces!.reason===value.replaces.reason
    &&g.supersedes!.selectedBinding?.authorizationId===value.replaces.grantId&&g.supersedes!.selectedBinding.authorizationRevision===1
    &&hash.test(g.supersedes!.selectedBinding.bindingHash)&&hash.test(g.supersedes!.selectedBinding.configurationHash)&&g.supersedes!.reason===value.replaces.reason)
}
