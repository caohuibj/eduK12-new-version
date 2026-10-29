import api from './client'

export type StandardConfigurationChoice={id:string;title:string;toolKey:string;instrumentVersion:string;combinationHash:string;
  state:string;versions:{CONTENT:string;PARAMETERS:string;REPORT:string};assignable:boolean;unavailableReason:string|null}
export type StandardConfigurationUse={id:string;userId:string;username:string;nickname:string|null;issuerId:string;version:number;
  revokedAt:string|null;combinationHash:string;canManage:boolean}
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
    &&/^[a-f0-9]{64}$/.test(value.combinationHash))
}
const base='/questionnaire-products'
export const standardConfigurationGrantsApi={
  catalog:(page=1)=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationChoice[]}>(base+'/standard-combinations/catalog',{params:{page}}),
  grants:(id:string,query:{page?:number;userId?:string}={})=>api.get<{page:number;hasMore:boolean;list:StandardConfigurationUse[]}>(base+'/standard-combinations/'+encodeURIComponent(id)+'/use-grants',{params:{page:1,...query}}),
  issue:(choice:StandardConfigurationChoice,input:{requestId:string;userId:string;expectedUseVersion?:number})=>
    api.post<{id:string;version:number;revoked:boolean}>(base+'/standard-combinations/'+encodeURIComponent(choice.id)+'/use-grants',{
      ...input,combinationHash:choice.combinationHash,
    }),
  revoke:(grant:StandardConfigurationUse,reason:string)=>api.post(base+'/standard-combination-use-grants/'+encodeURIComponent(grant.id)+'/revoke',{
    expectedVersion:grant.version,reason,
  }),
}
