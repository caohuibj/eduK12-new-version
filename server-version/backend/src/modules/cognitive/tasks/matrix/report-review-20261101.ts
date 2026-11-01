import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "1.0.0",
    "1.0.0"
  ],
  "title": "图形之间，藏着什么规律？",
  "concept": "你会比较一个方格里图形怎样变化，再找出缺失的一块。小游戏观察的是这次发现、验证规律的过程。",
  "example": "整理一盒彩色积木时，可能先看颜色交替，再看形状顺序；找到一个线索后，还要用另一行核对。",
  "tip": "先挑一个线索（数量、位置或交替），再到另一行验证，不急着凭第一印象选。",
  "boundary": "本项目自编矩阵；熟悉图案、视觉条件和当时注意状态会影响记录。",
  "counts": [
    6,
    16,
    24
  ],
  "practice": "4题练习，至少3题正确",
  "time": "体验约3–5分钟；研究约12–18分钟，均为已有协议估计，未实测。6题若全部用满30秒约3分钟，另计说明练习。",
  "procedure": "自编四选一矩阵；6/16/24题，三种规则族与三档设计难度，按seed抽取后按难度排序并重排正确选项。每题30秒；超时进入总正确率分母，正确且≥300ms反应入中位用时。",
  "comparison": "Raven（1940）讨论矩阵式规则题；本项目刺激、题数、三规则族和计时均为自编，不能继承Raven常模或标准化效度。",
  "source": "Raven, Matrix Tests (1940): https://pmc.ncbi.nlm.nih.gov/articles/PMC5092702/",
  "hidden": [
    "accuracyByRuleFamily",
    "reachedDifficulty"
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

for(const key of ['medianRtMs','medianCorrectRtMs'])if(revised.metrics[key])revised.metrics[key]={...revised.metrics[key],label:'答对时的典型用时（中位数）'}

if(revised.metrics.validRtCount)revised.metrics.validRtCount={...revised.metrics.validRtCount,label:'可用于用时统计的作答数'}

revised.disclaimer+=' 练习与正式使用同一内部素材池，可能再次遇到相同素材；熟悉效应需一起考虑。'
revised.reportReading!.professional!.procedure+=' 当前练习从同一内部池取4题；研究档覆盖全池，存在练习刺激重现。练习记录不进入正式分母，但熟悉效应仍会影响后续表现。'
