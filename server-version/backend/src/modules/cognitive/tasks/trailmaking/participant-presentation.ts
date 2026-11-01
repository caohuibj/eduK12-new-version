import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.3.0',
  title: "按顺序找目标",
  metrics: {
    ...previous.metrics,
    omissionRate: { ...previous.metrics.omissionRate, explanation: "未在时限内成功完成的计划步骤比例；一直错点而未完成也计入，不仅是完全没点击。", singleExplanation: "未在时限内成功完成的计划步骤比例，包含错点后仍未完成的步骤。" },
    completionTimeMs: { ...previous.metrics.completionTimeMs, label: "完成步骤累计用时" },
    setShiftCostMs: { ...previous.metrics.setShiftCostMs, label: "B、A每步平均用时差" },
    meanCorrectStepTimeMs: { ...previous.metrics.meanCorrectStepTimeMs, label: "找对下一步的平均用时" },
    completedStepCount: { ...previous.metrics.completedStepCount, label: "实际完成步数" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次按顺序找目标的作答记录。", showProductIndex: false, reportCaveats: ["A部分12目标，A练习4目标；含说明约2–3分钟为配置估计（未实测）。每步15秒意味着超时较多时正式段本身可接近3分钟，非硬性总时限。", "体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次按顺序找目标的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次按顺序找目标的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["开始前读清顺序。需要交替时，可以在心里轻声念“1、A、2、B”；比较记录时尽量保持设备和点击方式一致。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.2.0',
    title: "让目光找到队伍里的下一位",
    introduction: "在散开的目标中按顺序点击：A部分跟着数字走；有B部分时，数字和字母交替走。记录的是这次寻找、记顺序和操作的共同表现。",
    summary: { template: '这次完成了 {completedStepCount} 步；这些步骤累计用时 {completionTimeMs}，有 {errorCount} 次错点。', metricKeys: ['completedStepCount', 'completionTimeMs', 'errorCount'] },
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { metricKeys: ['completedStepCount', 'completionTimeMs', 'errorCount'], template: "这次短体验：" + '完成了 {completedStepCount} 步；这些步骤累计用时 {completionTimeMs}，有 {errorCount} 次错点。' + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "开始前读清顺序。需要交替时，可以在心里轻声念“1、A、2、B”；比较记录时尽量保持设备和点击方式一致。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        omissionRate: { label: "未按时完成的步骤比例", explanation: "未在时限内成功完成的计划步骤比例；一直错点而未完成也算。" },
        completionTimeMs: { ...previous.reportReading!.popular!.metricHelp.completionTimeMs, label: "完成步骤累计用时", explanation: '只累计成功完成步骤的用时；超时未完成的步骤不计入此和，不是从开始到结束的挂钟总时长。' },
        setShiftCostMs: { ...previous.reportReading!.popular!.metricHelp.setShiftCostMs, label: "B、A每步平均用时差", explanation: 'B部分已完成步骤的平均用时减A部分已完成步骤的平均用时，并非B总时长减A总时长；缺一部分时不计算，负值照实保留。' },
        meanCorrectStepTimeMs: { ...previous.reportReading!.popular!.metricHelp.meanCorrectStepTimeMs, label: "找对下一步的平均用时", explanation: previous.reportReading!.popular!.metricHelp.meanCorrectStepTimeMs?.explanation ?? previous.metrics.meanCorrectStepTimeMs.explanation ?? "找对下一步的平均用时" },
        completedStepCount: { ...previous.reportReading!.popular!.metricHelp.completedStepCount, label: "实际完成步数", explanation: previous.reportReading!.popular!.metricHelp.completedStepCount?.explanation ?? previous.metrics.completedStepCount.explanation ?? "实际完成步数" }
      },
      frames: [{"title": "认清顺序", "text": "A部分按数字走，B部分数字与字母交替。"}, {"title": "寻找下一位", "text": "找到下一个目标，再点击。"}, {"title": "先数完成步数", "text": "部分步骤超时没完成时，累计用时不是整段总时间。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "A部分依次选择数字；B部分在数字和英文字母之间交替。用时也包含找位置和点击动作，不能把它全部解释成思考速度。",
      takeaway: "先看实际完成了多少步、有没有错点或超时，再看用时。只有A部分时，没有B减A的切换时间差；没有数据不等于差值为0。",
      exampleTitle: '把过程放进一个生活场景',
      example: "在书架上依编号找书、在地图上依顺序找站点，都需要不断找“下一位”。这只是说明过程，不能用本次记录预测生活能力。",
      boundary: "体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      metricNotes: { ...previous.reportReading!.professional!.metricNotes, omissionRate: { definition: "未在时限内成功完成的计划步骤比例；包含错点后仍未完成，不仅是完全没有响应。", readingHint: "分母为计划步骤数；与实际完成步数及错点一起阅读。" } },
      configFields: [{"key": "form", "label": "任务部分"}, {"key": "partAItemCount", "label": "A部分目标数"}, {"key": "partBItemCount", "label": "B部分目标数"}, {"key": "stepTimeoutMs", "label": "每步响应上限（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档A24目标+B24目标，8×6网格内种子洗牌位置，按点击目标逐步记录、每步15秒。Reitan(1958), DOI 10.2466/pms.1958.8.3.271，以及Bowie与Harvey(2006), DOI 10.1038/nprot.2006.390为原测试/施测文献；本项目是数字点击变式，不复制原纸笔布局或临床常模。本轮已核Bowie与Harvey作者上传协议：纸笔A/B各25目标，各有练习，连续计总时长，错误纠正仍计时，通常300秒停止。本项目仅A练习4目标、A/B各24目标、每步15秒超时后记录，与原协议不同；本项目差值是B每步平均用时减A每步平均用时，仍混合搜索、字母知识与动作因素。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验只做A部分12个目标，没有B部分，不能解释数字/字母切换。练习为A部分4目标，至少完成3个；每步最多15秒。英文顺序知识、视觉搜索与手部操作都会影响结果。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
