/** Browser-local and encrypted server checkpoints are independent drafts.
 * An observed newer server revision is NOT permission to silently overwrite it.
 * The caller must explicitly confirm replacing remote contents when keepLocal is selected.
 */
export const sameSurveyCheckpointAnswers=(left:unknown,right:unknown):boolean=>{
  const normalized=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(normalized)
    if(value!==null&&typeof value==='object')
      return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
        .map(([key,v])=>[key,normalized(v)]))
    return value
  }
  return JSON.stringify(normalized(left))===JSON.stringify(normalized(right))
}
export function resolveSurveyCheckpointDraft<T extends Record<string,unknown>>(
  local:T|null,
  remote:{revision:number;checkpoint:{answers:T}|null},
  useRemote:boolean,
):{answers:T;revision:number;requiresOverwriteConfirmation:boolean;conflict:boolean}{
  const remoteAnswers=remote.checkpoint?.answers??null
  const conflict=local!==null&&remoteAnswers!==null&&
    !sameSurveyCheckpointAnswers(local,remoteAnswers)
  return {
    answers:(remoteAnswers&&(local===null||conflict&&useRemote)?remoteAnswers:local)??{} as T,
    revision:remote.revision,
    requiresOverwriteConfirmation:conflict&&!useRemote,
    conflict,
  }
}
