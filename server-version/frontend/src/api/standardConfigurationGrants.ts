import api from './client'

export type StandardConfigurationChoice={id:string;title:string;toolKey:string;instrumentVersion:string;combinationHash:string;
  state:string;versions:{CONTENT:string;PARAMETERS:string;REPORT:string};assignable:boolean;unavailableReason:string|null}
export type StandardConfigurationUse={id:string;userId:string;username:string;nickname:string|null;issuerId:string;version:number;
  revokedAt:string|null;combinationHash:string;canManage:boolean;configurationName?:string|null}
export type StandardConfigurationIssueResult={id:string;userId:string;combination:{releaseId:string;combinationHash:string};version:number;currentVersion:number;revoked:boolean}
export type StandardConfigurationPending={requestId:string;combinationId:string;combinationHash:string;userId:string;configurationName:string;title:string;
 expectedUseVersion?:number;expectedUseId?:string}
export type StandardConfigurationOperation={legacy:boolean;grant:{id:string;version:number;currentVersion:number|null;revoked:boolean};request:null|{
 requestId:string;actorId:string;combinationId:string;combinationHash:string;userId:string;configurationName?:string;grantId:string|null;expectedGrantVersion:number|null;expectedUseVersion:number|null;expectedUseId?:string}}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
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
    &&typeof value.username==='string'&&(value.revokedAt===null||typeof value.revokedAt==='string')
    &&/^[a-f0-9]{64}$/.test(value.combinationHash)&&(value.configurationName==null||typeof value.configurationName==='string'&&value.configurationName.trim().length>0&&value.configurationName.length<=120))
}
const exactKeys=(raw:object,keys:string[])=>Object.keys(raw).sort().join('|')===keys.sort().join('|')
export function validStandardConfigurationPending(raw:unknown):raw is StandardConfigurationPending{
 if(!raw||typeof raw!=='object')return false
 const v=raw as StandardConfigurationPending,hasVersion=v.expectedUseVersion!==undefined,hasId=v.expectedUseId!==undefined
 return hasVersion===hasId&&exactKeys(v,['requestId','combinationId','combinationHash','userId','configurationName','title',...(hasVersion?['expectedUseVersion','expectedUseId']:[])])
  &&uuid.test(v.requestId)&&uuid.test(v.combinationId)&&uuid.test(v.userId)&&/^[a-f0-9]{64}$/.test(v.combinationHash)
  &&typeof v.configurationName==='string'&&v.configurationName.trim().length>0&&v.configurationName.length<=120&&typeof v.title==='string'&&v.title.length>0&&v.title.length<=1000
  &&(!hasVersion||Number.isInteger(v.expectedUseVersion)&&Number(v.expectedUseVersion)>0&&uuid.test(v.expectedUseId!))
}
export function sameStandardConfigurationOperation(actorId:string,pending:StandardConfigurationPending,found:StandardConfigurationOperation){
 const r=found?.request,g=found?.grant
 return Boolean(found?.legacy===false&&r&&g&&r.requestId===pending.requestId&&r.actorId===actorId&&r.combinationId===pending.combinationId
  &&r.combinationHash===pending.combinationHash&&r.userId===pending.userId&&r.configurationName===pending.configurationName
  &&r.grantId===null&&r.expectedGrantVersion===null&&r.expectedUseVersion===(pending.expectedUseVersion??null)&&r.expectedUseId===pending.expectedUseId
  &&uuid.test(g.id)&&Number.isInteger(g.version)&&g.version>0&&typeof g.revoked==='boolean'
  &&(g.currentVersion===null||Number.isInteger(g.currentVersion)&&g.currentVersion>=g.version)
  &&(g.currentVersion===g.version||g.revoked)
  &&(pending.expectedUseId===undefined||g.id===pending.expectedUseId&&g.version===pending.expectedUseVersion!+1))
}
const base='/questionnaire-products'
export const standardConfigurationGrantsApi={
  catalog:(page=1)=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationChoice[]}>(base+'/standard-combinations/catalog',{params:{page}}),
  grants:(id:string,query:{page?:number;userId?:string}={})=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationUse[]}>(base+'/standard-combinations/'+encodeURIComponent(id)+'/use-grants',{params:{page:1,...query}}),
  issue:(choice:Pick<StandardConfigurationChoice,'id'|'combinationHash'>,input:{requestId:string;userId:string;configurationName?:string;expectedUseVersion?:number;expectedUseId?:string})=>
    api.post<StandardConfigurationIssueResult>(base+'/standard-combinations/'+encodeURIComponent(choice.id)+'/use-grants',{
      ...input,combinationHash:choice.combinationHash,
    }),
  operation:(pending:Pick<StandardConfigurationPending,'combinationId'|'requestId'>,grantId?:string)=>api.get<{operation:StandardConfigurationOperation|null}>(base+'/standard-combinations/'+encodeURIComponent(pending.combinationId)+'/use-requests/'+encodeURIComponent(pending.requestId),{params:grantId?{grantId}:{}}),
  revoke:(grant:StandardConfigurationUse,reason:string)=>api.post(base+'/standard-combination-use-grants/'+encodeURIComponent(grant.id)+'/revoke',{
    expectedVersion:grant.version,reason,
  }),
}
