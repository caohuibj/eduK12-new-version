import {sessionFetch} from './client'
import type {CatalogClassificationTag} from './catalogDiscovery'
export type EducationManagerProduct='HUISCHOOL'|'HUITEACHER'
export type EducationConfigurationChoice={id:string;title:string;toolKey:string;instrumentVersion:string;combinationHash:string;
 versions:Record<'CONTENT'|'PARAMETERS'|'REPORT',string>;authorities:Array<{id:string;version:number;validFrom:string;expiresAt:string}>;
 assignable:boolean;unavailableReason:string|null;classificationTags?:CatalogClassificationTag[]}
export type EducationUseIssue={requestId:string;userId:string;combinationHash:string;authorityGrantId:string;expectedAuthorityVersion:number;
 validFrom:string;expiresAt:string;configurationName:string;replaces?:{grantId:string;expectedVersion:number;reason:string}}
export type EducationUseRevoke={requestId:string;expectedVersion:number;reason:string}
export type EducationManagedUse={id:string;userId:string;username:string;version:number;revokedAt:string|null;validFrom:string;expiresAt:string;
 configurationName:string|null;canManage:true;supersedes?:{selectedBinding:{authorizationId:string;authorizationRevision:number;bindingHash:string;configurationHash:string};reason:string}|null}
export type EducationManagerOperation={kind:'ISSUE';grant:{id:string;version:number;revokedAt:string|null};request:EducationUseIssue}|
 {kind:'REVOKE';grant:{id:string;version:number;revokedAt:string|null};request:EducationUseRevoke}
export type EducationPendingOperation={kind:'ISSUE';combinationId:string;body:EducationUseIssue;unknown:boolean}|
 {kind:'REVOKE';combinationId:string;grantId:string;body:EducationUseRevoke;unknown:boolean}
export class EducationConfigurationHttpError extends Error{constructor(message:string,readonly status:number){super(message)}}
export const educationConfigurationBase=(organizationId:string,product:EducationManagerProduct)=>
 `/api/platform/education/organizations/${encodeURIComponent(organizationId)}/products/${product}/standard-configurations`
export async function educationConfigurationRequest<T>(path:string,method='GET',body?:unknown):Promise<T>{
 const response=await sessionFetch(path,{method,headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 let value:{code:number|string;message?:string;data:T}
 try{value=await response.json()}catch{throw Error('响应暂不可读，请按原请求编号核对结果。')}
 if(!response.ok||value.code!==0)throw new EducationConfigurationHttpError(value.message??'配置操作未完成',response.status)
 return value.data
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,hash=/^[a-f0-9]{64}$/
const exactKeys=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).sort().join('|')===keys.sort().join('|')
function validReplacement(value:unknown){
 if(!value||typeof value!=='object')return false
 const v=value as Record<string,unknown>
 return exactKeys(v,['grantId','expectedVersion','reason'])&&uuid.test(String(v.grantId))&&Number.isInteger(v.expectedVersion)&&Number(v.expectedVersion)>0
  &&typeof v.reason==='string'&&v.reason.trim().length>0&&v.reason.length<=500
}
export function isEducationPending(value:unknown):value is EducationPendingOperation{
 if(!value||typeof value!=='object')return false
 const v=value as Record<string,unknown>,b=v.body as Record<string,unknown>|undefined
 if(!uuid.test(String(v.combinationId))||typeof v.unknown!=='boolean'||!b||typeof b!=='object'||!uuid.test(String(b.requestId)))return false
 if(v.kind==='REVOKE')return exactKeys(v,['kind','combinationId','grantId','body','unknown'])&&uuid.test(String(v.grantId))&&exactKeys(b,['requestId','expectedVersion','reason'])
  &&Number.isInteger(b.expectedVersion)&&Number(b.expectedVersion)>0&&typeof b.reason==='string'&&b.reason.trim().length>0&&b.reason.length<=500
 return v.kind==='ISSUE'&&exactKeys(v,['kind','combinationId','body','unknown'])&&exactKeys(b,['requestId','userId','combinationHash','authorityGrantId','expectedAuthorityVersion','validFrom','expiresAt','configurationName',...(b.replaces===undefined?[]:['replaces'])])
  &&uuid.test(String(b.userId))&&uuid.test(String(b.authorityGrantId))&&hash.test(String(b.combinationHash))&&Number.isInteger(b.expectedAuthorityVersion)&&Number(b.expectedAuthorityVersion)>0
  &&typeof b.validFrom==='string'&&Number.isFinite(Date.parse(b.validFrom))&&typeof b.expiresAt==='string'&&Date.parse(b.expiresAt)>Date.parse(b.validFrom)
  &&typeof b.configurationName==='string'&&b.configurationName.trim().length>0&&b.configurationName.length<=120
  &&(b.replaces===undefined||validReplacement(b.replaces))
}
/** Complete business intent, not only a resource/recipient match. Scope and
 * original issuer come from this actor-specific authenticated request path. */
export function sameEducationOperation(pending:EducationPendingOperation,found:EducationManagerOperation){
 if(!found||!found.request||!found.grant)return false
 if(pending.kind!==found.kind||pending.body.requestId!==found.request.requestId)return false
 if(pending.kind==='REVOKE'&&found.kind==='REVOKE')return pending.grantId===found.grant.id&&pending.body.expectedVersion===found.request.expectedVersion
  &&pending.body.reason===found.request.reason&&found.grant.version===pending.body.expectedVersion+1&&Boolean(found.grant.revokedAt)
 if(pending.kind!=='ISSUE'||found.kind!=='ISSUE')return false
 const a=pending.body,b=found.request
 return found.grant.id===a.requestId&&a.userId===b.userId&&a.combinationHash===b.combinationHash&&a.authorityGrantId===b.authorityGrantId
  &&a.expectedAuthorityVersion===b.expectedAuthorityVersion&&a.configurationName===b.configurationName
  &&Date.parse(a.validFrom)===Date.parse(b.validFrom)&&Date.parse(a.expiresAt)===Date.parse(b.expiresAt)
  &&(a.replaces===undefined&&b.replaces===undefined||Boolean(a.replaces&&b.replaces&&a.replaces.grantId===b.replaces.grantId
   &&a.replaces.expectedVersion===b.replaces.expectedVersion&&a.replaces.reason===b.replaces.reason))
}
