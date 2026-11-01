import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.3.0',
  title: "图形找不同",
  metrics: {
    ...previous.metrics,
    correctCount: { ...previous.metrics.correctCount, explanation: "选对且反应用时达到本次有效下限的正式次数；选对但过快的不计入。", singleExplanation: "选对且反应用时达到本次有效下限的次数。" },
    accuracy: { ...previous.metrics.accuracy, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。", singleExplanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
    correctPerMinute: { ...previous.metrics.correctPerMinute, explanation: "正确有效次数除以冻结配置durationSec，再乘60；按配置时长折算，不是按实测完成时长，也不是同龄人排名。", singleExplanation: "按本次配置的正式秒数折算为每分钟答对数，不是实测一分钟的结果。", label: "折算每分钟答对数" },
    medianCorrectRtMs: { ...previous.metrics.medianCorrectRtMs, label: "答对时通常用多久" },
    lapseRate: { ...previous.metrics.lapseRate, label: "未回应比例" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次图形找不同的作答记录。", showProductIndex: false, reportCaveats: ["正式30秒，4题练习；通常含说明约1–2分钟（配置估计，未实测）。题数不固定，只描述这30秒的完成量和正确比例。", "体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次图形找不同的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次图形找不同的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["试试先扫轮廓，再核对填充、方向和标记。下次若要比较自己的记录，尽量使用相同设备和相同正式时长。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.2.0',
    title: "先看清，再判断是不是同一个图形",
    introduction: "两个图形乍看很像？再看一眼形状、填充和小标记。这个小游戏记录你在限时内比较细节的速度与准确程度。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "试试先扫轮廓，再核对填充、方向和标记。下次若要比较自己的记录，尽量使用相同设备和相同正式时长。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        correctCount: { label: "正确有效次数", explanation: "选对且反应用时达到本次有效下限的正式次数；过快选对不计入。" },
        accuracy: { label: previous.metrics.accuracy.label, explanation: "按得比本次设定的最短有效时间还快，即使选对也不计作正确；过快反应和未回答都保留在计算比例的总次数里。" },
        correctPerMinute: { ...previous.reportReading!.popular!.metricHelp.correctPerMinute, label: "折算每分钟答对数", explanation: "正确有效次数除以配置durationSec，再乘60；体验档按配置30秒折算，不是按实测时长计算。" },
        medianCorrectRtMs: { ...previous.reportReading!.popular!.metricHelp.medianCorrectRtMs, label: "答对时通常用多久", explanation: previous.reportReading!.popular!.metricHelp.medianCorrectRtMs?.explanation ?? previous.metrics.medianCorrectRtMs.explanation ?? "答对时通常用多久" },
        lapseRate: { ...previous.reportReading!.popular!.metricHelp.lapseRate, label: "未回应比例", explanation: previous.reportReading!.popular!.metricHelp.lapseRate?.explanation ?? previous.metrics.lapseRate.explanation ?? "未回应比例" }
      },
      frames: [{"title": "扫一眼轮廓", "text": "先比较左右形状。"}, {"title": "再看小细节", "text": "填充、标记或方向有一处不同，也要选“不同”。"}, {"title": "看准再按", "text": "正确比例和完成量一起读。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "每题比较两个图形是否完全相同。它观察的是这次看细节、作判断和按键的配合，不是单独测出一种固定能力。",
      takeaway: "先看正确比例，再看完成量；同样快的两次作答，也可能有不同的出错情况。",
      exampleTitle: '把过程放进一个生活场景',
      example: "找两把外形相近的钥匙时，你可能会先看轮廓，再看齿纹。这里只用这个场景帮助理解，成绩不能预测你现实中找钥匙的快慢。",
      boundary: "体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      metricNotes: { ...previous.reportReading!.professional!.metricNotes, correctCount: { definition: "正式题中选对且rtMs不缺失、达到冻结validRtFloorMs下限的次数。", readingHint: "过快选对不纳入正确次数，但保留在比例分母中。" } },
      configFields: [{"key": "durationSec", "label": "正式时长（秒）"}, {"key": "trialTimeoutMs", "label": "每题响应上限（毫秒）"}, {"key": "isiMs", "label": "题间间隔（毫秒）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档正式90秒，单题最多2500毫秒，题间250毫秒；种子逐题生成自编几何图形，并非固定等量的相同/不同题。4题练习至少对3题。NIH Toolbox官方同异判断说明支持范式参照，但当前官方页面的总施测约4分钟不等于本项目正式计时；未取得完整原始试次/时序协议，不称Toolbox复刻，不采用其常模。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验版正式阶段30秒，题数随作答速度变化。每分钟正确数是按30秒折算，不代表真的持续做满1分钟；短时间的波动、屏幕清晰度和操作熟练度都会影响结果。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
