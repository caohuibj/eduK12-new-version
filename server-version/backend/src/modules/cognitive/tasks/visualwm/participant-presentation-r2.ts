import { participantPresentations as previous } from './participant-presentation';
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types';
export const participantPresentations: CognitiveParticipantPresentationV1[] = previous.map(old => {
    const next = structuredClone(old);
    next.presentationVersion = '2.0.0';
    next.title = "短暂看过颜色，还能发现变化吗";
    const r = next.reportReading!;
    r.version = '2.0.0';
    r.title = next.title;
    r.introduction = "像短暂看见一组彩色便签后核对变化，这里记录本次颜色判断，不是视力或记忆容量诊断。";
    r.nextStep = "同时看发现变化和误报，不只追求按得快。当前练习复用了正式首题，应把短版结果视为受熟悉效应影响的体验。";
    next.practicalTips = ["同时看发现变化和误报，不只追求按得快。当前练习复用了正式首题，应把短版结果视为受熟悉效应影响的体验。"];
    const labels = { "accuracy": "全计划题目的判断正确率", "hitRate": "变化题中发现变化的比例", "falseAlarmRate": "未变题中误报改变的比例", "medianRtMs": "已答有效判断的典型用时" };
    for (const [key, label] of Object.entries(labels)) {
        if (next.metrics[key])
            next.metrics[key] = { ...next.metrics[key], label };
    }
    if (r.popular) {
        r.popular.concept = "像短暂看见一组彩色便签后核对变化，这里记录本次颜色判断，不是视力或记忆容量诊断。";
        r.popular.example = "命中是发现了真的变化，误报是未变却按了改变。屏幕颜色与命名策略也会影响表现。";
        r.popular.boundary = '生活例子只帮助理解任务，不代表已验证的日常能力预测、常模或诊断。';
    }
    if (r.popular)
        r.popular.takeaway = "发现真变化与少报假变化，都要一起看。";
    if (r.professional) {
        r.qualityLabels = { ...r.qualityLabels, insufficientValidRt: '有效已答反应不足（包括错误作答）' };
        r.professional.construct = "环形颜色阵列、带位置线索的变化判断项目变式";
        r.professional.interpretation = "正确率以全计划题数为分母，命中与误报以未中断且已答的各类题为分母。当前练习复用正式首题，短版有熟悉效应；不计算容量K或d′，不沿用原论文容量阈值。";
        r.professional.metricNotes.medianRtMs = { "definition": "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。", "readingHint": "不是仅正确反应用时；颜色显示与输入设备也会影响记录。" };
        r.professional.metricNotes.hitRate = { "definition": "未中断且已答的变化题中，正确报告改变的比例。", "readingHint": "机会数少时比例易波动；某类无有效题时为 null。" };
        r.professional.metricNotes.falseAlarmRate = { "definition": "未中断且已答的未变题中，错误报告改变的比例。", "readingHint": "不要只看命中而忽略误报。" };
    }
    next.metrics.medianRtMs = { ...next.metrics.medianRtMs, explanation: "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。 不是仅正确反应用时；颜色显示与输入设备也会影响记录。", singleExplanation: "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。 不是仅正确反应用时；颜色显示与输入设备也会影响记录。" };
    if (r.popular?.metricHelp.medianRtMs)
        r.popular.metricHelp.medianRtMs = { label: next.metrics.medianRtMs.label, explanation: "未中断、已答且RT≥200毫秒的反应中位数，包括错误作答。 不是仅正确反应用时；颜色显示与输入设备也会影响记录。" };
    next.metrics.hitRate = { ...next.metrics.hitRate, explanation: "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。", singleExplanation: "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。" };
    if (r.popular?.metricHelp.hitRate)
        r.popular.metricHelp.hitRate = { label: next.metrics.hitRate.label, explanation: "未中断且已答的变化题中，正确报告改变的比例。 机会数少时比例易波动；某类无有效题时为 null。" };
    next.metrics.falseAlarmRate = { ...next.metrics.falseAlarmRate, explanation: "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。", singleExplanation: "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。" };
    if (r.popular?.metricHelp.falseAlarmRate)
        r.popular.metricHelp.falseAlarmRate = { label: next.metrics.falseAlarmRate.label, explanation: "未中断且已答的未变题中，错误报告改变的比例。 不要只看命中而忽略误报。" };
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
