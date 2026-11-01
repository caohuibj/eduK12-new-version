import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.3.0',
  title: "跟着提示分卡片",
  metrics: {
    ...previous.metrics,
    switchCostRtMs: { ...previous.metrics.switchCostRtMs, label: "换规则比沿用规则多用的时间" },
    accuracySwitch: { ...previous.metrics.accuracySwitch, label: "换规则时答对比例" },
    accuracyRepeat: { ...previous.metrics.accuracyRepeat, label: "沿用规则且卡片有冲突时答对比例" },
    perseverativeErrorRate: { ...previous.metrics.perseverativeErrorRate, label: "仍按旧规则作答的比例" },
    postSwitchRecovery: { ...previous.metrics.postSwitchRecovery, label: "换规则后的恢复记录" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次跟着提示分卡片的作答记录。", showProductIndex: false, reportCaveats: ["24题/2组，4题练习；含说明与组间自定休息约2–3分钟（配置估计，未实测）。8次切换不足以据单次差值判断稳定灵活性。", "体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次跟着提示分卡片的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次跟着提示分卡片的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["每题先读“颜色/形状”，再看卡片。发现错了，就回到当前提示；不必凭记忆猜接下来是什么规则。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.2.0',
    title: "这一次，按颜色还是按形状？",
    introduction: "同一张卡片，换个规则就可能要去另一边。先读本题提示，再把它送到合适的位置。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "每题先读“颜色/形状”，再看卡片。发现错了，就回到当前提示；不必凭记忆猜接下来是什么规则。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        switchCostRtMs: { ...previous.reportReading!.popular!.metricHelp.switchCostRtMs, label: "换规则比沿用规则多用的时间", explanation: previous.reportReading!.popular!.metricHelp.switchCostRtMs?.explanation ?? previous.metrics.switchCostRtMs.explanation ?? "换规则比沿用规则多用的时间" },
        accuracySwitch: { ...previous.reportReading!.popular!.metricHelp.accuracySwitch, label: "换规则时答对比例", explanation: previous.reportReading!.popular!.metricHelp.accuracySwitch?.explanation ?? previous.metrics.accuracySwitch.explanation ?? "换规则时答对比例" },
        accuracyRepeat: { ...previous.reportReading!.popular!.metricHelp.accuracyRepeat, label: "沿用规则且卡片有冲突时答对比例", explanation: previous.reportReading!.popular!.metricHelp.accuracyRepeat?.explanation ?? previous.metrics.accuracyRepeat.explanation ?? "沿用规则时答对比例" },
        perseverativeErrorRate: { ...previous.reportReading!.popular!.metricHelp.perseverativeErrorRate, label: "仍按旧规则作答的比例", explanation: previous.reportReading!.popular!.metricHelp.perseverativeErrorRate?.explanation ?? previous.metrics.perseverativeErrorRate.explanation ?? "仍按旧规则作答的比例" },
        postSwitchRecovery: { ...previous.reportReading!.popular!.metricHelp.postSwitchRecovery, label: "换规则后的恢复记录", explanation: previous.reportReading!.popular!.metricHelp.postSwitchRecovery?.explanation ?? previous.metrics.postSwitchRecovery.explanation ?? "换规则后的恢复记录" }
      },
      frames: [{"title": "先看提示", "text": "这题按颜色，还是按形状？"}, {"title": "再分卡片", "text": "按本题规则选左边或右边。"}, {"title": "换了就重看", "text": "下一题规则可能改变，不沿用上一题答案。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "屏幕会明确提示按颜色或形状分类。比较规则刚改变与沿用上一题规则时的记录，看看这次切换规则的过程；不是让你猜一个隐藏规则。",
      takeaway: "换规则时出错，不等于不灵活。用时差、正确比例和是否沿用旧规则，需放在本次题量与具体题面中一起看。",
      exampleTitle: '把过程放进一个生活场景',
      example: "整理玩具时，先按颜色放，再改成按形状放，需要重新留意分类依据。这是规则切换的例子，不能据此评定现实中的适应力。",
      boundary: "体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "blockCount", "label": "分组数"}, {"key": "switchRatio", "label": "每组后续题的计划切换比例"}, {"key": "cueMs", "label": "规则提示时长（毫秒）"}, {"key": "stimulusMs", "label": "呈现或响应窗（毫秒，以任务说明为准）"}, {"key": "isiMs", "label": "题间间隔（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档144题/6组，每组24题；每组round(23×0.33)=8次切换，共48切换/90重复/6起始题。题间350毫秒、提示500毫秒、响应窗2000毫秒。4题练习至少对3题。Zelazo(2006), DOI 10.1038/nprot.2006.46，原DCCS是先按一维后改另一维，本项目为逐题提示并多次切换；切换题限定冲突卡，对照只纳入冲突重复题，属于项目研究变式，不是标准DCCS或威斯康星卡片分类。只取得原摘要，未核全文练习/精确题量。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验24题分2组，每组12题；每组第一题不计切换/重复，按现有生成规则共8次切换和14次重复。计分只从重复题中选出颜色与形状指向不同答案的题作对照，所以实际对照分母随本次种子变化，并非14题全部纳入；仍不把单次时间差视为稳定切换能力。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
