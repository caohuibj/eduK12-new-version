import type { AnySjtDraft, SjtDraftV2 } from './builder.definition'
import type { SurveySjtQuestion } from './sjt-selection'

export type SurveySjtScene = Omit<SjtDraftV2['scenes'][number], 'questions'> & {questions:SurveySjtQuestion[]}
/** Presentation order is authored array order; legacy data is never rewritten. */
export function surveySjtScenes(definition:AnySjtDraft):SurveySjtScene[] {
  if(definition.schemaVersion===2)return definition.scenes
  return [{sceneKey:definition.scenarioKey,title:definition.title,stimulus:definition.stimulus,
    ...(definition.image?{image:definition.image}:{}),questions:definition.questions}]
}
export const surveySjtQuestionEntries=(definition:AnySjtDraft)=>surveySjtScenes(definition)
  .flatMap((scene,sceneIndex)=>scene.questions.map((question,questionIndex)=>({
    scene,question,sceneIndex,questionIndex,motherSceneKey:scene.sceneKey,
  })))
export const surveySjtQuestions=(definition:AnySjtDraft)=>surveySjtQuestionEntries(definition).map(x=>x.question)
