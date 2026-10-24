import api from '../api/client'
import {cognitiveApi} from '../modules/cognitive/api'
export type CatalogType='SCALE'|'COGNITIVE_CONFIG'|'ASSESSMENT_BUNDLE'
export type Resource={id:string;type:CatalogType;name:string;code:string;version:string;status:string;description?:string|null;policy?:'OPEN'|'GRANT';grantable:boolean;note:string}
type Scale={id:string;name:string;code:string;version?:string;instrumentVersion?:string;instrumentClass?:string;libraryEntryId?:string|null;status:string;description?:string|null}
type Bundle={name:string;bundleKey:string;bundleVersion:string;description?:string;status:string;canInstantiate:boolean;publicationBlockers?:string[]}
export async function trainingResourceCatalog(type:CatalogType,active:()=>boolean):Promise<Resource[]>{
 if(type==='SCALE'){
  const rows:Scale[]=[];let page=1,total:number|undefined
  while(active()){
   const response=await api.get<{list:Scale[];total:number}>('/scales',{params:{page,pageSize:100,view:'training-catalog'}})
   if(!active())return []
   if(response.code!==0)throw Error(response.message||'无法读取量表')
   if(!Array.isArray(response.data?.list)||!Number.isInteger(response.data.total)||response.data.total<0)throw Error('量表目录不完整，请重新加载')
   if(total!==undefined&&total!==response.data.total)throw Error('量表目录正在变化，请刷新后重试')
   total=response.data.total;rows.push(...response.data.list)
   if(rows.length>total)throw Error('量表目录计数不一致，请重试')
   if(rows.length>=total)break
   if(!response.data.list.length)throw Error('量表目录读取不完整，请重试')
   page++
  }
  if(new Set(rows.map(row=>row.id)).size!==rows.length)throw Error('量表目录发生重复，请刷新后重试')
  return rows.map(row=>{const governed=Boolean(row.libraryEntryId)||row.instrumentClass==='CUSTOM_DESCRIPTIVE';return {id:row.id,type,name:row.name,code:row.code,version:row.instrumentVersion||row.version||'—',status:row.status,description:row.description,grantable:row.status==='PUBLISHED'&&!governed,note:governed?'精确版本共用库审批':row.status==='PUBLISHED'?'按培训师授权':'发布后方可授权'}})
 }
 if(type==='COGNITIVE_CONFIG'){
  const response=await cognitiveApi.listConfigs()
  if(response.code!==0)throw Error(response.message||'无法读取认知配置')
  return response.data.list.map(row=>({id:row.id,type,name:row.name,code:row.testType,version:row.configVersion,status:'PUBLISHED',description:row.instruction,policy:row.accessPolicy,grantable:row.accessPolicy==='GRANT',note:row.accessPolicy==='GRANT'?'需使用授权':row.accessPolicy==='OPEN'?'开放使用':'访问策略未提供'}))
 }
 const response=await api.get<Bundle[]>('/bundle-products/catalog')
 if(response.code!==0)throw Error(response.message||'无法读取固定测评包')
 return response.data.map(row=>({id:row.bundleKey+'@'+row.bundleVersion,type,name:row.name,code:row.bundleKey,version:row.bundleVersion,status:row.status,description:row.description,grantable:row.status==='PUBLISHED'&&row.canInstantiate,note:row.publicationBlockers?.length?'尚未满足发布条件':row.canInstantiate?'按精确版本授权':'当前不可使用'}))
}
