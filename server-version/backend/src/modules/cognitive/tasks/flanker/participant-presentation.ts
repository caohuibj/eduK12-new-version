import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'
// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.3.0',
  title: "看中间的箭头",
  metrics: {
    ...previous.metrics,
    accuracy: { ...previous.metrics.accuracy, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", singleExplanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
    flankerEffectMs: { ...previous.metrics.flankerEffectMs, label: "反向比同向多用的时间" },
    incongruentAccuracy: { ...previous.metrics.incongruentAccuracy, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", singleExplanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", label: "周围反向时答对比例" },
    congruentAccuracy: { ...previous.metrics.congruentAccuracy, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", singleExplanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", label: "周围同向时答对比例" },
    medianRtCongruent: { ...previous.metrics.medianRtCongruent, label: "同向时答对的通常用时" },
    medianRtIncongruent: { ...previous.metrics.medianRtIncongruent, label: "反向时答对的通常用时" },
    errorCost: { ...previous.metrics.errorCost, label: "两种情况的正确比例差" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次看中间的箭头的作答记录。", showProductIndex: false, reportCaveats: ["正式24题，同/反向各12题，练习4题；含说明约2–3分钟（配置估计，未实测）。条件差值只作本次描述。", "体验24题，每4题包括同向/反向与左右方向的4种组合；每种条件共12题。漏答、错误或过快反应会进一步减少有效用时记录；差值仅描述本次，不证明稳定抗干扰能力。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次看中间的箭头的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次看中间的箭头的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["先确认中间箭头，再按方向作答。若想比较前后记录，保持同一题量、设备与输入方式；不要靠牺牲正确率追求更快。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.2.0',
    title: "两边意见不一，仍然看中间",
    introduction: "五个箭头里，只听正中间那个。两边有时顺路、有时唱反调，看看你这次怎样把目标和干扰分开。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "先确认中间箭头，再按方向作答。若想比较前后记录，保持同一题量、设备与输入方式；不要靠牺牲正确率追求更快。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        accuracy: { label: previous.metrics.accuracy.label, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
        flankerEffectMs: { ...previous.reportReading!.popular!.metricHelp.flankerEffectMs, label: "反向比同向多用的时间", explanation: previous.reportReading!.popular!.metricHelp.flankerEffectMs?.explanation ?? previous.metrics.flankerEffectMs.explanation ?? "反向比同向多用的时间" },
        incongruentAccuracy: { ...previous.reportReading!.popular!.metricHelp.incongruentAccuracy, label: "周围反向时答对比例", explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
        congruentAccuracy: { ...previous.reportReading!.popular!.metricHelp.congruentAccuracy, label: "周围同向时答对比例", explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
        medianRtCongruent: { ...previous.reportReading!.popular!.metricHelp.medianRtCongruent, label: "同向时答对的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtCongruent?.explanation ?? previous.metrics.medianRtCongruent.explanation ?? "同向时答对的通常用时" },
        medianRtIncongruent: { ...previous.reportReading!.popular!.metricHelp.medianRtIncongruent, label: "反向时答对的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtIncongruent?.explanation ?? previous.metrics.medianRtIncongruent.explanation ?? "反向时答对的通常用时" },
        errorCost: { ...previous.reportReading!.popular!.metricHelp.errorCost, label: "两种情况的正确比例差", explanation: previous.reportReading!.popular!.metricHelp.errorCost?.explanation ?? previous.metrics.errorCost.explanation ?? "两种情况的正确比例差" }
      },
      frames: [{"title": "找到中间", "text": "五个箭头，只看正中央那个。"}, {"title": "两边唱反调", "text": "两侧指向相反，也按中间方向回答。"}, {"title": "分开看记录", "text": "同向、反向的正确比例和用时分别阅读。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "比较两种情形：周围箭头和中间同向，或与中间反向。记录各自答对的比例，以及答对时通常花多久。",
      takeaway: "反向时更慢或更容易错，并不罕见。先把两种情况的正确比例和用时放在一起看，不给自己贴“容易分心”的标签。",
      exampleTitle: '把过程放进一个生活场景',
      example: "在热闹的操场上听清老师的指令，也需要先找准目标。这只是帮助理解“关注目标”的例子，任务结果不能直接推断课堂专注情况。",
      boundary: "体验24题，每4题包括同向/反向与左右方向的4种组合；每种条件共12题。漏答、错误或过快反应会进一步减少有效用时记录；差值仅描述本次，不证明稳定抗干扰能力。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "stimulusMs", "label": "呈现或响应窗（毫秒，以任务说明为准）"}, {"key": "isiMs", "label": "题间间隔（毫秒）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档160题；每4题四种方向组合各1题并种子洗牌，同/反向各80。题间400毫秒，箭头响应窗1800毫秒，练习4题至少对3题。Eriksen与Eriksen(1974), DOI 10.3758/BF03203267，原文摘要为字母、1秒呈现并改变字母间距；本项目用箭头、不操纵间距，是研究变式。全文未取得，原练习/总题量不能据摘要认定一致。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验24题，每4题包括同向/反向与左右方向的4种组合；每种条件共12题。漏答、错误或过快反应会进一步减少有效用时记录；差值仅描述本次，不证明稳定抗干扰能力。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
