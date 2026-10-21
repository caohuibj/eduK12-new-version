import { hasPendingTrainingContentSelection } from '../pages/questionnaire/trainingContentRecovery'

/** Moving the controls must not remove recovery protection after a reload. */
export function hasPendingTrainingToolRequest(actorId:string,compositeId:string):boolean {
  if(hasPendingTrainingContentSelection(actorId,compositeId))return true
  try {
    for(let index=0;index<sessionStorage.length;index++){
      const key=sessionStorage.key(index)
      if(!key?.startsWith('training-report-create:'))continue
      try {
        const scope=JSON.parse(key.slice('training-report-create:'.length))
        if(scope?.actorId!==actorId||scope?.compositeId!==compositeId)continue
        const saved=JSON.parse(sessionStorage.getItem(key)||'null')
        if(saved?.scope===key&&saved.request?.requestId&&saved.request?.payload)return true
      }catch { continue }
    }
  }catch { /* Match the existing recovery reader for invalid local records. */ }
  return false
}
