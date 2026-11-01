import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "算式对不对",
  metrics: {
    ...previous.metrics,
    medianRtMs: { ...previous.metrics.medianRtMs, label: "答对时通常用多久" },
    problemSizeSlopeMs: { ...previous.metrics.problemSizeSlopeMs, label: "和变大时的用时趋势" },
    validRtCount: { ...previous.metrics.validRtCount, label: "纳入用时统计的题数" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次算式对不对的作答记录。", showProductIndex: false, reportCaveats: ["正式12题，真/假各6题，练习2题最多2轮；配置估计约2分钟（未实测）。只读正确比例、错误/超时与答对用时，不显示题目大小斜率。", "体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次算式对不对的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次算式对不对的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["先把两个数相加，再与显示的结果比较。想比较自己的记录时，用同样的题量和数字范围，并让手指先熟悉按键。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "先算一算，再决定对或错",
    introduction: "给加法算式当一次小检查员：不只看结果眼熟不眼熟，先心算，再判断写出的答案对不对。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    hiddenByProfile: { ...previous.reportReading!.hiddenByProfile, experience: [...new Set([...(previous.reportReading!.hiddenByProfile?.experience ?? []), 'problemSizeSlopeMs'])] },
    nextStep: "先把两个数相加，再与显示的结果比较。想比较自己的记录时，用同样的题量和数字范围，并让手指先熟悉按键。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        medianRtMs: { ...previous.reportReading!.popular!.metricHelp.medianRtMs, label: "答对时通常用多久", explanation: previous.reportReading!.popular!.metricHelp.medianRtMs?.explanation ?? previous.metrics.medianRtMs.explanation ?? "答对时通常用多久" },
        problemSizeSlopeMs: { ...previous.reportReading!.popular!.metricHelp.problemSizeSlopeMs, label: "和变大时的用时趋势", explanation: previous.reportReading!.popular!.metricHelp.problemSizeSlopeMs?.explanation ?? previous.metrics.problemSizeSlopeMs.explanation ?? "和变大时的用时趋势" },
        validRtCount: { ...previous.reportReading!.popular!.metricHelp.validRtCount, label: "纳入用时统计的题数", explanation: previous.reportReading!.popular!.metricHelp.validRtCount?.explanation ?? previous.metrics.validRtCount.explanation ?? "纳入用时统计的题数" }
      },
      conceptTitle: '这个小游戏在观察什么',
      concept: "记录你这次判断加法真假的正确比例，以及答对时通常用多久。学校所学、练习经历、当前疲劳与按键熟练程度都会影响记录。",
      takeaway: "做得快要和答得对一起看。短体验没有足够题目说明“数字变大时慢多少”，因此不展示这个趋势指标。",
      exampleTitle: '把过程放进一个生活场景',
      example: "核对小票上两件商品的合计数时，也需要先求和再比较。这里是理解任务的例子，不能用这次小游戏判定全部数学水平。",
      boundary: "体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "operandMax", "label": "最大加数"}, {"key": "trueRatio", "label": "真算式比例"}, {"key": "fixationMs", "label": "准备注视时长（毫秒）"}, {"key": "timeoutMs", "label": "每题响应上限（毫秒）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档60题，真/假各30题，加数1–10，假结果偏离正确和±1/2/3且不低于0；500毫秒准备，后续另加300毫秒，响应窗6秒。Ashcraft与Battaglia(1978), DOI 10.1037/0278-7393.4.5.527的原作者上传摘要支持真/假验证与错和偏离量影响用时；其合理/不合理错和操纵与本项目不同。本项目不分组平衡那些原条件，不能解释为原实验复刻；未核全文题量/练习。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验12题，真/假各6题，2题练习须全对、最多2轮。样本和数字组合很少，体验报告隐藏题目大小用时趋势；不是数学能力指数或学习困难判断。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
