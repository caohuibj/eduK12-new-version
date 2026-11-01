import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previousPresentations } from './participant-presentation.previous'

// Display revision only. Existing assignments keep their frozen previous presentation.
// Keep the previous source intact; export one current presentation per C/S identity.
export const participantPresentations: CognitiveParticipantPresentationV1[] = previousPresentations.map((previous) => ({
  ...previous,
  presentationVersion: '1.1.0',
  title: "一屏符号找目标",
  metrics: {
    ...previous.metrics,
    hitRate: { ...previous.metrics.hitRate, label: "目标找到的比例" },
    falseAlarmRate: { ...previous.metrics.falseAlarmRate, label: "点亮格子中的误选比例" },
    hitCount: { ...previous.metrics.hitCount, label: "找到的目标数" },
    missCount: { ...previous.metrics.missCount, label: "没选中的目标数" },
    falseAlarmCount: { ...previous.metrics.falseAlarmCount, label: "误选格子数" }
  },
  protocols: {
    ...previous.protocols,
    experience: { ...previous.protocols.experience, tier: 'PILOT', profileLabel: '体验版', participantConclusion: "这份报告描述本次一屏符号找目标的作答记录。", showProductIndex: false, reportCaveats: ["1轮最多45秒，另有1轮可提前结束的练习；含说明配置估计2–3分钟（未实测）。只描述这屏的命中/漏看/误选，不作持续注意诊断。", "体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。"] },
    standard: { ...previous.protocols.standard, tier: 'PILOT', profileLabel: '正式版', participantConclusion: "这份报告描述本次一屏符号找目标的作答记录。", showProductIndex: false, reportCaveats: ["只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
    research: { ...previous.protocols.research, tier: 'PILOT', profileLabel: '研究版', participantConclusion: "这份报告描述本次一屏符号找目标的作答记录。", showProductIndex: false, reportCaveats: ["研究版是本项目的较长配置；材料、题量或时序与参考研究有差异，详见方法附注。增加题量不等于已经证实可靠性。", "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。"] },
  },
  practicalTips: ["先认准目标，再按行或按列寻找。注意别为了多点而忽略相似符号；新一轮开始时重新确认目标。"],
  disclaimer: "只描述本次作答过程；屏幕、输入方式、疲劳、知识与练习经历都可能影响记录。没有经过验证的同龄人排名、诊断或稳定能力结论。",
  reportReading: {
    ...previous.reportReading!,
    version: '1.1.0',
    title: "在符号堆里，找到这一轮的目标",
    introduction: "先认准本轮目标，再逐行找相同符号。点亮想选的格子，也可以再点一次取消；换轮时记得重新看目标。",
    summaryByProfile: {
      ...previous.reportReading!.summaryByProfile,
      experience: { ...(previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary), template: "这次短体验：" + (previous.reportReading!.summaryByProfile?.experience ?? previous.reportReading!.summary).template + " 只描述本次记录，不能据此认定稳定能力。" },
    },
    nextStep: "先认准目标，再按行或按列寻找。注意别为了多点而忽略相似符号；新一轮开始时重新确认目标。",
    popular: {
      ...previous.reportReading!.popular!,
      metricHelp: {
        ...previous.reportReading!.popular!.metricHelp,
        hitRate: { ...previous.reportReading!.popular!.metricHelp.hitRate, label: "目标找到的比例", explanation: previous.reportReading!.popular!.metricHelp.hitRate?.explanation ?? previous.metrics.hitRate.explanation ?? "目标找到的比例" },
        falseAlarmRate: { ...previous.reportReading!.popular!.metricHelp.falseAlarmRate, label: "点亮格子中的误选比例", explanation: previous.reportReading!.popular!.metricHelp.falseAlarmRate?.explanation ?? previous.metrics.falseAlarmRate.explanation ?? "点亮格子中的误选比例" },
        hitCount: { ...previous.reportReading!.popular!.metricHelp.hitCount, label: "找到的目标数", explanation: previous.reportReading!.popular!.metricHelp.hitCount?.explanation ?? previous.metrics.hitCount.explanation ?? "找到的目标数" },
        missCount: { ...previous.reportReading!.popular!.metricHelp.missCount, label: "没选中的目标数", explanation: previous.reportReading!.popular!.metricHelp.missCount?.explanation ?? previous.metrics.missCount.explanation ?? "没选中的目标数" },
        falseAlarmCount: { ...previous.reportReading!.popular!.metricHelp.falseAlarmCount, label: "误选格子数", explanation: previous.reportReading!.popular!.metricHelp.falseAlarmCount?.explanation ?? previous.metrics.falseAlarmCount.explanation ?? "误选格子数" }
      },
      frames: [{"title": "认准本轮目标", "text": "每轮先看清目标字母。"}, {"title": "有顺序地找", "text": "可以按行或按列寻找，留意相似字母。"}, {"title": "核对选中格", "text": "选中后还可取消，别把相似字母当作目标。"}],
      conceptTitle: '这个小游戏在观察什么',
      concept: "一屏80格，包含16个目标和64个相似干扰项。找到了多少目标、点亮的格子中有多少不是目标，是两个不同问题。",
      takeaway: "找到的目标比例以有效轮次目标总数为分母；误选比例以点亮格子总数为分母。一个都没点时，误选比例缺失，不是0误选率。",
      exampleTitle: '把过程放进一个生活场景',
      example: "在书架上找同一系列的书时，既可能漏看，也可能把相似封面认错。这是搜索过程的例子，不是现实注意力或阅读困难诊断。",
      boundary: "体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。",
    },
    professional: {
      ...previous.reportReading!.professional!,
      configFields: [{"key": "totalTrials", "label": "计划正式题数/轮数"}, {"key": "durationMs", "label": "每轮最长时长（毫秒）"}, {"key": "stimulusSetVersion", "label": "刺激集版本"}],
      procedure: previous.reportReading!.professional!.procedure + " 方法与文献核对：研究档4轮，每轮10×8网格、16目标/64干扰、最多45秒且可提前结束；轮前500毫秒，练习1轮独立种子且无达标门槛，目标按Q/R/F/P逐轮变化。Hogrefe官方d2-R电子版为14屏、每屏60个d/p带短划符号、20秒/屏；本项目材料、目标、轮数和时长均不同，是项目视觉搜索变式，不转用d2-R常模或可靠性数值。",
      interpretation: "研究版是本项目的较长配置，不是标准化或信效度认证。体验1轮最多45秒，含16个目标；这些格子共享同一屏幕与搜索过程，不是16次独立测量。只有一轮，不能推断持续注意随时间变化；字母熟悉程度、屏幕与点击方式会影响结果。",
      confounders: [...previous.reportReading!.professional!.confounders, '题量和条件内有效记录较少时，单次差值容易波动；本项目未测定本档指标的重测可靠性。'],
    },
  },
}))
