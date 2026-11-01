import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "在声音流中跟踪前面的音";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像在一串提示音中跟踪刚才出现过的音，这里观察本次音高匹配，不给记忆能力定级。";
    r.nextStep = "先看实际匹配与非匹配次数。短版目标数可能不足，不能把无结果或低值当作能力不足；噪声与音高辨别也会影响表现。";
    next.practicalTips = ["先看实际匹配与非匹配次数。短版目标数可能不足，不能把无结果或低值当作能力不足；噪声与音高辨别也会影响表现。"];
    const labels = { "dPrime": "匹配区分指标（d′）", "hitRate": "匹配声音的命中比例", "falseAlarmRate": "非匹配声音的误报比例", "medianHitRtMs": "匹配命中的典型用时", "matchCount": "实际匹配机会数", "nonmatchCount": "实际非匹配机会数" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像在一串提示音中跟踪刚才出现过的音，这里观察本次音高匹配，不给记忆能力定级。";
        r.popular.example = "d′是把命中与误报合起来看的区分指标，不是正确率、百分位或能力分；目标次数不足时不解释它。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    r.summaryByProfile = { ...r.summaryByProfile, experience: { template: '这次短程声音跟踪中，实际匹配机会有 {matchCount}，非匹配机会有 {nonmatchCount}；机会少时不解释区分指标。', metricKeys: ['matchCount', 'nonmatchCount'] } };
    if (r.popular)
        r.popular.takeaway = "把现在的音与隔一个的音比较；没有匹配时不按也是任务的一部分。";
    if (r.professional) {
        r.professional.construct = "五纯音固定2-back的项目变式";
        r.professional.interpretation = "开头两个音不进命中/误报分母；后续不按目标算漏按，不按非目标算正确拒绝。目标数由随机过程决定，不是固定30%。d′用了加0.5的极端比例修正；目标少于6时不解释，体验档通常不足。";
        r.professional.metricNotes.matchCount = { "definition": "前两个音后，实际与隔一个声音相同的可评分机会数。", "readingHint": "不是计划总音数的固定30%；需看实际数量。" };
        r.professional.metricNotes.nonmatchCount = { "definition": "前两个音后，实际不同的可评分机会数。", "readingHint": "不按这些音是正确拒绝，不是缺失。" };
        r.professional.metricNotes.dPrime = { "definition": "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。", "readingHint": "合看两类反应；不是百分比、常模或能力分，机会不足不解释。" };
    }
    next.metrics.matchCount = { ...next.metrics.matchCount, explanation: "前两个音后，实际与隔一个声音相同的可评分机会数。 不是计划总音数的固定30%；需看实际数量。", singleExplanation: "前两个音后，实际与隔一个声音相同的可评分机会数。 不是计划总音数的固定30%；需看实际数量。" };
    if (r.popular?.metricHelp.matchCount)
        r.popular.metricHelp.matchCount = { label: next.metrics.matchCount.label, explanation: "前两个音后，实际与隔一个声音相同的可评分机会数。 不是计划总音数的固定30%；需看实际数量。" };
    next.metrics.nonmatchCount = { ...next.metrics.nonmatchCount, explanation: "前两个音后，实际不同的可评分机会数。 不按这些音是正确拒绝，不是缺失。", singleExplanation: "前两个音后，实际不同的可评分机会数。 不按这些音是正确拒绝，不是缺失。" };
    if (r.popular?.metricHelp.nonmatchCount)
        r.popular.metricHelp.nonmatchCount = { label: next.metrics.nonmatchCount.label, explanation: "前两个音后，实际不同的可评分机会数。 不按这些音是正确拒绝，不是缺失。" };
    next.metrics.dPrime = { ...next.metrics.dPrime, explanation: "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。", singleExplanation: "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。" };
    if (r.popular?.metricHelp.dPrime)
        r.popular.metricHelp.dPrime = { label: next.metrics.dPrime.label, explanation: "Z((命中数+0.5)/(目标数+1)) − Z((误报数+0.5)/(非目标数+1))。 合看两类反应；不是百分比、常模或能力分，机会不足不解释。" };
    if (r.popular) {
        r.popular.example = '像听一段旋律时发现同一个音再次出现；本任务只把现在的音与隔一个的音比较，不代表日常音乐或记忆能力。d′把命中与误报合起来看，不是正确率、百分位或能力分。';
        r.popular.frames = [{ title: '听当前的音', text: '先听清音高，开头两个音用于建立比较。' }, { title: '和隔一个的音比较', text: '相同就按，不相同就不按。' }, { title: '继续跟住声音', text: '每出现一个新音，就重新比较。' }];
    }
    next.experienceHeadline = 'matchCount';
    r.studentMetricKeys = ['matchCount', 'nonmatchCount', 'hitRate'];
    r.processMetricKeys = ['matchCount', 'nonmatchCount'];
    r.hiddenByProfile = { ...r.hiddenByProfile, experience: [...new Set([...(r.hiddenByProfile?.experience ?? []), 'dPrime', 'medianHitRtMs'])] };
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
