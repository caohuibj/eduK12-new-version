import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "同时记住中间与周边",
  metrics: {
    ...previous.metrics,
    dualCorrectRate: { ...previous.metrics.dualCorrectRate, label: "两题都答对的比例" },
    centralAccuracy: { ...previous.metrics.centralAccuracy, label: "中心形状答对比例" },
    peripheralAccuracy: { ...previous.metrics.peripheralAccuracy, label: "周边方向答对比例" },
    dualCorrectCount: { ...previous.metrics.dualCorrectCount, label: "两题都对的题数" },
    medianRtMs: { ...previous.metrics.medianRtMs, label: "看图加两步回答的通常用时" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次同时记住中间与周边的作答记录。", showProductIndex: false, reportCaveats: ["8题，练习1题；含说明配置估计2–3分钟（未实测）。回应阶段不限时，非硬性总时限；不生成方向画像或视觉阈值。", "体验8题、练习1题无达标门槛。中心形状及8个周边位置逐题随机，不保证各出现一次；400毫秒固定呈现不估计阈值，也没有视角/注视校准。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次同时记住中间与周边的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次同时记住中间与周边的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["照提示看中心，并留意亮点出现的方向。若想比较记录，使用相同设备和显示设置；屏幕大小、观看距离或显示卡顿都可能影响结果。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "中间是什么，亮点又在哪边？",
    introduction: "图形和亮点只出现一小会儿。先看中心，同时留意周边；消失后，再依次回答中心形状和亮点方向。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "照提示看中心，并留意亮点出现的方向。若想比较记录，使用相同设备和显示设置；屏幕大小、观看距离或显示卡顿都可能影响结果。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        dualCorrectRate: { ...previous.reportReading!.popular!.metricHelp.dualCorrectRate, label: "两题都答对的比例", explanation: previous.reportReading!.popular!.metricHelp.dualCorrectRate?.explanation ?? previous.metrics.dualCorrectRate.explanation ?? "两题都答对的比例" },
        centralAccuracy: { ...previous.reportReading!.popular!.metricHelp.centralAccuracy, label: "中心形状答对比例", explanation: previous.reportReading!.popular!.metricHelp.centralAccuracy?.explanation ?? previous.metrics.centralAccuracy.explanation ?? "中心形状答对比例" },
        peripheralAccuracy: { ...previous.reportReading!.popular!.metricHelp.peripheralAccuracy, label: "周边方向答对比例", explanation: previous.reportReading!.popular!.metricHelp.peripheralAccuracy?.explanation ?? previous.metrics.peripheralAccuracy.explanation ?? "周边方向答对比例" },
        dualCorrectCount: { ...previous.reportReading!.popular!.metricHelp.dualCorrectCount, label: "两题都对的题数", explanation: previous.reportReading!.popular!.metricHelp.dualCorrectCount?.explanation ?? previous.metrics.dualCorrectCount.explanation ?? "两题都对的题数" },
        medianRtMs: { ...previous.reportReading!.popular!.metricHelp.medianRtMs, label: "看图加两步回答的通常用时", explanation: previous.reportReading!.popular!.metricHelp.medianRtMs?.explanation ?? previous.metrics.medianRtMs.explanation ?? "看图加两步回答的通常用时" }
      },
      conceptTitle: '这个小游戏在观察什么',
      concept: "同一次短暂呈现里，中心要辨形状，周边要记方向。两题同时答对的比例描述这次双重任务表现，不等于测出了真实视野范围。",
      takeaway: "中心对、周边对和两题都对是不同指标。8次体验中某个方向可能没有出现，不能按各方向给出能力画像。",
      exampleTitle: '把过程放进一个生活场景',
      example: "看着路标又留意旁边有人经过，可以帮助理解“同时留意两处”。这只是概念例子，不能据任务结果判断驾驶安全或视力健康。",
      boundary: "体验8题、练习1题无达标门槛。中心形状及8个周边位置逐题随机，不保证各出现一次；400毫秒固定呈现不估计阈值，也没有视角/注视校准。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "fixationMs", "label": "准备注视时长（毫秒）"}, {"key": "stimulusMs", "label": "呈现或响应窗（毫秒，以任务说明为准）"}, {"key": "validRtFloorMs", "label": "纳入用时统计的最短时间（毫秒）"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档24题；500毫秒准备后固定呈现400毫秒，再依次回答中心形状和周边方向；响应阶段无自动总时限。Ball等(1988), DOI 10.1364/JOSAA.5.002210，原文公开表格区分中心任务及0/23/47干扰项条件；本项目没有该干扰操纵、视角标定或自适应阈值。是项目双重视觉任务，不是商业UFOV或驾驶/临床评估；全文时序/练习未取得。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验8题、练习1题无达标门槛。中心形状及8个周边位置逐题随机，不保证各出现一次；400毫秒固定呈现不估计阈值，也没有视角/注视校准。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
