import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "1.0.0",
    "1.0.0"
  ],
  "title": "先想一想，再挪第一步",
  "concept": "把圆盘从当前摆法移到目标摆法，像一次小型路线规划。报告分别看是否解出、用了几步，以及有没有碰到规则限制。",
  "example": "搬书时，目标书被压在下面，可能要先把上面的书临时挪开，再一步步整理好；多挪几次不等于“不会规划”。",
  "tip": "动手前先找出挡住目标的圆盘，想好临时放哪里，再沿目标逐步检查。",
  "boundary": "三柱圆盘是本项目规划变式；熟悉游戏规则会影响结果，首步等待也可能包含读题和操作时间。",
  "counts": [
    4,
    10,
    18
  ],
  "practice": "4关练习，至少完成3关",
  "time": "体验约3–5分钟；研究约15–22分钟，已有估计而非实测。90秒是无操作保护，每次移动会重置，不是整关总时限。",
  "procedure": "三柱、三圆盘，遵守顶盘先移和大盘不得压小盘；4/10/18关难度配额2/2/0、4/4/2、6/6/6。移动上限由最短步数与factor=3确定；90秒无操作保护。最短步解题率分母为全部关卡，额外步数只在已解关卡中平均；首步用时只在有移动的关卡取中位。",
  "comparison": "Shallice（1982）研究非例行任务中的规划；这里的圆盘三柱状态、难度配额、移动上限与无操作保护为自编，不能视为原Tower of London器材、完整协议或临床解释。",
  "source": "Shallice, Specific impairments of planning (1982), DOI 10.1098/rstb.1982.0082: https://pubmed.ncbi.nlm.nih.gov/6125971/",
  "hidden": [
    "firstMoveLatencyMs"
  ]
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

if(revised.reportReading){revised.reportReading.summary={template:'在全部关卡中，这次达到目标的比例为 {solveRate}；其中以最少步数完成的关卡占全部关卡 {minimumMoveSolveRate}。',metricKeys:['solveRate','minimumMoveSolveRate']};revised.reportReading.summaryByProfile={experience:{template:'本次4关体验中，达到目标的比例为 {solveRate}。不以少量关卡推断固定规划能力。',metricKeys:['solveRate']}}}

for(const key of ['medianRtMs','medianCorrectRtMs'])if(revised.metrics[key])revised.metrics[key]={...revised.metrics[key],label:'答对时的典型用时（中位数）'}

if(revised.metrics.validRtCount)revised.metrics.validRtCount={...revised.metrics.validRtCount,label:'可用于用时统计的作答数'}

revised.disclaimer+=' 练习与正式使用同一内部素材池，可能再次遇到相同素材；熟悉效应需一起考虑。'
revised.reportReading!.professional!.procedure+=' 当前练习从同一内部池取4题；研究档覆盖全池，存在练习刺激重现。练习记录不进入正式分母，但熟悉效应仍会影响后续表现。'
