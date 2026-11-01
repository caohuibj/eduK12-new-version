import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "跟住不断变化的最后几项";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像在滚动消息里记住最后几条，这里观察序列结束后能否按顺序找回末尾内容。";
    r.nextStep = "可以留意漏填和顺序颠倒，不急着给自己贴标签；保持更新或结束后提取都可能参与，结果不能分离具体策略。";
    next.practicalTips = ["可以留意漏填和顺序颠倒，不急着给自己贴标签；保持更新或结束后提取都可能参与，结果不能分离具体策略。"];
    const labels = { "runningSpanAccuracy": "已填位置的顺序正确比例", "intrusionRate": "已填位置中的目标外字母比例", "totalCorrectPositions": "字母和位置都正确的个数", "medianResponseMs": "典型回忆用时（中位数）" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像在滚动消息里记住最后几条，这里观察序列结束后能否按顺序找回末尾内容。";
        r.popular.example = "本次正确率只计算已经填入的位置，空格不进分母；必须同时看填写量，不能把高比例当作完整回忆。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    r.summary = { template: '已经填入的位置中，字母和顺序都对的比例为 {runningSpanAccuracy}。空缺位置不在这个分母中，请同时看本次填写与完成情况。', metricKeys: ['runningSpanAccuracy'] };
    r.summaryByProfile = {};
    if (r.popular)
        r.popular.takeaway = "序列停下后，按顺序找回最后几个；不同人可能采用不同策略。";
    if (r.popular)
        r.popular.frames = [{ "title": "看字母出现", "text": "字母逐个出现，序列长短不固定。" }, { "title": "等序列停止", "text": "记住最后三个，策略可以不同。" }, { "title": "按序找回", "text": "填写量和填写准确程度要一起读。" }];
    if (r.professional) {
        r.professional.construct = "不定长视觉字母序列的末尾回忆";
        r.professional.interpretation = "已填位置准确率不包含空缺，需结合正确总数和中断情况。持续更新、复述或结束后提取都可能参与，不能据此分离单一更新机制。";
    }
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
