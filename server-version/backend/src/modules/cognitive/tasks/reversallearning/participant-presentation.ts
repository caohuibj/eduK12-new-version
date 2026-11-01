import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.3.0',
  title: "跟着反馈找规律",
  metrics: {
    ...previous.metrics,
    acquisitionAccuracy: { ...previous.metrics.acquisitionAccuracy, label: "变化前选到较有利符号的比例" },
    reversalAccuracy: { ...previous.metrics.reversalAccuracy, label: "变化后选到较有利符号的比例" },
    feedbackWinRate: { ...previous.metrics.feedbackWinRate, label: "实际得到奖励的比例" },
    perseverativeErrorCount: { ...previous.metrics.perseverativeErrorCount, label: "变化后仍选原有利符号的次数" },
    trialsToAcquisitionCriterion: { ...previous.metrics.trialsToAcquisitionCriterion, label: "变化前达到连续6次的题数" },
    trialsToReversalCriterion: { ...previous.metrics.trialsToReversalCriterion, label: "变化后达到连续6次的题数" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次跟着反馈找规律的作答记录。", showProductIndex: false, reportCaveats: ["40题，前后各20，练习4题；含说明约3–4分钟（配置估计，未实测）。单次固定反转只能描述这一段选择变化。", "体验40题，变化前后各20题，只有一次固定位置反转。连续6次选到较有利符号是项目描述指标，短段内没达到时保留缺失，不当作0题达标，也不评定人格或冒险倾向。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次跟着反馈找规律的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次跟着反馈找规律的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["看看一段时间的反馈，再决定是否换方法。回顾报告时，先对照变化前后各有多少记录；不用一次奖励或一次负反馈评价自己。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.2.0',
    title: "刚才管用的方法，现在还管用吗？",
    introduction: "选一个符号，看看反馈，再决定下一次怎么选。中途较有利的符号会改变，而且偶尔会给出出人意料的反馈。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "看看一段时间的反馈，再决定是否换方法。回顾报告时，先对照变化前后各有多少记录；不用一次奖励或一次负反馈评价自己。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        acquisitionAccuracy: { ...previous.reportReading!.popular!.metricHelp.acquisitionAccuracy, label: "变化前选到较有利符号的比例", explanation: previous.reportReading!.popular!.metricHelp.acquisitionAccuracy?.explanation ?? previous.metrics.acquisitionAccuracy.explanation ?? "变化前选到较有利符号的比例" },
        reversalAccuracy: { ...previous.reportReading!.popular!.metricHelp.reversalAccuracy, label: "变化后选到较有利符号的比例", explanation: previous.reportReading!.popular!.metricHelp.reversalAccuracy?.explanation ?? previous.metrics.reversalAccuracy.explanation ?? "变化后选到较有利符号的比例" },
        feedbackWinRate: { ...previous.reportReading!.popular!.metricHelp.feedbackWinRate, label: "实际得到奖励的比例", explanation: previous.reportReading!.popular!.metricHelp.feedbackWinRate?.explanation ?? previous.metrics.feedbackWinRate.explanation ?? "实际得到奖励的比例" },
        perseverativeErrorCount: { ...previous.reportReading!.popular!.metricHelp.perseverativeErrorCount, label: "变化后仍选原有利符号的次数", explanation: previous.reportReading!.popular!.metricHelp.perseverativeErrorCount?.explanation ?? previous.metrics.perseverativeErrorCount.explanation ?? "变化后仍选原有利符号的次数" },
        trialsToAcquisitionCriterion: { ...previous.reportReading!.popular!.metricHelp.trialsToAcquisitionCriterion, label: "变化前达到连续6次的题数", explanation: previous.reportReading!.popular!.metricHelp.trialsToAcquisitionCriterion?.explanation ?? previous.metrics.trialsToAcquisitionCriterion.explanation ?? "变化前达到连续6次的题数" },
        trialsToReversalCriterion: { ...previous.reportReading!.popular!.metricHelp.trialsToReversalCriterion, label: "变化后达到连续6次的题数", explanation: previous.reportReading!.popular!.metricHelp.trialsToReversalCriterion?.explanation ?? previous.metrics.trialsToReversalCriterion.explanation ?? "变化后达到连续6次的题数" }
      },
      frames: [{"title": "作一个选择", "text": "选左或右的符号，看看反馈。"}, {"title": "多看几次", "text": "较有利符号也可能偶尔没有奖励。"}, {"title": "留意变化", "text": "中途规律反转；回看前后两段记录。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "这次记录你在有不确定反馈时怎样逐步调整选择。较有利的符号也可能得到负反馈，所以一次“没奖励”不能直接证明选错了。",
      takeaway: "“奖励比例”与“选到当时较有利符号的比例”是两件事。后者按生成规则计分；前者还受概率影响，不能互相替代。",
      exampleTitle: '把过程放进一个生活场景',
      example: "试一条上学路线，偶尔遇到红灯不代表路线就不好；连续多次的情况才提供更多线索。这只是理解反馈不确定性的比喻，不是现实决策能力评定。",
      boundary: "体验40题，变化前后各20题，只有一次固定位置反转。连续6次选到较有利符号是项目描述指标，短段内没达到时保留缺失，不当作0题达标，也不评定人格或冒险倾向。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "acquisitionTrials", "label": "变化前题数"}, {"key": "reversalTrials", "label": "变化后题数"}, {"key": "rewardProbability", "label": "较有利选择的正反馈概率"}, {"key": "trialTimeoutMs", "label": "每题响应上限（毫秒）"}, {"key": "criterionConsecutiveCorrect", "label": "描述性达标连续次数"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档240题，前120题A符号较有利、后120题B符号较有利；位置逐题随机，反馈种子随机，较有利选择获正反馈概率0.8，另一符号获正反馈概率为0（并非0.2）。响应窗3000毫秒，4题练习至少完成3题。Cools等(2002), DOI 10.1523/JNEUROSCI.22-11-04563.2002，原研究涉及概率反馈与反转；本项目固定一次反转，不以连续6次达标触发反转。原论文全文本轮未取得；另核Millisecond作者实现，其80/20双选项、10–15次连续选择后反转与本项目80/0且固定反转不同，不宣称等同原文或该实现。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验40题，变化前后各20题，只有一次固定位置反转。连续6次选到较有利符号是项目描述指标，短段内没达到时保留缺失，不当作0题达标，也不评定人格或冒险倾向。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
