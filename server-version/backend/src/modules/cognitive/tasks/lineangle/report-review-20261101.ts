import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "2.0.0",
    "2.0.0"
  ],
  "title": "哪条线，朝着同一个方向？",
  "concept": "先看目标线朝哪边倾斜，再从选项中找出平行的一条。线没有箭头，反向但平行仍算相同方向。",
  "example": "给墙上挂画时，可以对照画框边缘与门框是否平行；这里也要看方向，而不只看端点位置。",
  "tip": "先判断向哪边倾斜，再细看夹角；不要把线段朝向反转误当成新方向。",
  "boundary": "自编无向线段匹配任务；屏幕大小、视力和操作方式会影响本次记录。",
  "counts": [
    12,
    30,
    60
  ],
  "practice": "2题练习需全对，最多2轮；练习不入分",
  "time": "体验目录估计3–4分钟；研究8–12分钟，非实测。正式按8秒时限+0.5秒注视估算，12/60题最多约1.7/8.5分钟，另计说明练习。",
  "procedure": "12/30/60道四选一无向线段匹配，固定seed序列；500ms注视、每题8秒上限。0度与180度等价；所有正式题进入正确率分母，正确有效RT入中位用时。V2不与旧有向角度版本直接比较。",
  "comparison": "Benton等（1978）原文评估线条方向辨别；本项目为单目标四选一、无向轴角规则与电脑计时变式，题面、反应方式和计分均不能冒称Benton标准JLO。原文摘要未给出可复刻的完整逐题时序，不补造。",
  "source": "Benton, Varney & Hamsher, Visuospatial judgment: A clinical test (1978), DOI 10.1001/archneur.1978.00500300038006: https://pubmed.ncbi.nlm.nih.gov/655909/",
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
