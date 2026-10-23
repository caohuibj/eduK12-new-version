import {useCallback} from 'react'
import {AssessmentMaterialDisplay} from './AssessmentMaterialDisplay'
import type {PublicMaterial} from './material'

export function TrainingMaterials({items,loadAsset}:{items?:PublicMaterial[];loadAsset:(assetId:string)=>Promise<Blob>}){
  const load=useCallback(async(asset:PublicMaterial['asset'])=>new Response(await loadAsset(asset.assetId)),[loadAsset])
  return <>{items?.map(item=><AssessmentMaterialDisplay key={item.asset.assetId} item={item} load={load} appearance="training"/>)}</>
}
