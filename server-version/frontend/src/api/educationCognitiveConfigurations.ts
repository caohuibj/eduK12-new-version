import {isEducationPending,sameEducationOperation,type EducationPendingOperation,type EducationManagerOperation,type EducationUseIssue,type EducationUseRevoke} from './educationStandardConfigurations'
export type EducationCognitiveProfile='experience'|'standard'|'research'
export type EducationCognitiveIssue=Omit<EducationUseIssue,'combinationHash'>&{artifactHash:string}
export type EducationCognitivePending={kind:'ISSUE';configId:string;profile:EducationCognitiveProfile;body:EducationCognitiveIssue;unknown:boolean}|
 {kind:'REVOKE';configId:string;grantId:string;body:EducationUseRevoke;unknown:boolean}
const names=(value:object,expected:string[])=>Object.keys(value).sort().join('|')===expected.sort().join('|')
function common(value:EducationCognitivePending):EducationPendingOperation{
 if(value.kind==='REVOKE')return {kind:'REVOKE',combinationId:value.configId,grantId:value.grantId,body:value.body,unknown:value.unknown}
 const {artifactHash,...body}=value.body
 return {kind:'ISSUE',combinationId:value.configId,body:{...body,combinationHash:artifactHash},unknown:value.unknown}
}
export function isEducationCognitivePending(raw:unknown):raw is EducationCognitivePending{
 if(!raw||typeof raw!=='object')return false
 const v=raw as EducationCognitivePending
 if(!v.body||typeof v.body!=='object'||!names(v,v.kind==='ISSUE'?['kind','configId','profile','body','unknown']:['kind','configId','grantId','body','unknown']))return false
 if(v.kind==='ISSUE'&&(!['experience','standard','research'].includes(v.profile)||'combinationHash'in v.body||!('artifactHash'in v.body)))return false
 return isEducationPending(common(v))
}
export function sameEducationCognitiveOperation(pending:EducationCognitivePending,raw:unknown){
 const value=raw as {kind?:string;grant?:unknown;request?:Record<string,unknown>}|null
 if(!value?.request||value.kind!==pending.kind)return false
 if(pending.kind==='REVOKE')return sameEducationOperation(common(pending),raw as EducationManagerOperation)
 if(value.request.profile!==pending.profile||value.request.artifactHash!==pending.body.artifactHash)return false
 const {artifactHash,profile:_,...body}=value.request
 return sameEducationOperation(common(pending),{...value,request:{...body,combinationHash:artifactHash}} as EducationManagerOperation)
}
