import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "提示出现后，多久作出反应";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像听到提示音后点一下，这里记录电脑上的一次提示与按键过程，不是纯听觉神经传导速度。";
    r.nextStep = "先确认音量舒适、环境安静，比较时保持设备与输入方式一致。一次短体验不能判断反应能力或健康状况。";
    next.practicalTips = ["先确认音量舒适、环境安静，比较时保持设备与输入方式一致。一次短体验不能判断反应能力或健康状况。"];
    const labels = { "medianRtMs": "典型有效反应用时（中位数）", "meanRtMs": "有效反应平均用时", "anticipationCount": "过早反应次数" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像听到提示音后点一下，这里记录电脑上的一次提示与按键过程，不是纯听觉神经传导速度。";
        r.popular.example = "当前同时出现可见提示；只汇总150–1000毫秒范围内的有效反应。耳机、音频延迟和设备会影响记录。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    r.summary = { template: '本次有效反应的典型用时为 {medianRtMs}；这是含设备影响的任务记录。', metricKeys: ['medianRtMs'] };
    r.summaryByProfile = {};
    if (r.popular)
        r.popular.takeaway = "提示出现再按，先看有效次数，再读这次设备上的用时。";
    if (r.professional) {
        r.professional.construct = "带同步视觉提示的浏览器合成音反应记录";
        r.professional.interpretation = "典型用时只汇总150–1000毫秒反应。图标同时可见，音频输出与输入延迟未校正；不是纯听觉加工速度。早按、漏失与中断需同读，跨设备不直接排快慢。";
    }
    if (r.professional)
        r.professional.procedure = '随机等待1–4秒后播放880Hz、120毫秒提示音，同步显示声音图标。1500毫秒响应窗中，150–1000毫秒才进入有效RT；输出延迟仅留痕，没有物理校准。';
    next.metrics.rtSdMs.label = '有效反应用时的波动大小';
    next.metrics.rtCv.label = '相对平均用时的波动比例';
    next.metrics.medianRtMs.explanation = '把150–1000毫秒内的有效反应用时排好序，取中间的代表值；偶数个时取中间两个的平均。1毫秒是千分之一秒，记录包含设备影响。';
    next.metrics.rtCv.explanation = '本次有效反应的标准差除以平均用时，描述相对波动，不是稳定能力或常模。';
    next.metrics.medianRtMs.singleExplanation = next.metrics.medianRtMs.explanation;
    if (r.professional) r.professional.metricNotes.rtSdMs = {definition: '本次有效RT相对均值的平方偏差，除以有效个数n后开方（总体口径）。', readingHint: '不是除以n−1的样本标准差；有效个数少时仅作本次描述。'};
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
