import {AssessmentImageField,type ImageAuthoringAdapter} from '../../modules/assessment-media/AssessmentImageField'
import type {AssessmentImage} from '../../modules/assessment-media/types'
export function EducationQuestionImageField({adapter,image,onChange,onBusy,disabled}:{adapter:ImageAuthoringAdapter;image?:AssessmentImage;onChange:(image:AssessmentImage|undefined)=>void;onBusy:(busy:boolean)=>void;disabled:boolean}){
 return <div>
  <AssessmentImageField adapter={adapter} images={image?[{...image,order:0}]:[]} disabled={disabled} onBusy={onBusy} maxImages={1} allowCaption legend="题目图片（可选）" uploadLabel="上传题目图片" description="仅上传有权使用的静态图片。图片仅供当前工具作者使用，不会自动公开。" onChange={images=>{
   const next=images[0]
   if(!next){onChange(undefined);return}
   const same=image?.asset.assetId===next.asset.assetId&&image.asset.contentHash===next.asset.contentHash
   onChange({asset:next.asset,altText:next.altText,...(next.caption?{caption:next.caption}:{}),rightsStatus:same?image.rightsStatus:'unknown',rightsNote:same?image.rightsNote:''})
  }}/>
  {image&&<>
   <label>图片版权状态<select disabled={disabled} value={image.rightsStatus} onChange={event=>onChange({...image,rightsStatus:event.target.value as AssessmentImage['rightsStatus']})}><option value="unknown">尚未核实（不可固定版本）</option><option value="self_authored">本人原创</option><option value="authorized">已获得使用授权</option></select></label>
   <label>版权或授权说明（必填）<textarea disabled={disabled} maxLength={2000} value={image.rightsNote} onChange={event=>onChange({...image,rightsNote:event.target.value})}/></label>
  </>}
 </div>
}
