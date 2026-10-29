import type {CatalogGrant,CatalogSourceRef} from '../survey/ResearchCatalog'
export type SurveyStandardPending={requestId:string;recipientId:string;source:CatalogSourceRef;configurationName:string;title:string}
export type SurveyStandardOperation={grant:CatalogGrant;request:{requestId:string;userId:string;configurationName:string;source:CatalogSourceRef}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/
const keys=(value:object,names:string[])=>Object.keys(value).sort().join('|')===names.sort().join('|')
export const isSurveyStandardSource=(source:CatalogSourceRef)=>source.kind==='SCALE'&&source.sourceId.startsWith('survey-standard:')
export function isSurveyStandardPending(raw:unknown):raw is SurveyStandardPending{
 if(!raw||typeof raw!=='object')return false
 const v=raw as SurveyStandardPending,s=v.source
 return keys(v,['requestId','recipientId','source','configurationName','title'])&&uuid.test(v.requestId)&&uuid.test(v.recipientId)
  &&Boolean(s)&&keys(s,['kind','sourceId','sourceVersion'])&&isSurveyStandardSource(s)&&uuid.test(s.sourceId.slice(16))&&hash.test(String(s.sourceVersion))
  &&typeof v.configurationName==='string'&&v.configurationName.trim().length>0&&v.configurationName.length<=120
  &&typeof v.title==='string'&&v.title.length>0&&v.title.length<=1000
}
export const sameSurveyStandardSource=(a:CatalogSourceRef,b:CatalogSourceRef)=>Boolean(a&&b&&a.kind===b.kind&&a.sourceId===b.sourceId&&String(a.sourceVersion)===String(b.sourceVersion)&&!a.organizationId&&!b.organizationId)
export function sameSurveyStandardOperation(value:SurveyStandardPending,found:SurveyStandardOperation){
 const r=found?.request,g=found?.grant
 return Boolean(r&&g&&g.id===value.requestId&&r.requestId===value.requestId&&r.userId===value.recipientId&&g.recipientId===value.recipientId&&['ACTIVE','REVOKED'].includes(g.status)
  &&r.configurationName===value.configurationName&&g.configurationName===value.configurationName
  &&sameSurveyStandardSource(r.source,value.source)&&sameSurveyStandardSource(g.sourceRef,value.source)
  &&g.selectedBinding?.authorizationId===value.requestId&&g.selectedBinding.authorizationRevision===1
  &&hash.test(g.selectedBinding.bindingHash)&&hash.test(g.selectedBinding.configurationHash))
}
