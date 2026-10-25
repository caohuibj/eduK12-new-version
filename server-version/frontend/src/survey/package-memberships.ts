import {useEffect,useState} from 'react'
import {governedResearcherRequest} from '../api/surveyGovernance'
import type {PackageMembership} from './package-arrangement'
/** Immutable membership plus current list hints; never an admission proof. */
export function usePackageMemberships(projectId:string,ids:readonly string[]){
 const key=[...new Set(ids)].sort().join(','),scope=projectId+':'+key
 const [retry,setRetry]=useState(0),[state,setState]=useState<{scope:string;list:PackageMembership[];loading:boolean;error:string}>({scope:'',list:[],loading:false,error:''})
 useEffect(()=>{
  let current=true
  if(!key){setState({scope,list:[],loading:false,error:''});return()=>{current=false}}
  setState({scope,list:[],loading:true,error:''})
  void governedResearcherRequest<{list:PackageMembership[]}>('/'+projectId+'/package-memberships?'+new URLSearchParams({draftIds:key})).then(result=>{if(current)setState({scope,list:result.list,loading:false,error:''})}).catch(e=>{if(current)setState({scope,list:[],loading:false,error:e instanceof Error?e.message:'整包身份读取失败'})})
  return()=>{current=false}
 },[projectId,key,scope,retry])
 const current=!key?{list:[],loading:false,error:''}:state.scope===scope?state:{list:[],loading:true,error:''}
 return {...current,retry:()=>setRetry(v=>v+1)}
}
