import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "照图例找数字",
  metrics: {
    ...previous.metrics,
    medianRtMs: { ...previous.metrics.medianRtMs, label: "配对答对时通常用多久" },
    accuracy: { ...previous.metrics.accuracy, label: "配对答对比例" },
    validRtCount: { ...previous.metrics.validRtCount, label: "纳入用时统计的题数" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次照图例找数字的作答记录。", showProductIndex: false, reportCaveats: ["16题，练习2题最多2轮；配置估计约2分钟（未实测）。只描述本次五符号查表配对，不解释成记忆或整体加工速度等级。", "体验16题、5组固定符号数字图例，练习2题须全对、最多2轮。随机符号不保证各类均衡；只有本次查表配对记录，没有常模或记忆力结论。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次照图例找数字的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次照图例找数字的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["先熟悉图例，再开始正式题；需要时可以继续看图例。比较记录时保持同样映射、题量与设备，不把熟练后的提速全归为能力变化。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "看懂小密码，给符号配数字",
    introduction: "对照屏幕上的五组小密码，为出现的符号找数字。图例一直在，不需要硬背；这次记录查找、对应和操作的配合。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "先熟悉图例，再开始正式题；需要时可以继续看图例。比较记录时保持同样映射、题量与设备，不把熟练后的提速全归为能力变化。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        medianRtMs: { ...previous.reportReading!.popular!.metricHelp.medianRtMs, label: "配对答对时通常用多久", explanation: previous.reportReading!.popular!.metricHelp.medianRtMs?.explanation ?? previous.metrics.medianRtMs.explanation ?? "配对答对时通常用多久" },
        accuracy: { ...previous.reportReading!.popular!.metricHelp.accuracy, label: "配对答对比例", explanation: previous.reportReading!.popular!.metricHelp.accuracy?.explanation ?? previous.metrics.accuracy.explanation ?? "配对答对比例" },
        validRtCount: { ...previous.reportReading!.popular!.metricHelp.validRtCount, label: "纳入用时统计的题数", explanation: previous.reportReading!.popular!.metricHelp.validRtCount?.explanation ?? previous.metrics.validRtCount.explanation ?? "纳入用时统计的题数" }
      },
      conceptTitle: '这个小游戏在观察什么',
      concept: "每题把一个符号和图例中的数字配起来。用时包含看图例、找对应与按键，不是单独测出记忆力或纯思考速度。",
      takeaway: "看正确比例，也看漏答和答对时的用时。符号随机出现，不保证五个符号次数一样；短体验的快慢可能受到遇到的符号影响。",
      exampleTitle: '把过程放进一个生活场景',
      example: "按地图图例找出车站或公园的符号，也会做类似的对应。这只是理解过程的例子，不能从小游戏推断出行能力。",
      boundary: "体验16题、5组固定符号数字图例，练习2题须全对、最多2轮。随机符号不保证各类均衡；只有本次查表配对记录，没有常模或记忆力结论。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "fixationMs", "label": "准备注视时长（毫秒）"}, {"key": "timeoutMs", "label": "每题响应上限（毫秒）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档80题，五组固定图例全程可见，符号种子随机且非固定配额；400毫秒准备，后续另加200毫秒，响应窗8秒。Smith的SDMT由PAR官方说明为90秒内口头或书写配对；本项目是固定题数的五符号按键任务，不使用其专有题表或常模，不是SDMT标准施测。官方公开说明未给完整练习/随机协议，未据此声称一致。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验16题、5组固定符号数字图例，练习2题须全对、最多2轮。随机符号不保证各类均衡；只有本次查表配对记录，没有常模或记忆力结论。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
