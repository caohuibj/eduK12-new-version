import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "2.1.0",
    "1.1.0"
  ],
  "title": "七题范围的小小规律探索",
  "concept": "观察方格里形状怎样改变，再找出缺的一块。这是一组范围很小的项目矩阵试题，回看的是你对这些题的判断。",
  "example": "整理图案贴纸时，先找一行中的变化，再用另一列检查规律；一个解释要能同时说通多个位置。",
  "tip": "把形状、方向、填充分别看，再验证它们怎样一起变化。重复体验会熟悉题目，不能把记住答案当作稳定进步。",
  "boundary": "本项目采用matRiks生成素材的七题审订范围，不是完整ICAR或Raven；没有IQ换算、常模或等值版本。",
  "counts": [
    4,
    6,
    7
  ],
  "practice": "独立示范练习1题，不进入七题正式池",
  "time": "体验约2–3分钟；研究约4–6分钟，非实测。每题30秒+0.4秒注视，4/7题正式上界约2.0/3.6分钟，另计说明练习。",
  "procedure": "C2.1.0/S1.1.0，七道审订3×3素材，4/6/7题；按seed选题并重排六个选项，约束题009必出，题内规则标签可重叠。400ms注视、30秒响应；全部正式题入准确率分母，已答/答对/未答分别记数，合法0与缺失分开。",
  "comparison": "matRiks作者官方实现可生成2×2或3×3规则矩阵及10个干扰项；本项目保留审订七题和五个干扰项，并固定009参与。ICAR项目官方也不授权以分数推个人IQ；本素材的直接来源是MIT许可matRiks生成器，不声称使用ICAR标准题或继承其测量属性。",
  "source": "Brancaccio等 matRiks 0.1.5，官方DOI 10.32614/CRAN.package.matRiks: https://cran.r-project.org/package=matRiks ; 官方ICAR边界: https://icar-project.com/",
  "hidden": [
    "accuracyByRuleTag"
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

if(revised.reportReading)revised.reportReading.summaryByProfile={experience:{template:'这次4题体验中，作答 {answeredCount} 题、答对 {correctCount} 题；另有 {timeoutCount} 题未作答。次数少，只描述本次记录。',metricKeys:['answeredCount','correctCount','timeoutCount']}}

revised.metrics.medianRtMs={...revised.metrics.medianRtMs,label:'有效作答的典型用时（含答错）',explanation:'未中断且达到用时下限的已作答题用时，包含正确与错误答案；缺失不补零。'}
