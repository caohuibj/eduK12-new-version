import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "看数值，不看字号",
  metrics: {
    ...previous.metrics,
    sizeCongruityEffectMs: { ...previous.metrics.sizeCongruityEffectMs, label: "字号冲突比同向多用的时间" },
    incongruentAccuracy: { ...previous.metrics.incongruentAccuracy, label: "字号冲突时答对比例" },
    congruentAccuracy: { ...previous.metrics.congruentAccuracy, label: "字号同向时答对比例" },
    medianRtCongruent: { ...previous.metrics.medianRtCongruent, label: "同向时答对的通常用时" },
    medianRtIncongruent: { ...previous.metrics.medianRtIncongruent, label: "冲突时答对的通常用时" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次看数值，不看字号的作答记录。", showProductIndex: false, reportCaveats: ["16题，两种情况各8题，练习2题最多2轮；配置估计约2分钟（未实测）。只作本次条件比较，无稳定抑制能力判断。", "体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次看数值，不看字号的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次看数值，不看字号的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["先读两个数字，再选数值较大的一边。追求速度时，也留意是否把“字更大”误当成“数更大”。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "字写得大，数值不一定大",
    introduction: "一个小小的7和一个大大的3，数值更大的还是7。这个小游戏请你选数值较大的数字，别被字体大小带跑。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "先读两个数字，再选数值较大的一边。追求速度时，也留意是否把“字更大”误当成“数更大”。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        sizeCongruityEffectMs: { ...previous.reportReading!.popular!.metricHelp.sizeCongruityEffectMs, label: "字号冲突比同向多用的时间", explanation: previous.reportReading!.popular!.metricHelp.sizeCongruityEffectMs?.explanation ?? previous.metrics.sizeCongruityEffectMs.explanation ?? "字号冲突比同向多用的时间" },
        incongruentAccuracy: { ...previous.reportReading!.popular!.metricHelp.incongruentAccuracy, label: "字号冲突时答对比例", explanation: previous.reportReading!.popular!.metricHelp.incongruentAccuracy?.explanation ?? previous.metrics.incongruentAccuracy.explanation ?? "字号冲突时答对比例" },
        congruentAccuracy: { ...previous.reportReading!.popular!.metricHelp.congruentAccuracy, label: "字号同向时答对比例", explanation: previous.reportReading!.popular!.metricHelp.congruentAccuracy?.explanation ?? previous.metrics.congruentAccuracy.explanation ?? "字号同向时答对比例" },
        medianRtCongruent: { ...previous.reportReading!.popular!.metricHelp.medianRtCongruent, label: "同向时答对的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtCongruent?.explanation ?? previous.metrics.medianRtCongruent.explanation ?? "同向时答对的通常用时" },
        medianRtIncongruent: { ...previous.reportReading!.popular!.metricHelp.medianRtIncongruent, label: "冲突时答对的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtIncongruent?.explanation ?? previous.metrics.medianRtIncongruent.explanation ?? "冲突时答对的通常用时" }
      },
      frames: [{"title": "确认规则", "text": "比的是数值，不是字号。"}, {"title": "读清数字", "text": "字更大的一边，数值不一定更大。"}, {"title": "分别看记录", "text": "两种情况的正确比例和用时一起看。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "两种情况各作比较：数值大的字也大，或数值大的字反而小。记录各自答对的比例和答对时的用时差，不把差值直接当成“自控力”。",
      takeaway: "用时差可以为负，也可以接近0。先看两种情况各有多少正确有效记录，不把短体验中的一个差值当成稳定结论。",
      exampleTitle: '把过程放进一个生活场景',
      example: "价签上的字很大，不代表价格就高；需要读清数字。这只是帮助理解外观与内容不一致的例子，不预测购物决策。",
      boundary: "体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "congruentRatio", "label": "一致条件比例"}, {"key": "minDigit", "label": "最小数字"}, {"key": "maxDigit", "label": "最大数字"}, {"key": "minGap", "label": "最小数值间距"}, {"key": "fixationMs", "label": "准备注视时长（毫秒）"}, {"key": "timeoutMs", "label": "每题响应上限（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档96题，一致/不一致各48题，数字1–9且间距至少2，左右位置随机但不保证计数严格相等；500毫秒准备，后续另加300毫秒，响应窗3秒。Henik与Tzelgov(1982), DOI 10.3758/BF03202431，作者上传原文实验1比较数值/物理大小，80种刺激（20一致/20不一致/40中性），2–8数字差2，8题练习、100毫秒注视后呈现至响应；本项目只按数值判断、无中性或反向任务条件，是研究变式。已核该原文方法段；不把80种刺激写成总施测题量，本文未确认的重复次数或缺失处理不宣称一致。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验16题，同向/冲突各8题，2题练习须全对、最多2轮。错误、超时或过快反应会减少条件内有效用时记录，差值仅描述本次；字体、视力和输入设备有影响。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
