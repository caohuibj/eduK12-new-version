import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "数字在线上哪里",
  metrics: {
    ...previous.metrics,
    paePercent: { ...previous.metrics.paePercent, label: "平均偏离整条线多远" },
    biasPercent: { ...previous.metrics.biasPercent, label: "整体偏左还是偏右" },
    withinTenRate: { ...previous.metrics.withinTenRate, label: "落在目标附近的比例" },
    validTrialCount: { ...previous.metrics.validTrialCount, label: "有位置回应的题数" },
    medianRtMs: { ...previous.metrics.medianRtMs, label: "选定位置的通常用时" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次数字在线上哪里的作答记录。", showProductIndex: false, reportCaveats: ["正式8题、练习1题最多2次，配置估计约2分钟（未实测）；只报告点位误差与回应数量。", "体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次数字在线上哪里的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次数字在线上哪里的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["可用端点、中点或四分之一位置帮助定位。下次比较时保持同一数值范围与屏幕，别把短体验的几次点位当作完整数学评价。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "给数字找一个合适的位置",
    introduction: "0和100之间，37会住在哪里？先找端点或中点作参照，再点出你估计的位置。这里只记录这次点位离目标有多远。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "可用端点、中点或四分之一位置帮助定位。下次比较时保持同一数值范围与屏幕，别把短体验的几次点位当作完整数学评价。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        paePercent: { ...previous.reportReading!.popular!.metricHelp.paePercent, label: "平均偏离整条线多远", explanation: previous.reportReading!.popular!.metricHelp.paePercent?.explanation ?? previous.metrics.paePercent.explanation ?? "平均偏离整条线多远" },
        biasPercent: { ...previous.reportReading!.popular!.metricHelp.biasPercent, label: "整体偏左还是偏右", explanation: previous.reportReading!.popular!.metricHelp.biasPercent?.explanation ?? previous.metrics.biasPercent.explanation ?? "整体偏左还是偏右" },
        withinTenRate: { ...previous.reportReading!.popular!.metricHelp.withinTenRate, label: "落在目标附近的比例", explanation: previous.reportReading!.popular!.metricHelp.withinTenRate?.explanation ?? previous.metrics.withinTenRate.explanation ?? "落在目标附近的比例" },
        validTrialCount: { ...previous.reportReading!.popular!.metricHelp.validTrialCount, label: "有位置回应的题数", explanation: previous.reportReading!.popular!.metricHelp.validTrialCount?.explanation ?? previous.metrics.validTrialCount.explanation ?? "有位置回应的题数" },
        medianRtMs: { ...previous.reportReading!.popular!.metricHelp.medianRtMs, label: "选定位置的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtMs?.explanation ?? previous.metrics.medianRtMs.explanation ?? "选定位置的通常用时" }
      },
      conceptTitle: '这个小游戏在观察什么',
      concept: "把数字和线段上的位置对应起来。平均偏离量按整条线长计算；整体偏左/偏右可能互相抵消，方向平均值接近0不代表每一题都准确。",
      takeaway: "先看有位置回应的题数与平均偏离量，再看偏哪边。超时没点的位置不会被编成0误差。",
      exampleTitle: '把过程放进一个生活场景',
      example: "看温度计刻度或估地图上一段路的位置时，也会用到参照点。这个例子帮助理解数量与位置，不代表任务已经验证了日常数学能力。",
      boundary: "体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "lineMax", "label": "数轴右端数值"}, {"key": "maxResponseMs", "label": "每题定位上限（毫秒）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档40题、0–100线段，每题400毫秒准备、最多10秒定位；各区间随机整数后种子洗牌，练习目标37并有反馈。Siegler与Opfer(2003), DOI 10.1111/1467-9280.02438提供数值估计范式；本项目用点击与分层生成、自定题量，不做原研究年龄组/表征模型检验。本轮已取得作者托管全文（DOI 10.1111/1467-9280.02438）方法：纸面25厘米，数字到位置与位置到数字两任务、0–100及0–1000两范围、A/B每范围六点、4或30秒与间隔1–2天的两session反向平衡。本项目当前只有数字到位置点击、40个分层点位/10秒，不具备该分布、互补任务和跨session设计；文献核对已完成，原协议对齐尚未完成。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验8题，按线段分层抽取目标再打乱顺序，可能出现相邻或重复整数；1题练习最多2次。只有8个正式点位，不拟合“数感类型”或推断稳定数学能力。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
