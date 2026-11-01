import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "把混排的字母和数字重新整理";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像把一串混排标签重新分组，这里是看屏幕后整理顺序的小游戏，不是听力或标准韦氏测验。";
    r.nextStep = "区分漏记、分组和排序错误；不把本次几轮结果当作一般工作记忆分数。";
    next.practicalTips = ["区分漏记、分组和排序错误；不把本次几轮结果当作一般工作记忆分数。"];
    const labels = { "overallAccuracy": "已填位置的重排正确比例", "lettersAccuracy": "字母部分正确比例", "digitsAccuracy": "数字部分正确比例" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像把一串混排标签重新分组，这里是看屏幕后整理顺序的小游戏，不是听力或标准韦氏测验。";
        r.popular.example = "先按本任务规则排列字母，再整理数字；成绩按位置计，不等于整串都完整答对。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "先看清并记住，再按本任务规则把字母和数字分开整理。";
    if (r.professional) {
        r.professional.construct = "视觉、固定长度的字母数字重排项目变式";
        r.professional.interpretation = "准确率按未中断题的各个位置计分，固定每题4字母+3数字；不是整串全对率。先排字母再排数字，视觉按钮输入，不是韦氏原测验、听觉记忆或广度。";
        r.professional.metricNotes.overallAccuracy = { "definition": "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。", "readingHint": "中断题整体排除，不能只凭高比例推断完整表现。" };
    }
    next.metrics.overallAccuracy.label = '未中断题目的位置重排正确率';
    r.summaryByProfile = {};
    next.metrics.overallAccuracy = { ...next.metrics.overallAccuracy, explanation: "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。", singleExplanation: "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。" };
    if (r.popular?.metricHelp.overallAccuracy)
        r.popular.metricHelp.overallAccuracy = { label: next.metrics.overallAccuracy.label, explanation: "未中断题中字母和数字的正确位置数 /（7 × 未中断题数）；全中断时为 null。 中断题整体排除，不能只凭高比例推断完整表现。" };
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
