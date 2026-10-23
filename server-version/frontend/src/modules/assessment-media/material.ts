export type AssessmentMaterial={
  asset:{assetId:string;contentHash:string;mimeType:'image/png'|'image/jpeg'|'image/webp'|'video/mp4'|'video/webm'|'application/pdf'};
  name:string;caption?:string;rightsStatus:'unknown'|'self_authored'|'authorized';rightsNote:string;
}
export type PublicMaterial=Pick<AssessmentMaterial,'asset'|'name'|'caption'>
