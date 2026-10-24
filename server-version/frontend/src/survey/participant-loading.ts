/** Code preparation only: never admits participants, creates sessions or fetches answers. */
let cognitiveUnit:Promise<typeof import('./SurveyCognitiveUnit')>|undefined
let personalLink:Promise<typeof import('./SurveyPersonalLink')>|undefined
let cognitivePreparation:Promise<void>|undefined
export const loadSurveyCognitiveUnit=()=>cognitiveUnit??=import('./SurveyCognitiveUnit').catch(error=>{cognitiveUnit=undefined;throw error})
export const loadSurveyPersonalLink=()=>personalLink??=import('./SurveyPersonalLink').catch(error=>{personalLink=undefined;throw error})
export const prepareSurveyCognitive=()=>cognitivePreparation??=Promise.all([
  loadSurveyCognitiveUnit(),
  import('../modules/cognitive/tasks/gonogo/gonogo.registry').then(module=>module.gonogoRegistryEntry.prepareRunner?.()),
]).then(()=>undefined).catch(error=>{cognitivePreparation=undefined;throw error})

/** Give the visible page and its authenticated reads priority. Cancellation is local to this mount. */
export function scheduleParticipantIdle(work:()=>void):()=>void{
  if(typeof window.requestIdleCallback==='function'){
    const id=window.requestIdleCallback(()=>work(),{timeout:1000})
    return()=>window.cancelIdleCallback(id)
  }
  const id=window.setTimeout(work,250)
  return()=>window.clearTimeout(id)
}
