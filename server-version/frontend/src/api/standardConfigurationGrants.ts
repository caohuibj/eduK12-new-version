import api from './client'

export type StandardConfigurationChoice={id:string;title:string;toolKey:string;instrumentVersion:string;combinationHash:string;
  state:string;versions:{CONTENT:string;PARAMETERS:string;REPORT:string};assignable:boolean;unavailableReason:string|null}
export type StandardConfigurationPointer={authorizationId:string;authorizationRevision:number;bindingHash:string;configurationHash:string}
export type StandardConfigurationReplacement={grantId:string;expectedVersion:number;reason:string}
export type StandardConfigurationLineage={selectedBinding:StandardConfigurationPointer;reason:string}
export type StandardConfigurationUse={id:string;userId:string;username:string;nickname:string|null;issuerId:string;version:number;
  revokedAt:string|null;combinationHash:string;canManage:boolean;configurationName?:string|null;selectedBinding?:StandardConfigurationPointer}
export type StandardConfigurationIssueResult={id:string;userId:string;combination:{releaseId:string;combinationHash:string};version:number;currentVersion:number;revoked:boolean;supersedes?:StandardConfigurationLineage}
export type StandardConfigurationPending={requestId:string;combinationId:string;combinationHash:string;userId:string;configurationName:string;title:string;
 expectedUseVersion?:number;expectedUseId?:string;replaces?:StandardConfigurationReplacement}
