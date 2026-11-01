import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "记住图形放在哪儿";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像记住钥匙放在哪个抽屉，这个小游戏记录图形与位置之间的联系如何被记住。";
    r.nextStep = "可以留意混淆是否集中在相似图形或相邻位置；这是本次配对记录，不是诊断。";
    next.practicalTips = ["可以留意混淆是否集中在相似图形或相邻位置；这是本次配对记录，不是诊断。"];
    const labels = { "immediateAccuracy": "最后即时轮答对比例", "trialsToCriterion": "首次达到本任务条件的轮次" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像记住钥匙放在哪个抽屉，这个小游戏记录图形与位置之间的联系如何被记住。";
        r.popular.example = "同一图形与固定位置配成一对；回忆时找回它的位置，不是判断图形好不好看。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "看见图形，试着找回它原来所在的位置。";
    if (r.professional) {
        r.professional.construct = "固定轮次的图形—位置配对项目变式";
        r.professional.interpretation = "最后即时轮准确率与逐轮记录一起读。首次达到80%的轮次是事后描述，并不让任务提前停止；研究档仅30秒延迟。不能称CANTAB原版或诊断。";
        r.professional.metricNotes.trialsToCriterion = { "definition": "首次有至少80%配对正确的学习轮次；所有固定轮次仍继续，未达到为 null。", "readingHint": "这是本任务设定的条件，不是年龄或临床达标线。" };
        r.professional.metricNotes.learningSlope = { "definition": "末轮准确率减首轮准确率，再除以学习轮数减1。", "readingHint": "是首末平均变化，不是拟合回归斜率。" };
    }
    next.metrics.trialsToCriterion = { ...next.metrics.trialsToCriterion, explanation: "首次有至少80%配对正确的学习轮次；所有固定轮次仍继续，未达到为 null。 这是本任务设定的条件，不是年龄或临床达标线。", singleExplanation: "首次有至少80%配对正确的学习轮次；所有固定轮次仍继续，未达到为 null。 这是本任务设定的条件，不是年龄或临床达标线。" };
    if (r.popular?.metricHelp.trialsToCriterion)
        r.popular.metricHelp.trialsToCriterion = { label: next.metrics.trialsToCriterion.label, explanation: "首次有至少80%配对正确的学习轮次；所有固定轮次仍继续，未达到为 null。 这是本任务设定的条件，不是年龄或临床达标线。" };
    next.metrics.learningSlope = { ...next.metrics.learningSlope, explanation: "末轮准确率减首轮准确率，再除以学习轮数减1。 是首末平均变化，不是拟合回归斜率。", singleExplanation: "末轮准确率减首轮准确率，再除以学习轮数减1。 是首末平均变化，不是拟合回归斜率。" };
    if (r.popular?.metricHelp.learningSlope)
        r.popular.metricHelp.learningSlope = { label: next.metrics.learningSlope.label, explanation: "末轮准确率减首轮准确率，再除以学习轮数减1。 是首末平均变化，不是拟合回归斜率。" };
    next.metrics.learningSlope.label = '首末学习轮的平均比例变化';
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
