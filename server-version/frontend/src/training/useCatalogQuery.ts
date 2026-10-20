import { useSearchParams } from 'react-router-dom'
import type { CatalogSelection } from './TrainingCatalogControls'

export function useCatalogQuery(prefix='') {
 const [query,setQuery]=useSearchParams()
 const k=(key:string)=>prefix+key
 const page=Math.min(500,Math.max(1,Number(query.get(k('page')))||1)),pageSize=[10,20,50].includes(Number(query.get(k('pageSize'))))?Number(query.get(k('pageSize'))):20
 const selection:CatalogSelection={search:query.get(k('search'))||'',tags:query.get(k('tags'))||'',from:query.get(k('from'))||'',to:query.get(k('to'))||'',dateField:query.get(k('dateField'))||'created',page,pageSize}
 const apply=(value:CatalogSelection)=>setQuery(previous=>{const next=new URLSearchParams(previous);for(const [key,v]of Object.entries(value)){if(v)next.set(k(key),String(v));else next.delete(k(key))}return next})
 const params=new URLSearchParams({page:String(page),pageSize:String(pageSize),search:selection.search,tags:selection.tags,dateField:selection.dateField})
 // Interpret date controls in the browser's timezone; upper bound is exclusive.
 for(const key of ['from','to'] as const)if(selection[key]){const date=new Date(selection[key]+'T00:00:00');if(key==='to')date.setDate(date.getDate()+1);if(Number.isFinite(date.getTime()))params.set(key,date.toISOString())}
 return {selection,apply,params:params.toString(),stateKey:JSON.stringify(selection)}
}
