import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "倒着复述一串数字";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像记下取件码后换个顺序复述，这里观察短暂记住并调整顺序的过程，不是给记忆力打总分。";
    r.nextStep = "先分清是漏记了数字，还是记住了却倒序放错。可在生活中一次只处理一小段信息。";
    next.practicalTips = ["先分清是漏记了数字，还是记住了却倒序放错。可在生活中一次只处理一小段信息。"];
    const labels = { "maxSpan": "最长正确倒背长度", "totalCorrectTrials": "完整答对次数", "sequenceDistance": "与目标顺序的差距", "medianResponseDurationMs": "典型输入用时（中位数）", "completedLevelCount": "完成的长度级数" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像记下取件码后换个顺序复述，这里观察短暂记住并调整顺序的过程，不是给记忆力打总分。";
        r.popular.example = "例如看到 3、8、2，需回答 2、8、3；不是把数字从大到小排序。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "倒着复述，既要留下数字，也要调整先后顺序。";
    if (r.professional) {
        r.professional.construct = "视觉数字倒序回忆的项目变式";
        r.professional.interpretation = "最高成功长度表示本次至少完整答对一题的最长数字串，不是个人记忆上限。每级两题全错停止；不同档位长度上限不同，不比较内部指数。";
        r.professional.metricNotes.sequenceDistance = { "definition": "每题相对倒序目标的位置不一致个数（含漏项）的均值，不是编辑距离。", "readingHint": "越小仅表示本次位置差异较少。" };
        r.professional.metricNotes.maxSpan = { "definition": "至少完整答对一题的最高长度；两题全错时停止。", "readingHint": "达到配置上限也不能称个人上限；不足两级时仅保留有限记录。" };
    }
    next.metrics.sequenceDistance = { ...next.metrics.sequenceDistance, explanation: "每题相对倒序目标的位置不一致个数（含漏项）的均值，不是编辑距离。 越小仅表示本次位置差异较少。", singleExplanation: "每题相对倒序目标的位置不一致个数（含漏项）的均值，不是编辑距离。 越小仅表示本次位置差异较少。" };
    if (r.popular?.metricHelp.sequenceDistance)
        r.popular.metricHelp.sequenceDistance = { label: next.metrics.sequenceDistance.label, explanation: "每题相对倒序目标的位置不一致个数（含漏项）的均值，不是编辑距离。 越小仅表示本次位置差异较少。" };
    next.metrics.maxSpan = { ...next.metrics.maxSpan, explanation: "至少完整答对一题的最高长度；两题全错时停止。 达到配置上限也不能称个人上限；不足两级时仅保留有限记录。", singleExplanation: "至少完整答对一题的最高长度；两题全错时停止。 达到配置上限也不能称个人上限；不足两级时仅保留有限记录。" };
    if (r.popular?.metricHelp.maxSpan)
        r.popular.metricHelp.maxSpan = { label: next.metrics.maxSpan.label, explanation: "至少完整答对一题的最高长度；两题全错时停止。 达到配置上限也不能称个人上限；不足两级时仅保留有限记录。" };
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
