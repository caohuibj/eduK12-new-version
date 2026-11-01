import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "把一组图片重新排成顺序";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像复述一段小故事的先后顺序，这里看的是学习后还原这组卡片的表现。";
    r.nextStep = "对照最后一轮与前几轮，看自己更容易记住相邻关系，还是固定位置。少量题目不代表日常记忆水平。";
    next.practicalTips = ["对照最后一轮与前几轮，看自己更容易记住相邻关系，还是固定位置。少量题目不代表日常记忆水平。"];
    const labels = { "positionScore": "最后一轮位置正确比例", "adjacentPairScore": "最后一轮相邻顺序正确比例", "learningGain": "首末轮的变化" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像复述一段小故事的先后顺序，这里看的是学习后还原这组卡片的表现。";
        r.popular.example = "例如先整理书包、再出门、最后到校；题目用自制卡片，当前是整板展示而非逐图讲故事。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "既看卡片各在第几位，也看谁紧挨着谁。";
    if (r.professional) {
        r.professional.construct = "整组图片排序的项目试测";
        r.professional.interpretation = "主要比例取最后学习轮，不是跨轮平均。首末变化和短延迟变化仅是本次比例差；不能等同学习速度、长期保持率或临床遗忘。";
        r.professional.metricNotes.delayedRetention = { "definition": "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。", "readingHint": "本研究档等待仅30秒；负值不代表异常遗忘。" };
        r.professional.metricNotes.learningGain = { "definition": "最后学习轮相邻对比例减第一轮比例。", "readingHint": "不等同经过验证的学习速度。" };
    }
    next.metrics.delayedRetention.label = '短延迟与最后即时轮的比例差';
    next.metrics.delayedRetention = { ...next.metrics.delayedRetention, explanation: "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。 本研究档等待仅30秒；负值不代表异常遗忘。", singleExplanation: "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。 本研究档等待仅30秒；负值不代表异常遗忘。" };
    if (r.popular?.metricHelp.delayedRetention)
        r.popular.metricHelp.delayedRetention = { label: next.metrics.delayedRetention.label, explanation: "延迟轮相邻对比例减最后即时轮相邻对比例；不是保持比值。延迟缺席、中断或未排满时为 null。 本研究档等待仅30秒；负值不代表异常遗忘。" };
    next.metrics.learningGain = { ...next.metrics.learningGain, explanation: "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。", singleExplanation: "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。" };
    if (r.popular?.metricHelp.learningGain)
        r.popular.metricHelp.learningGain = { label: next.metrics.learningGain.label, explanation: "最后学习轮相邻对比例减第一轮比例。 不等同经过验证的学习速度。" };
    if (r.professional)
        r.professional.procedure = '整组自制图片、文字与序号同时学习，每项折合900毫秒；随后重排顺序。目标顺序固定，候选位置按种子洗牌；研究档三轮后等30秒再排序。';
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
