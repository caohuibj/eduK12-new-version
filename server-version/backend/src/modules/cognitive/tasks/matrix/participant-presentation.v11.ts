import {participantPresentations as previous,reportRevision} from './report-review-20261101'
const revised=structuredClone(reportRevision)
revised.engineVersion='1.1.0';revised.presentationVersion='1.4.0'
revised.disclaimer='本项目自编矩阵任务，4道独立练习与正式题面隔离；正式池仍可能重复相同题面，不提供IQ、常模或稳定子能力结论。'
revised.reportReading!.version='1.4.0'
revised.reportReading!.professional!.procedure='4道独立教学矩阵；正式6/16/24试次及其seed序列、30秒时限、正确率分母和用时公式沿用1.0.0。新C只隔离练习题面，不改变正式刺激或评分。正式池在不同标签或选项布局下可能重复相同题面，不能把试次数称为独立新题数。范式来源：Raven, Matrix Tests (1940), https://pmc.ncbi.nlm.nih.gov/articles/PMC5092702/ 。本项目并非其标准复刻。'
for(const profile of ['experience','standard','research'] as const){
 const prior=revised.protocols[profile]!
 revised.protocols[profile]={...prior,reportCaveats:[...prior.reportCaveats,'C1.1.0采用4道独立练习；正式刺激池与评分未改，不能直接把跨版本差异解释为个人能力变化。']}
}
export const participantPresentations=[...previous,revised]
