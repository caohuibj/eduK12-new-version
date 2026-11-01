import api from './client'
import {catalogQuery,type CatalogClassificationTag,type CatalogFilters,type CatalogTagFacets} from './catalogDiscovery'
import type {StandardConfigurationPointer} from './standardConfigurationGrants'
export type CognitiveProfile='experience'|'standard'|'research'
export type CognitiveProfileChoice={configId:string;title:string;artifactHash:string;profile:CognitiveProfile;configuration:Record<string,unknown>;available:boolean;unavailableReason:string|null;classificationTags?:CatalogClassificationTag[]}
export type CognitiveProfileUse={id:string;version:number;userId:string;issuerId:string;configurationName:string;profile:CognitiveProfile;artifactHash:string;
 selectedBinding:StandardConfigurationPointer;validFrom:string;expiresAt:string;revokedAt:string|null;canManage:boolean}
export type CognitiveProfileIssue={requestId:string;userId:string;artifactHash:string;configurationName:string;validFrom:string;expiresAt:string;
 replaces?:{grantId:string;expectedVersion:number;reason:string}}
export type CognitiveProfileRevoke={requestId:string;expectedVersion:number;reason:string}
export type CognitiveProfilePending={kind:'ISSUE';configId:string;profile:CognitiveProfile;body:CognitiveProfileIssue}|{kind:'REVOKE';configId:string;grantId:string;body:CognitiveProfileRevoke}
export type CognitiveProfileOperation={kind:'ISSUE';profile:CognitiveProfile;request:CognitiveProfileIssue;grant:{id:string;version:number;revokedAt:string|null};selectedBinding:StandardConfigurationPointer}
 |{kind:'REVOKE';request:CognitiveProfileRevoke;grantId:string;grant:{id:string;version:number;revokedAt:string|null}}
const prefix='/cognitive/profile-configurations/training',uuid=/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i,digest=/^[a-f\d]{64}$/
const exact=(o:object,required:string[],optional:string[]=[])=>required.every(k=>Object.prototype.hasOwnProperty.call(o,k))&&Object.keys(o).every(k=>required.includes(k)||optional.includes(k))
export function validCognitiveProfilePending(raw:unknown):raw is CognitiveProfilePending{
 if(!raw||typeof raw!=='object')return false
 const p=raw as CognitiveProfilePending,b=p.body
 if(!b||!uuid.test(p.configId)||!uuid.test(b.requestId))return false
 if(p.kind==='REVOKE')return exact(p,['kind','configId','grantId','body'])&&uuid.test(p.grantId)&&exact(b,['requestId','expectedVersion','reason'])&&Number.isInteger(p.body.expectedVersion)&&p.body.expectedVersion>0&&typeof p.body.reason==='string'&&p.body.reason.trim().length>0&&p.body.reason.length<=500
 if(p.kind!=='ISSUE'||!exact(p,['kind','configId','profile','body'])||!['experience','standard','research'].includes(p.profile))return false
 const value=p.body,r=value.replaces
 return exact(value,['requestId','userId','artifactHash','configurationName','validFrom','expiresAt'],['replaces'])&&uuid.test(value.userId)&&digest.test(value.artifactHash)
  &&typeof value.configurationName==='string'&&value.configurationName.trim().length>0&&value.configurationName.length<=120
  &&typeof value.validFrom==='string'&&typeof value.expiresAt==='string'&&Number.isFinite(Date.parse(value.validFrom))&&Date.parse(value.expiresAt)>Date.parse(value.validFrom)
  &&(!r||exact(r,['grantId','expectedVersion','reason'])&&uuid.test(r.grantId)&&Number.isInteger(r.expectedVersion)&&r.expectedVersion>0&&typeof r.reason==='string'&&r.reason.trim().length>0&&r.reason.length<=500)
}
export function sameCognitiveProfileOperation(p:CognitiveProfilePending,operation:CognitiveProfileOperation){
 if(!operation||operation.kind!==p.kind||!operation.grant||operation.request?.requestId!==p.body.requestId)return false
 if(p.kind==='REVOKE'&&operation.kind==='REVOKE')return operation.grantId===p.grantId&&operation.request.expectedVersion===p.body.expectedVersion&&operation.request.reason===p.body.reason
 if(p.kind!=='ISSUE'||operation.kind!=='ISSUE')return false
 const a=p.body,b=operation.request
 return operation.profile===p.profile&&operation.grant.id===a.requestId&&['requestId','userId','artifactHash','configurationName','validFrom','expiresAt'].every(k=>a[k as keyof CognitiveProfileIssue]===b[k as keyof CognitiveProfileIssue])
  &&(a.replaces?Boolean(b.replaces&&a.replaces.grantId===b.replaces.grantId&&a.replaces.expectedVersion===b.replaces.expectedVersion&&a.replaces.reason===b.replaces.reason):!b.replaces)
}
export const cognitiveProfileGrantsApi={
 catalog:(page=1,filters?:CatalogFilters)=>api.get<{page:number;hasMore:boolean;list:CognitiveProfileChoice[];tagFacets?:CatalogTagFacets}>(prefix+'/catalog?'+(filters?catalogQuery(page,filters):'page='+page)),
 uses:(configId:string,userId:string)=>api.get<{hasMore:boolean;list:CognitiveProfileUse[]}>(`${prefix}/${encodeURIComponent(configId)}/use-grants?userId=${encodeURIComponent(userId)}`),
 preview:(choice:CognitiveProfileChoice)=>api.get<{artifactHash:string;reportStyle:{title:string;profile:CognitiveProfile;caveats:string[];disclaimer:string;headline:Array<{key:string;label:string}>;detail:Array<{key:string;label:string}>}}>(`${prefix}/${encodeURIComponent(choice.configId)}/${choice.profile}/preview?artifactHash=${choice.artifactHash}`),
 send:(p:CognitiveProfilePending)=>p.kind==='ISSUE'?api.post(`${prefix}/${encodeURIComponent(p.configId)}/${p.profile}/use-grants`,p.body)
  :api.post(`${prefix}/${encodeURIComponent(p.configId)}/use-grants/${encodeURIComponent(p.grantId)}/revoke`,p.body),
 operation:(p:CognitiveProfilePending)=>api.get<CognitiveProfileOperation|null>(`${prefix}/${encodeURIComponent(p.configId)}/use-requests/${encodeURIComponent(p.body.requestId)}`),
}
