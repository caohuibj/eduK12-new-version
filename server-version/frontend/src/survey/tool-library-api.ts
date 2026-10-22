export class ToolLibraryError extends Error{
  constructor(message:string,readonly issues:{path?:string;line?:number;message:string}[]=[]){super(message)}
}
export async function toolLibraryApi<T>(path:string,method='GET',body?:unknown):Promise<T>{
  const headers:Record<string,string>={'Content-Type':'application/json'}
  if(method!=='GET'){
    const response=await fetch('/api/survey/auth/csrf',{credentials:'same-origin'})
    const result=await response.json()
    if(!response.ok||result.code!==0||!result.data?.csrfToken)throw new Error('研究者安全会话不可用，请重新登录')
    headers['X-CSRF-Token']=result.data.csrfToken
  }
  const response=await fetch('/api/survey'+path,{method,credentials:'same-origin',headers,...(body===undefined?{}:{body:JSON.stringify(body)})})
  const result=await response.json()
  if(!response.ok||result.code!==0)throw new ToolLibraryError(result.message||'操作失败',result.data?.issues??[])
  return result.data as T
}
export type ToolSource='owned'|'granted'
export type ToolRef={source:ToolSource;id:string;revision?:number;title?:string}
export type LibraryTool={id:string;title:string;kind:'FORM'|'SCALE'|'COMPOSITION';revision:number;status:string;readiness?:'DRAFT'|'READY';completedRevision?:number|null;definition:any;updatedAt:string}
export const libraryKindLabel={FORM:'表单',SCALE:'量表',COMPOSITION:'普通组合问卷',SJT:'情境判断',COGNITIVE:'认知测验'}
export const surveyAssetBase=(id:string)=>id.startsWith('tool:')?'/api/survey/tool-media/'+encodeURIComponent(id.slice(5))+'/assets':'/api/survey/projects/'+encodeURIComponent(id)+'/assets'
