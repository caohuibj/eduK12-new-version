import {useCallback} from 'react'
import apiClient,{sessionFetch} from '../../api/client'
import {AssessmentMaterialPicker,type MaterialLibraryProvider} from './AssessmentMaterialPicker'
import {AssessmentMaterialDisplay} from './AssessmentMaterialDisplay'
import type {AssessmentMaterial,PublicMaterial} from './material'
const provider:MaterialLibraryProvider={appearance:'training',manageHref:kind=>kind==='video'?'/videos':kind==='document'?'/documents':'/images',loadContent:(asset,signal)=>sessionFetch('/api/training-workspace/media/'+encodeURIComponent(asset.assetId)+'/content',{signal,cache:'no-store'}),note:'可复用本人上传及独立授权的素材；工具附带的附件仍按原工具版本使用。图片不超过 2 MiB、视频不超过 50 MiB、PDF 不超过 20 MiB。',load:async({kind,page})=>{
  const result=await apiClient.get('/training-workspace/media',{params:{kind,page,pageSize:9,usage:'assessment'}})
  if(result.code!==0||!result.data)throw new Error(result.message||'素材库加载失败')
  return result.data
}}
export function TrainingMaterialPicker(props:{value?:AssessmentMaterial[];onChange:(items:AssessmentMaterial[])=>void;label?:string;disabled?:boolean}){
  return <AssessmentMaterialPicker {...props} provider={provider}/>
}
export function TrainingMaterialPreview({item}:{item:PublicMaterial}){
  const load=useCallback((asset:PublicMaterial['asset'],signal:AbortSignal)=>sessionFetch('/api/training-workspace/media/'+encodeURIComponent(asset.assetId)+'/content',{signal,cache:'no-store'}),[])
  return <AssessmentMaterialDisplay item={item} load={load} appearance="training"/>
}
export { TrainingMaterials } from './TrainingMaterials'
