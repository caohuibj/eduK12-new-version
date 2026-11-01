import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "1.1.0",
    "1.1.0"
  ],
  "title": "把藏在线条里的轮廓找出来",
  "concept": "先看目标轮廓，再从七个有背景线的图块里找到它。要把完整轮廓与相交、延伸的线区分开，不只数顶点。",
  "example": "看一张复杂地图时，先记住一小段路线的转角，再去找完整走向；局部像还不够，要连起来核对。",
  "tip": "先找一个辨识度高的角，再沿三条边核对完整轮廓；目标不会旋转或变大小。",
  "boundary": "这是自编七选择图块匹配，带短时记忆与操作负荷；不能据此给人贴“场独立／场依存”的标签。",
  "counts": [
    6,
    10,
    16
  ],
  "practice": "1道独立练习，教学高亮；练习不入分",
  "time": "体验约2–3分钟；研究约5–7分钟，非实测。目标呈现3秒后作答最多15秒，6/16题正式上界约1.8/4.8分钟，另计说明练习。",
  "procedure": "6/10/16题，先呈现目标3秒，再在七个图块中首次点击选择；目标只平移，不旋转缩放，背景线可交叉或延伸。响应15秒，超时为null；正式题入准确率分母，合格正确用时单独统计。",
  "comparison": "GEFT原文研究要求在复杂图中找到并描画目标；Day等（1990）原文描述7练习+两段各9题。这里是屏幕先看目标、七选一、逐题时限与自编线条，无手绘描线；不是GEFT/EFT原版，不能继承其常模或人格式标签。",
  "source": "Day, McRae & Young, The Group Embedded Figures Test: A Factor Analytic Study (1990), DOI 10.2466/pms.1990.70.3.835: https://www.researchgate.net/publication/269904913_The_Group_Embedded_Figures_Test_A_Factor_Analytic_Study",
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