export type StandardConfigurationOperation={legacy:boolean;grant:{id:string;version:number;currentVersion:number|null;revoked:boolean;supersedes?:StandardConfigurationLineage};request:null|{
 requestId:string;actorId:string;combinationId:string;combinationHash:string;userId:string;configurationName?:string;grantId:string|null;expectedGrantVersion:number|null;expectedUseVersion:number|null;expectedUseId?:string;replaces?:StandardConfigurationReplacement}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const digest=/^[a-f0-9]{64}$/
function validPointer(raw:unknown):raw is StandardConfigurationPointer{
 if(!raw||typeof raw!=='object')return false
 const value=raw as StandardConfigurationPointer
 return exactKeys(value,['authorizationId','authorizationRevision','bindingHash','configurationHash'])&&uuid.test(value.authorizationId)
  &&Number.isInteger(value.authorizationRevision)&&value.authorizationRevision>0&&digest.test(value.bindingHash)&&digest.test(value.configurationHash)
}
function validReplacement(raw:unknown):raw is StandardConfigurationReplacement{
 if(!raw||typeof raw!=='object')return false
 const value=raw as StandardConfigurationReplacement
 return exactKeys(value,['grantId','expectedVersion','reason'])&&uuid.test(value.grantId)&&Number.isInteger(value.expectedVersion)&&value.expectedVersion>0
  &&typeof value.reason==='string'&&value.reason.trim().length>0&&value.reason.length<=500
}
export function sameStandardConfigurationLineage(replaces:StandardConfigurationReplacement|undefined,raw:unknown){
 if(!replaces)return raw==null
 if(!raw||typeof raw!=='object')return false
 const value=raw as StandardConfigurationLineage
 return validPointer(value.selectedBinding)&&value.selectedBinding.authorizationId===replaces.grantId
  &&value.selectedBinding.authorizationRevision===replaces.expectedVersion&&value.reason===replaces.reason
}
export function validStandardConfigurationChoice(value:StandardConfigurationChoice):boolean{
  return Boolean(value&&uuid.test(value.id)&&/^[a-f0-9]{64}$/.test(value.combinationHash)
    &&typeof value.title==='string'&&value.title&&typeof value.toolKey==='string'&&value.toolKey
    &&typeof value.instrumentVersion==='string'&&value.instrumentVersion
    &&value.versions&&['CONTENT','PARAMETERS','REPORT'].every(axis=>typeof value.versions[axis as keyof typeof value.versions]==='string')
    &&typeof value.state==='string'&&typeof value.assignable==='boolean')
}
export function validStandardConfigurationUse(value:StandardConfigurationUse):boolean{
  return Boolean(value&&uuid.test(value.id)&&uuid.test(value.userId)&&uuid.test(value.issuerId)
    &&Number.isInteger(value.version)&&value.version>0&&typeof value.canManage==='boolean'
    &&typeof value.username==='string'&&(value.revokedAt===null||typeof value.revokedAt==='string'&&Number.isFinite(Date.parse(value.revokedAt)))
    &&/^[a-f0-9]{64}$/.test(value.combinationHash)&&(value.configurationName==null||typeof value.configurationName==='string'&&value.configurationName.trim().length>0&&value.configurationName.length<=120)
    &&(value.selectedBinding===undefined||validPointer(value.selectedBinding)&&value.selectedBinding.authorizationId===value.id&&value.selectedBinding.authorizationRevision===value.version-(value.revokedAt?1:0)))
}
const exactKeys=(raw:object,keys:string[])=>Object.keys(raw).sort().join('|')===keys.sort().join('|')
export function validStandardConfigurationPending(raw:unknown):raw is StandardConfigurationPending{
 if(!raw||typeof raw!=='object')return false
 const v=raw as StandardConfigurationPending,hasVersion=v.expectedUseVersion!==undefined,hasId=v.expectedUseId!==undefined
 return hasVersion===hasId&&exactKeys(v,['requestId','combinationId','combinationHash','userId','configurationName','title',...(hasVersion?['expectedUseVersion','expectedUseId']:[]),...(v.replaces===undefined?[]:['replaces'])])
  &&uuid.test(v.requestId)&&uuid.test(v.combinationId)&&uuid.test(v.userId)&&/^[a-f0-9]{64}$/.test(v.combinationHash)
  &&typeof v.configurationName==='string'&&v.configurationName.trim().length>0&&v.configurationName.length<=120&&typeof v.title==='string'&&v.title.length>0&&v.title.length<=1000
  &&(!hasVersion||Number.isInteger(v.expectedUseVersion)&&Number(v.expectedUseVersion)>0&&uuid.test(v.expectedUseId!))
  &&(v.replaces===undefined||validReplacement(v.replaces)&&v.replaces.grantId!==v.requestId&&v.replaces.grantId!==v.expectedUseId)
}
export function sameStandardConfigurationOperation(actorId:string,pending:StandardConfigurationPending,found:StandardConfigurationOperation){
 const r=found?.request,g=found?.grant
 if(!r||!g)return false
 return Boolean(found?.legacy===false&&r&&g&&r.requestId===pending.requestId&&r.actorId===actorId&&r.combinationId===pending.combinationId
  &&r.combinationHash===pending.combinationHash&&r.userId===pending.userId&&r.configurationName===pending.configurationName
  &&r.grantId===null&&r.expectedGrantVersion===null&&r.expectedUseVersion===(pending.expectedUseVersion??null)&&r.expectedUseId===pending.expectedUseId
  &&uuid.test(g.id)&&Number.isInteger(g.version)&&g.version>0&&typeof g.revoked==='boolean'
  &&(g.currentVersion===null||Number.isInteger(g.currentVersion)&&g.currentVersion>=g.version)
  &&(g.currentVersion===g.version||g.revoked)
  &&(pending.expectedUseId===undefined||g.id===pending.expectedUseId&&g.version===pending.expectedUseVersion!+1))
  &&(pending.replaces===undefined?r.replaces===undefined:validReplacement(r.replaces)&&r.replaces.grantId===pending.replaces.grantId
    &&r.replaces.expectedVersion===pending.replaces.expectedVersion&&r.replaces.reason===pending.replaces.reason)
  &&sameStandardConfigurationLineage(pending.replaces,g.supersedes)
}
const base='/questionnaire-products'
export const standardConfigurationGrantsApi={
  catalog:(page=1)=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationChoice[]}>(base+'/standard-combinations/catalog',{params:{page}}),
  grants:(id:string,query:{page?:number;userId?:string}={})=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationUse[]}>(base+'/standard-combinations/'+encodeURIComponent(id)+'/use-grants',{params:{page:1,...query}}),
  issue:(choice:Pick<StandardConfigurationChoice,'id'|'combinationHash'>,input:{requestId:string;userId:string;configurationName?:string;expectedUseVersion?:number;expectedUseId?:string;replaces?:StandardConfigurationReplacement})=>
    api.post<StandardConfigurationIssueResult>(base+'/standard-combinations/'+encodeURIComponent(choice.id)+'/use-grants',{
      ...input,combinationHash:choice.combinationHash,
    }),
  operation:(pending:Pick<StandardConfigurationPending,'combinationId'|'requestId'>,grantId?:string)=>api.get<{operation:StandardConfigurationOperation|null}>(base+'/standard-combinations/'+encodeURIComponent(pending.combinationId)+'/use-requests/'+encodeURIComponent(pending.requestId),{params:grantId?{grantId}:{}}),
  revoke:(grant:StandardConfigurationUse,reason:string)=>api.post(base+'/standard-combination-use-grants/'+encodeURIComponent(grant.id)+'/revoke',{
    expectedVersion:grant.version,reason,
  }),
}
