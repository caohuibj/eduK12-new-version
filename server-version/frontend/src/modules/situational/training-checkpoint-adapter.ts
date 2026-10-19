import type { SituationalAttemptResponse, SituationalDraftAnswer } from './types'
import { pruneUnreachableSituationalResponses } from './draft'
/** Research journals and mandatory-video proofs cannot be reconstructed from answers. */
export function situationalCheckpointUnsupported(data: SituationalAttemptResponse): boolean {
  return Boolean((!data.instrument.online && data.instrument.assignment) || data.instrument.definition.scenes.some(scene=>scene.stimulus.type==='VIDEO') || (data.instrument.definition.schemaVersion===2 && data.instrument.definition.flow.nodes.some(node=>node.nodeType==='SCENE' && node.responseStages?.length)))
}
export function situationalCheckpointAnswers(data: SituationalAttemptResponse, input: Record<string, unknown>): Record<string, SituationalDraftAnswer> {
  if(situationalCheckpointUnsupported(data))throw new Error('此情境任务需要本机研究记录或视频观看凭据，不能仅凭答案恢复。')
  const allowed=new Set(data.instrument.definition.scenes.flatMap(scene=>scene.channels.map(channel=>`${scene.sceneKey}:${channel.channelKey}`)))
  const answers:Record<string,SituationalDraftAnswer>={}
  for(const [key,raw]of Object.entries(input)){
    if(!allowed.has(key)||!raw||typeof raw!=='object')throw new Error('服务器情境草稿包含未知题目。')
    const value=raw as Partial<SituationalDraftAnswer>
    if(typeof value.responseValue!=='string'&&!(typeof value.responseValue==='number'&&Number.isFinite(value.responseValue))&&!(Array.isArray(value.responseValue)&&value.responseValue.every(v=>typeof v==='string')))throw new Error('服务器情境草稿答案格式无效。')
    answers[key]={responseValue:value.responseValue,...(['ANSWERED','REFUSED','BLANK'].includes(value.status??'')?{status:value.status}:{}),...(typeof value.responseTimeMs==='number'&&Number.isFinite(value.responseTimeMs)&&value.responseTimeMs>=0?{responseTimeMs:value.responseTimeMs}:{}),...(typeof value.answeredAt==='string'?{answeredAt:value.answeredAt}:{}),...(typeof value.responseRevision==='number'&&Number.isInteger(value.responseRevision)&&value.responseRevision>=0?{responseRevision:value.responseRevision}:{}),...(typeof value.historyIdentity==='string'?{historyIdentity:value.historyIdentity}:{})}
  }
  return pruneUnreachableSituationalResponses(data.instrument.definition,answers).responses
}
