import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "2.0.0",
    "2.0.0"
  ],
  "title": "把一段话，理成一道算式",
  "concept": "先找出已知条件和所求，再选择能描述它们的数量关系。回看答对比例和用时，可以了解这一次解题过程。",
  "example": "比较两种包装的单价时，先把数量与价格对应好，再检查单位是否一致。",
  "tip": "先圈出数量和单位，再列式；算完用估算检查答案是否合理。",
  "boundary": "阅读、计算熟练度和对生活情境的熟悉程度都会影响本次记录。",
  "counts": [
    18,
    30,
    36
  ],
  "practice": "1道独立练习，答对后开始；不计正式分数",
  "time": "题量18/30/36；15秒时限+约0.6秒间隔的正式上界4.7/7.8/9.4分钟，另计自行读说明与练习。常规完成随读题速度变化，无本项目实测时长或信度。",
  "procedure": "项目自编中文四选一，36道正式题与1道独立练习；seed确定不重复18/30/36题，每题15秒、起始注视400ms，后续另有约200ms间隔。正式正确率以全部已呈现完整题序列为分母（超时进入分母）；错误与未答分开，合格正确反应统计用时，null不补0。",
  "comparison": "没有标准原版可逐时序复刻。研究档仅增加本项目同一题池的观察量；未建立难度等值、可靠性或常模，不借其他标准工具的名字背书。",
  "source": "本项目固定来源及协议：wordproblem/bank与对应scorer；见本轮打卡表精确commit链接。",
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

for(const key of ['medianRtMs','medianCorrectRtMs'])if(revised.metrics[key])revised.metrics[key]={...revised.metrics[key],label:'答对时的典型用时（中位数）'}

if(revised.metrics.validRtCount)revised.metrics.validRtCount={...revised.metrics.validRtCount,label:'可用于用时统计的作答数'}
