/** Versioned disclosure frozen with cognitive publications and shown beside
 * researcher consent before admission. It is not an ethics/guardian approval. */
export const SURVEY_COGNITIVE_NOTICE={
  version:'SURVEY_COGNITIVE_NOTICE_V1' as const,
  text:'本研究包含桌面键盘 Go/No-Go 行为任务（研究试点），记录按键反应、相对反应时及必要的设备输入和计时质量信息。任务中断后最多允许整项重做一次，不拼接中断前后的试次。进入任务后，影响流程的此前回答将被锁定。任务完成不等于整轮研究已提交；请继续完成整轮提交。未完成整轮的任务记录保留期限为 30 天，届时进入按研究说明处理的保留审查，不自动删除不可变记录。结果不作诊断、常模排名或个体能力分级。个体描述性反馈仅在研究启用并达到约定开放时间后提供；撤回及数据使用按本研究说明执行。',
}
export function disclosedSurveyConsent(text:string,snapshot:unknown):string{
  const notice=(snapshot as {measurementNotice?:{version?:string;text?:string}}|null)?.measurementNotice
  return (notice?.version===SURVEY_COGNITIVE_NOTICE.version||hasSurveyStagedSituationalNotice(notice)||hasSurveyLinearSituationalNotice(notice))&&typeof notice?.text==='string'
    ?text+'\n\n'+notice.text:text
}

/** Applies only to tools that actually require the shared staged SJT protocol.
 * No device telemetry, diagnostic claim or retention duration is invented. */
export const SURVEY_STAGED_SJT_NOTICE={
  version:'SURVEY_STAGED_SJT_NOTICE_V1' as const,
  text:'本研究包含分阶段情境选择任务（研究试点），保存您的情境选择和补充回答，并记录验证作答流程所需的节点进入、阶段确认、回答修改及相对时序。阶段记录用于核对实际呈现和完成路径，不用于未经验证的个体能力诊断。任务答案成功保存后仍需完成整轮研究提交；个体反馈仅按研究已公布的反馈范围和开放时间提供。撤回、数据使用及保留按本研究说明执行。',
}
/** V1 has answer-level timing, but no staged researchCapture journal. */
export const SURVEY_LINEAR_SJT_NOTICE={
  version:'SURVEY_LINEAR_SJT_NOTICE_V1' as const,
  text:'本研究包含固定顺序的情境选择任务（研究试点），保存您的选择，以及共享作答工具随答案记录的作答时间和相对用时；不记录分阶段确认事件。任务答案成功保存后仍需完成整轮研究提交；结果不作未经验证的个体能力诊断，个体反馈仅按研究已公布的范围和开放时间提供。撤回、数据使用及保留按本研究说明执行。',
}
type SurveyTaskNoticeKind='COGNITIVE'|'STAGED_SJT'|'LINEAR_SJT'
export type SurveyMeasurementNotice=typeof SURVEY_COGNITIVE_NOTICE|typeof SURVEY_STAGED_SJT_NOTICE|{
  version:'SURVEY_COMBINED_TASK_NOTICE_V1';text:string;includes:['COGNITIVE','STAGED_SJT']
}|typeof SURVEY_LINEAR_SJT_NOTICE|{version:'SURVEY_COMBINED_TASK_NOTICE_V2';text:string;includes:SurveyTaskNoticeKind[]}
export function freezeSurveyMeasurementNotice(input:{cognitive:boolean;stagedSituational:boolean;linearSituational?:boolean}):SurveyMeasurementNotice|undefined{
  if(input.linearSituational){
    if(!input.cognitive&&!input.stagedSituational)return SURVEY_LINEAR_SJT_NOTICE
    const selected:Array<[SurveyTaskNoticeKind,{text:string}]>=[
      ...(input.cognitive?[['COGNITIVE',SURVEY_COGNITIVE_NOTICE] as [SurveyTaskNoticeKind,{text:string}]]:[]),
      ...(input.stagedSituational?[['STAGED_SJT',SURVEY_STAGED_SJT_NOTICE] as [SurveyTaskNoticeKind,{text:string}]]:[]),
      ['LINEAR_SJT',SURVEY_LINEAR_SJT_NOTICE],
    ]
    return {version:'SURVEY_COMBINED_TASK_NOTICE_V2',includes:selected.map(([kind])=>kind),text:selected.map(([,notice])=>notice.text).join('\n\n')}
  }
  // Preserve the exact bytes and versions of previously qualified publications.
  if(input.cognitive&&input.stagedSituational)return {version:'SURVEY_COMBINED_TASK_NOTICE_V1',
    includes:['COGNITIVE','STAGED_SJT'],text:SURVEY_COGNITIVE_NOTICE.text+'\n\n'+SURVEY_STAGED_SJT_NOTICE.text}
  return input.cognitive?SURVEY_COGNITIVE_NOTICE:input.stagedSituational?SURVEY_STAGED_SJT_NOTICE:undefined
}
export function hasSurveyStagedSituationalNotice(notice:unknown):boolean{
  const value=notice as SurveyMeasurementNotice|undefined
  return validCombinedV2(value)&&value!.includes.includes('STAGED_SJT')
    ||value?.version===SURVEY_STAGED_SJT_NOTICE.version&&value.text===SURVEY_STAGED_SJT_NOTICE.text
    ||value?.version==='SURVEY_COMBINED_TASK_NOTICE_V1'&&value.text===SURVEY_COGNITIVE_NOTICE.text+'\n\n'+SURVEY_STAGED_SJT_NOTICE.text
      &&JSON.stringify(value.includes)===JSON.stringify(['COGNITIVE','STAGED_SJT'])
}

function validCombinedV2(value:unknown):value is Extract<SurveyMeasurementNotice,{version:'SURVEY_COMBINED_TASK_NOTICE_V2'}>{
  const notice=value as Extract<SurveyMeasurementNotice,{version:'SURVEY_COMBINED_TASK_NOTICE_V2'}>|undefined
  if(notice?.version!=='SURVEY_COMBINED_TASK_NOTICE_V2'||!Array.isArray(notice.includes)||!notice.includes.includes('LINEAR_SJT'))return false
  const expected=freezeSurveyMeasurementNotice({cognitive:notice.includes.includes('COGNITIVE'),
    stagedSituational:notice.includes.includes('STAGED_SJT'),linearSituational:true})
  return expected?.version==='SURVEY_COMBINED_TASK_NOTICE_V2'&&notice.text===expected.text
    &&JSON.stringify(notice.includes)===JSON.stringify(expected.includes)
}
export function hasSurveyLinearSituationalNotice(notice:unknown):boolean{
  const value=notice as SurveyMeasurementNotice|undefined
  return value?.version===SURVEY_LINEAR_SJT_NOTICE.version&&value.text===SURVEY_LINEAR_SJT_NOTICE.text||validCombinedV2(value)
}
