import {participantPresentations as historicalPresentations} from './participant-presentation'
import type {CognitiveParticipantPresentationV1} from '../../participant-presentation.types'

/** R-only revision. Historical C/P/R exports and frozen snapshots are retained. */
const copy = {
  "c": [
    "1.0.0",
    "1.0.0"
  ],
  "title": "把图形在脑中转一转",
  "concept": "两个图形可能只是转了方向，也可能像照镜子一样翻了面。你要分清这两种变化；报告只回看这一次判断。",
  "example": "拼一块拼图前，试着在脑中转动它，看看凸角能否对上缺口；镜面翻转则不一定能靠转动重合。",
  "tip": "先找一个不对称的小特征，再想象整体转动。正确率和用时一起看，不单追求快。",
  "boundary": "这里是平面几何图形；触控、键盘熟练度和图形经验都可能影响用时。",
  "counts": [
    12,
    40,
    80
  ],
  "practice": "4次练习，至少3次正确",
  "time": "体验约2–4分钟；研究原估计11–16分钟。正式12/80次按5秒呈现+0.4秒间隔的上界约1.1/7.2分钟，另计说明与练习；研究估计偏宽，非实测。",
  "procedure": "平面形状，0/45/90/135/180度×同形/镜像10条件，12/40/80次，seed分层后打乱；12次中0度两条件各2次、其余各1次。呈现5秒、间隔400ms；正确率分母是全部正式试次。角度差为≥135度与≤45度正确RT中位数之差，不是拟合斜率。",
  "comparison": "Shepard与Metzler（1971）用三维物体透视图比较方向差与识别时间；本项目为平面形状与镜像二选一，角度组中位差不等于原文旋转速度或线性斜率。",
  "source": "Shepard & Metzler, Mental Rotation of Three-Dimensional Objects (1971), DOI 10.1126/science.171.3972.701: https://pubmed.ncbi.nlm.nih.gov/5540314/",
  "hidden": [
    "angleCost",
    "mirrorErrorRate"
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

if(revised.metrics.angleCost)revised.metrics.angleCost={...revised.metrics.angleCost,label:'大角度比小角度多用的时间',explanation:'本次大角度与小角度正确判断的典型用时之差；负值仍保留，不是转动速度或能力等级。'}

revised.disclaimer+=' 练习与正式使用同一内部素材池，可能再次遇到相同素材；熟悉效应需一起考虑。'
revised.reportReading!.professional!.procedure+=' 当前练习从同一内部池取4题；研究档覆盖全池，存在练习刺激重现。练习记录不进入正式分母，但熟悉效应仍会影响后续表现。'
