import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "1.1.0",
    "1.1.0"
  ],
  "title": "这个数量，大概落在哪个范围？",
  "concept": "不用精确背数字，先用生活中熟悉的物体和时间作参照，再选一个合理的数量级。报告只描述本次选中项目预设范围的比例。",
  "example": "估计一瓶水的容量，可以先想想日常水杯与饮料瓶；先排除明显大得或小得不合理的范围。",
  "tip": "先找一个熟悉的参照，再核对单位；估算不是精确计算，经验不同也会影响选择。",
  "boundary": "这是自编四选一数量级变式，不是临床CET；地域、文化、生活经验和一般知识都会影响选择。",
  "counts": [
    18,
    30,
    36
  ],
  "practice": "1道独立练习，答对后开始；不计正式分数",
  "time": "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
  "procedure": "项目自编中文四选一，36道正式题与1道独立练习；seed确定不重复18/30/36题，每题15秒、起始注视400ms，后续另有约200ms间隔。正式正确率以全部已呈现完整题序列为分母（超时进入分母）；错误与未答分开，合格正确反应统计用时，null不补0。",
  "comparison": "Shallice与Evans（1978）研究要求对没有现成求解策略的问题给出合理估计；本项目是有提示范围的四选一、自编数量级材料与15秒限时，不是原文自由回答CET，也没有临床异常容许范围。",
  "source": "Shallice & Evans, The involvement of the frontal lobes in cognitive estimation (1978), DOI 10.1016/S0010-9452(78)80055-0: https://pubmed.ncbi.nlm.nih.gov/679710/",
  "hidden": []
}
const prior=historicalPresentations.find(p=>p.engineVersion===copy.c[0]&&p.scoringVersion===copy.c[1])!
const revised:CognitiveParticipantPresentationV1=structuredClone(prior)
const parts=prior.presentationVersion.split('.').map(Number)
const revision=`${parts[0]}.${parts[1]+1}.0`
revised.presentationVersion=revision
revised.disclaimer=copy.boundary+' 只描述本次记录，不换算IQ、同龄排名或诊断。'
revised.practicalTips=[copy.tip,'把本次记录与当时环境、完成情况一起阅读；再次体验会有熟悉效应。']
if(revised.reportReading){
 const reading=revised.reportReading
 reading.version=revision;reading.title=copy.title;reading.introduction=copy.concept
 reading.nextStep=copy.tip
 reading.summaryByProfile={...reading.summaryByProfile,experience:{template:'这次简短体验中，答对比例是 {accuracy}。题目较少，只描述这一次选择，不推断稳定能力。',metricKeys:['accuracy']}}
 reading.hiddenByProfile={...reading.hiddenByProfile,experience:[...new Set([...(reading.hiddenByProfile?.experience??[]),...copy.hidden])]}
 reading.popular={...reading.popular!,conceptTitle:'这个小游戏在观察什么',concept:copy.concept,exampleTitle:'生活里，也会用到这样的思路',example:copy.example,takeaway:copy.tip,boundary:copy.boundary,
  frames:[{title:'看清任务',text:'先看清本题给出的信息和需要完成的目标。'},{title:'核对线索',text:'把一个可能的办法与完整条件逐一核对。'},{title:'留下记录',text:'按本任务规则作答；报告回看这一次的选择与过程。'}]}
 reading.professional={...reading.professional!,procedure:copy.procedure+' '+copy.source,interpretation:copy.comparison,confounders:[copy.boundary,copy.time,'模式名称不代表已完成心理测量验证；次数增加不自动保证可靠性。']}
 revised.protocols={...revised.protocols}
 for(const [index,profile] of (['experience','standard','research'] as const).entries()){
  revised.protocols[profile]={tier:'PILOT',profileLabel:profile==='experience'?'体验版':profile==='research'?'研究变式':'标准任务',participantConclusion:profile==='research'?copy.comparison:'回看这次完成的'+copy.counts[index]+'题；只描述本次表现。',reportCaveats:[copy.time,copy.boundary,'常规时长为估计而非实测；未以本项目数据证明测量可靠性。'],showProductIndex:false}
 }
}
export {historicalPresentations}
export const reportRevision = revised
export const participantPresentations = historicalPresentations.map(p=>p===prior?revised:p)

if(revised.reportReading){revised.reportReading.summary={template:'本次选中项目预设合理量级的比例为 {accuracy}；超时未答 {timeoutCount} 题。',metricKeys:['accuracy','timeoutCount']};revised.reportReading.summaryByProfile={experience:{template:'本次18题中，选中预设合理量级的比例为 {accuracy}。这不是临床合理性阈值。',metricKeys:['accuracy']}}}
revised.metrics.accuracy={...revised.metrics.accuracy,label:'选中预设合理量级的比例'}

for(const key of ['medianRtMs','medianCorrectRtMs'])if(revised.metrics[key])revised.metrics[key]={...revised.metrics[key],label:'答对时的典型用时（中位数）'}

if(revised.metrics.validRtCount)revised.metrics.validRtCount={...revised.metrics.validRtCount,label:'可用于用时统计的作答数'}

// These two reviewed drafts did not previously declare method-note fields.
revised.reportReading!.professional!.construct='项目自编数量级估算'
revised.reportReading!.professional!.configFields=[{key:'totalTrials',label:'正式题数'},{key:'stimulusSetVersion',label:'冻结题池'},{key:'timeoutMs',label:'每题时限（毫秒）'}]
revised.reportReading!.professional!.metricNotes={accuracy:{definition:'本次答对题数除以完整的正式题序列题数，超时进入分母。',readingHint:'只读本次表现，不作为常模或稳定能力。'},medianRtMs:{definition:'符合本协议有效条件的正确用时中位数。',readingHint:'没有合格记录时保留缺失，不以零替代。'}}
revised.reportReading!.popular!.scene='rules'
revised.reportReading!.popular!.metricHelp={accuracy:{label:'选中预设合理量级的比例',explanation:'描述本次选择，不是人群百分位。'},medianRtMs:{label:'答对时的典型用时',explanation:'中位数指合格用时排序后居中的值；缺失不补零。'}}
