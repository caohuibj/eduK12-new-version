import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "核对一句话和一幅图";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "这是自编的句图核对小游戏，记录本次判断与作答过程，不是标准语言或智力测验。";
    r.nextStep = "先看是否读清句子和图形。本版不解释否定加工代价，也不把高正确率当作语言理解能力。";
    next.practicalTips = ["先看是否读清句子和图形。本版不解释否定加工代价，也不把高正确率当作语言理解能力。"];
    const labels = { "accuracy": "本次题目判断正确率", "medianRtMs": "正确判断的典型用时", "negationPenaltyMs": "当前两类题目的用时差（不作能力解释）", "validRtCount": "有效正确作答数" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "这是自编的句图核对小游戏，记录本次判断与作答过程，不是标准语言或智力测验。";
        r.popular.example = "例如核对一句颜色说明与图标是否相符；当前真假与否定条件混淆，结果不能分离否定理解能力。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    next.hiddenMetrics = [...new Set([...next.hiddenMetrics, 'negationPenaltyMs'])];
    next.singleHiddenMetrics = [...new Set([...next.singleHiddenMetrics, 'negationPenaltyMs'])];
    r.studentMetricKeys = r.studentMetricKeys.filter(k => k !== 'negationPenaltyMs');
    r.processMetricKeys = r.processMetricKeys.filter(k => k !== 'negationPenaltyMs');
    if (r.chart)
        r.chart.metricKeys = r.chart.metricKeys.filter(k => k !== 'negationPenaltyMs');
    r.summaryByProfile = {};
    if (r.popular)
        r.popular.takeaway = "先读清句子，再核对图形；当前条件混淆限制了结果解释。";
    if (r.professional) {
        r.professional.construct = "自编句图相符判断（真伪与否定条件混淆）";
        r.professional.interpretation = "当前否定句与真命题重合、肯定句与假命题重合；用时差无法分离否定加工。只描述本次正确、超时及有效作答，不据此推断语言理解能力。";
        r.professional.metricNotes.negationPenaltyMs = { "definition": "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。", "readingHint": "新报告不展示该差值，不作否定加工解释。" };
    }
    r.summary = { "template": "这次题目判断正确率为 {accuracy}。当前真假与否定条件混淆，不能据此分离语言理解能力。", "metricKeys": ["accuracy"] };
    next.metrics.negationPenaltyMs = { ...next.metrics.negationPenaltyMs, explanation: "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。 新报告不展示该差值，不作否定加工解释。", singleExplanation: "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。 新报告不展示该差值，不作否定加工解释。" };
    if (r.popular?.metricHelp.negationPenaltyMs)
        r.popular.metricHelp.negationPenaltyMs = { label: next.metrics.negationPenaltyMs.label, explanation: "否定正确反应中位数减肯定正确反应中位数；当前两类同时混入真假差异。 新报告不展示该差值，不作否定加工解释。" };
    if (r.popular)
        delete r.popular.metricHelp.negationPenaltyMs;
    if (r.professional) r.professional.procedure = '自编颜色/形状句子与图形核对。服务端按回显形状、颜色和问值推导真假；正确率以计划题数为分母，正确且至少300毫秒的反应进入用时统计。当前真假与否定重合，新报告不展示否定差值。';
    for (const [key, metric] of Object.entries(next.metrics)) {
        if (r.popular?.metricHelp[key])
            r.popular.metricHelp[key] = { label: metric.label, explanation: metric.explanation ?? r.popular.metricHelp[key].explanation };
    }
    for (const p of Object.values(next.protocols)) {
        if (p) {
            p.participantConclusion = '这里描述本次任务记录，不代表稳定能力。';
            p.showProductIndex = false;
        }
    }
    return next;
});
