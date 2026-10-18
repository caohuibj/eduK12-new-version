import type { SjtDraftV2 } from './builder.types'
import { SurveyImageField } from './SurveyImageField'
import { SjtTextEditor } from '../modules/assessment-core/sjt/SjtTextEditor'

/** Survey owns image access and upload; the controlled editor has no product API. */
export function ResearchSjtV2Editor({value,onChange,projectId}:{value:SjtDraftV2;
  onChange:(next:SjtDraftV2)=>void;projectId:string}) {
  return <SjtTextEditor value={value} onChange={onChange}
    renderSceneMedia={(scene,changeImage)=><SurveyImageField projectId={projectId} image={scene.image} onChange={changeImage}/>} />
}
