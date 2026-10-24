import type {AssessmentVideoPresentationV1} from '../modules/assessment-media/types'
import {deferredAssessmentMedia} from '../modules/assessment-media/deferred-media'
import type {SurveyPublicImage} from './builder.types'
import type {SurveyImageProof} from './SurveyParticipantImage'
export type SurveyScaleMedia={images?:SurveyPublicImage[];video?:AssessmentVideoPresentationV1}
export type SurveyCatalogScaleMediaProps={
  item:SurveyScaleMedia;proof:SurveyImageProof;instrumentKey:string;itemKey:string;
  complete?:boolean;onComplete?:()=>void;readOnly?:boolean;onImagesReadyChange?:(ready:boolean)=>void
}
const Media=deferredAssessmentMedia<SurveyCatalogScaleMediaProps>(()=>import('./SurveyCatalogScaleMediaContent').then(module=>module.SurveyCatalogScaleMedia))
/** Text-only questions neither download the player nor create media effects. */
export function SurveyCatalogScaleMedia(props:SurveyCatalogScaleMediaProps){
  return props.item.video||props.item.images?.length?<Media {...props}/>:null
}
