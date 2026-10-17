/** Versioned disclosure frozen with cognitive publications and shown beside
 * researcher consent before admission. It is not an ethics/guardian approval. */
export const SURVEY_COGNITIVE_NOTICE={
  version:'SURVEY_COGNITIVE_NOTICE_V1' as const,
  text:'本研究包含桌面键盘 Go/No-Go 行为任务（研究试点），记录按键反应、相对反应时及必要的设备输入和计时质量信息。任务中断后最多允许整项重做一次，不拼接中断前后的试次。进入任务后，影响流程的此前回答将被锁定。任务完成不等于整轮研究已提交；请继续完成整轮提交。未完成整轮的任务记录保留期限为 30 天，届时进入按研究说明处理的保留审查，不自动删除不可变记录。结果不作诊断、常模排名或个体能力分级。个体描述性反馈仅在研究启用并达到约定开放时间后提供；撤回及数据使用按本研究说明执行。',
}
export function disclosedSurveyConsent(text:string,snapshot:unknown):string{
  const notice=(snapshot as {measurementNotice?:{version?:string;text?:string}}|null)?.measurementNotice
  return notice?.version===SURVEY_COGNITIVE_NOTICE.version&&typeof notice.text==='string'
    ?text+'\n\n'+notice.text:text
}
