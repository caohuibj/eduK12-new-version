import api from '../api/client'
import {catalogQuery,EMPTY_CATALOG_FILTERS,EMPTY_CATALOG_FACETS,type CatalogClassificationTag,type CatalogFilters,type CatalogTagFacets} from '../api/catalogDiscovery'
export type CatalogType='SCALE'|'COGNITIVE_CONFIG'|'ASSESSMENT_BUNDLE'
export type Resource={id:string;type:CatalogType;name:string;code:string;version:string;status:string;description?:string|null;policy?:'OPEN'|'GRANT';grantable:boolean;note:string;classificationTags?:CatalogClassificationTag[]}
type Scale={id:string;name:string;code:string;version?:string;instrumentVersion?:string;instrumentClass?:string;libraryEntryId?:string|null;status:string;description?:string|null;classificationTags?:CatalogClassificationTag[]}
type Bundle={name:string;bundleKey:string;bundleVersion:string;description?:string;status:string;canInstantiate:boolean;publicationBlockers?:string[];classificationTags?:CatalogClassificationTag[]}
type Cognitive={id:string;name:string;testType:string;configVersion:string;instruction?:string|null;status?:string;accessPolicy?:'OPEN'|'GRANT';classificationTags?:CatalogClassificationTag[]}
export type ResourcePage={list:Resource[];page:number;pageSize:number;hasMore:boolean;total?:number;tagFacets:CatalogTagFacets}
type Page<T>={list:T[];page:number;pageSize:number;hasMore:boolean;total?:number;tagFacets?:CatalogTagFacets}
export async function trainingResourceCatalog(type:CatalogType,active:()=>boolean,query:{page:number;filters:CatalogFilters;status:string}={page:1,filters:EMPTY_CATALOG_FILTERS,status:'all'}):Promise<ResourcePage>{
 const params={...Object.fromEntries(new URLSearchParams(catalogQuery(query.page,query.filters))),page:query.page,pageSize:20,view:'training-catalog',...(query.status!=='all'?{status:query.status}:{})}
 const path=type==='SCALE'?'/scales':type==='COGNITIVE_CONFIG'?'/cognitive/configs':'/bundle-products/catalog'
 const response=await api.get<Page<Scale|Cognitive|Bundle>>(path,{params})
 if(response.code!==0)throw Error(response.message||'无法读取资源目录')
 const data=response.data
 if(!data||!Array.isArray(data.list)||data.page!==query.page||data.pageSize!==20||typeof data.hasMore!=='boolean'||data.list.length>20
  ||data.total!==undefined&&(!Number.isInteger(data.total)||data.total<0))throw Error('资源目录读取不完整，请重新加载')
 if(!active())return {...data,list:[],tagFacets:data.tagFacets??EMPTY_CATALOG_FACETS}
 const list:Resource[]=data.list.map(source=>{
  if(type==='SCALE'){
   const row=source as Scale,governed=Boolean(row.libraryEntryId)||row.instrumentClass==='CUSTOM_DESCRIPTIVE'
   return {id:row.id,type,name:row.name,code:row.code,version:row.instrumentVersion||row.version||'—',status:row.status,description:row.description,classificationTags:row.classificationTags,grantable:row.status==='PUBLISHED'&&!governed,note:governed?'精确版本共用库审批':row.status==='PUBLISHED'?'按培训师授权':'发布后方可授权'}
  }
  if(type==='COGNITIVE_CONFIG'){
   const row=source as Cognitive
   return {id:row.id,type,name:row.name,code:row.testType,version:row.configVersion,status:row.status||'PUBLISHED',description:row.instruction,classificationTags:row.classificationTags,policy:row.accessPolicy,grantable:row.accessPolicy==='GRANT',note:row.accessPolicy==='GRANT'?'需使用授权':row.accessPolicy==='OPEN'?'开放使用':'访问策略未提供'}
  }
  const row=source as Bundle
  return {id:row.bundleKey+'@'+row.bundleVersion,type,name:row.name,code:row.bundleKey,version:row.bundleVersion,status:row.status,description:row.description,classificationTags:row.classificationTags,grantable:row.status==='PUBLISHED'&&row.canInstantiate,note:row.publicationBlockers?.length?'尚未满足发布条件':row.canInstantiate?'按精确版本授权':'当前不可使用'}
 })
 return {...data,list,tagFacets:data.tagFacets??EMPTY_CATALOG_FACETS}
}
