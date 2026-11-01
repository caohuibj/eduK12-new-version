import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "读过一组词后，能想起哪些";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像过一会儿回想购物清单，这里记录每轮实际回忆出的目标词，不判断你是否健忘。";
    r.nextStep = "可以比较每轮是否想起更多词。识字、词语熟悉度和输入方式都会影响结果，不能据此判断记忆障碍。";
    next.practicalTips = ["可以比较每轮是否想起更多词。识字、词语熟悉度和输入方式都会影响结果，不能据此判断记忆障碍。"];
    const labels = { "immediateAccuracy": "即时回忆正确比例", "totalImmediateCorrect": "各即时轮正确个数之和", "intrusionCount": "非目标词记录数", "delayedAccuracy": "延迟轮正确比例" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像过一会儿回想购物清单，这里记录每轮实际回忆出的目标词，不判断你是否健忘。";
        r.popular.example = "同一个词在一轮只计一次；跨多轮可以再次计入，所以累计个数不是不同词的总量。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "一轮里同一个词只计一次；多轮记录可以重复计入。";
    if (r.professional) {
        r.professional.construct = "自编中文视觉词表的键盘自由回忆";
        r.professional.interpretation = "当前没有再认或干扰词表。即时正确率取最后即时轮；累计正确数可跨轮重复。研究档只等60秒；延迟未完成为 null，不是零分。识字和输入同样影响记录。";
        r.professional.metricNotes.immediateAccuracy = { "definition": "最后即时学习轮的不同正确目标词数 / 本轮目标词数。", "readingHint": "不是所有即时轮平均正确率。" };
        r.professional.metricNotes.delayedRecallAccuracy = { "definition": "延迟轮不同正确目标词数 / 目标词数；空回忆或中断（含60秒自动提交）时为 null。", "readingHint": "研究档60秒短等待，不解释为长期记忆。" };
    }
    next.metrics.immediateAccuracy.label = '最后即时轮回忆正确比例';
    next.metrics.delayedRecallAccuracy.label = '短延迟轮回忆正确比例';
    r.summary = { template: '最后一轮即时回忆的正确比例为 {immediateAccuracy}；各即时轮累计正确记录为 {totalImmediateCorrect} 个（跨轮可重复）。', metricKeys: ['immediateAccuracy', 'totalImmediateCorrect'] };
    r.summaryByProfile = {};
    next.metrics.immediateAccuracy = { ...next.metrics.immediateAccuracy, explanation: "最后即时学习轮的不同正确目标词数 / 本轮目标词数。 不是所有即时轮平均正确率。", singleExplanation: "最后即时学习轮的不同正确目标词数 / 本轮目标词数。 不是所有即时轮平均正确率。" };
    if (r.popular?.metricHelp.immediateAccuracy)
        r.popular.metricHelp.immediateAccuracy = { label: next.metrics.immediateAccuracy.label, explanation: "最后即时学习轮的不同正确目标词数 / 本轮目标词数。 不是所有即时轮平均正确率。" };
    next.metrics.delayedRecallAccuracy = { ...next.metrics.delayedRecallAccuracy, explanation: "延迟轮不同正确目标词数 / 目标词数；空回忆或中断（含60秒自动提交）时为 null。 研究档60秒短等待，不解释为长期记忆。", singleExplanation: "延迟轮不同正确目标词数 / 目标词数；空回忆或中断（含60秒自动提交）时为 null。 研究档60秒短等待，不解释为长期记忆。" };
    if (r.popular?.metricHelp.delayedRecallAccuracy)
        r.popular.metricHelp.delayedRecallAccuracy = { label: next.metrics.delayedRecallAccuracy.label, explanation: "延迟轮不同正确目标词数 / 目标词数；空回忆或中断（含60秒自动提交）时为 null。 研究档60秒短等待，不解释为长期记忆。" };
    if (r.professional)
        r.professional.procedure = '自编中文词语逐个视觉呈现，多轮键盘自由回忆；无再认或干扰表。研究档五轮学习后等待60秒再回忆，服务端按冻结词表归一化精确匹配。';
    next.metrics.learningGain.label = '首末即时轮正确比例的变化';
    next.metrics.duplicateResponseCount.label = '同一轮重复输入的词数';
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
