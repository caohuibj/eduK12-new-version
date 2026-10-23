export type AssessmentMaterial={
  asset:{assetId:string;contentHash:string;mimeType:'image/png'|'image/jpeg'|'image/webp'|'video/mp4'|'video/webm'|'application/pdf'};
  name:string;caption?:string;rightsStatus:'unknown'|'self_authored'|'authorized';rightsNote:string;
}
export type PublicMaterial=Pick<AssessmentMaterial,'asset'|'name'|'caption'>

/** Match the server's trimmed authoring metadata when confirming a saved definition. */
export const normalizedMaterialList=(items:AssessmentMaterial[]|undefined)=>items?.map(item=>({
  asset:{assetId:item.asset.assetId,contentHash:item.asset.contentHash,mimeType:item.asset.mimeType},
  name:item.name.trim(),...(item.caption===undefined?{}:{caption:item.caption.trim()}),rightsStatus:item.rightsStatus,rightsNote:item.rightsNote.trim(),
}))
