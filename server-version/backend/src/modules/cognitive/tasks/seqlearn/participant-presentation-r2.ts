import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "重复操作中，有没有逐渐熟悉";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像反复熟悉一组操作顺序，这里比较特定位置规律与随机位置区组中的本次反应。";
    r.nextStep = "先看正确率，再把用时差当作本次任务中的现象；不能据此推断稳定学习能力或日常技能。";
    next.practicalTips = ["先看正确率，再把用时差当作本次任务中的现象；不能据此推断稳定学习能力或日常技能。"];
    const labels = { "srtPatternAdvantageMs": "随机与后期规律区组的用时差", "medianRtLatePatternMs": "后期规律区组典型用时", "medianRtRandomMs": "随机区组典型用时", "medianRtEarlyPatternMs": "早期规律区组典型用时" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像反复熟悉一组操作顺序，这里比较特定位置规律与随机位置区组中的本次反应。";
        r.popular.example = "随机区组是与最后两个规律区组比较，并非同一时刻的公平对照；练习、疲劳也会影响差值。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "重复操作可能逐渐熟悉，但一次速度差还不能说明为什么。";
    if (r.professional) {
        r.professional.construct = "四位置重复序列反应时的项目变式";
        r.professional.interpretation = "差值是随机块正确反应中位数减最后两个模式块的中位数；正值只表示本次后期模式块更快。体验比较B3与B2+B4，研究比较B6与B9+B10；没有觉察测量，不能据此断言隐性学习。";
    }
    r.summary = { "template": "随机与后期规律区组的用时差为 {srtPatternAdvantageMs}；本次总体正确率为 {accuracy}。", "metricKeys": ["srtPatternAdvantageMs", "accuracy"] };
    next.metrics.srtPatternAdvantageMs.explanation = '随机区组与最后两个规律区组的正确反应典型用时之差。正值只表示本次后期规律区组更快，不能单独证明学习能力。';
    next.metrics.srtPatternAdvantageMs.singleExplanation = next.metrics.srtPatternAdvantageMs.explanation;
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
