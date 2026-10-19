import type { AnySjtDraft, SjtDraftV2 } from './definition'
import type { SjtQuestion } from './selection'

export type SjtScene = Omit<SjtDraftV2['scenes'][number], 'questions'> & {questions:SjtQuestion[]}
/** Presentation order is authored array order; legacy data is never rewritten. */
export function sjtScenes(definition:AnySjtDraft):SjtScene[] {
  if(definition.schemaVersion===2)return definition.scenes
  return [{sceneKey:definition.scenarioKey,title:definition.title,stimulus:definition.stimulus,
    ...(definition.image?{image:definition.image}:{}),questions:definition.questions}]
}
export const sjtQuestionEntries=(definition:AnySjtDraft)=>sjtScenes(definition)
  .flatMap((scene,sceneIndex)=>scene.questions.map((question,questionIndex)=>({
    scene,question,sceneIndex,questionIndex,motherSceneKey:scene.sceneKey,
  })))
export const sjtQuestions=(definition:AnySjtDraft)=>sjtQuestionEntries(definition).map(x=>x.question)
