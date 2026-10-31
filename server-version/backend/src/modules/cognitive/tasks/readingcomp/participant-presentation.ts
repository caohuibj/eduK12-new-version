import { participantPresentations as legacy } from './participant-presentation.v1'
import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
const original = legacy[0]
const reading = original.reportReading!
export const participantPresentations: CognitiveParticipantPresentationV1[] = [...legacy, {
  ...original, presentationVersion: '1.1.0', engineVersion: '1.1.0', scoringVersion: '1.1.0',
  metrics: { ...original.metrics,
    accuracy: { label: '总体正确率', explanation: '全部正式题中答对的比例；超时也进入分母。零正确不等于没有作答。', singleExplanation: '全部正式题中答对的比例，包含超时题；不是人群排名。' },
    correctCount: { label: '答对题数', explanation: '本次正式题中选对的题数，零也是实际记录。' },
    answeredCount: { label: '已作答题数', explanation: '在时限内实际选择了选项的正式题数。' },
    timeoutCount: { label: '超时次数', explanation: '未在时限内回应的题数；不混为选择错误。' },
    medianRtMs: { label: '正确作答中位用时', explanation: '答对、未中断且不低于最低有效用时的反应中位数；没有合格反应时为空，不记成零。' },
  },
  practicalTips: ['先看问题要求，再回到短文定位证据；不要只凭印象选择。', '回顾是漏看条件还是推断过多；可用短文中的一句话核对自己的理解。'],
  disclaimer: '结果仅描述本次阅读理解表现，无常模、诊断、信效度或能力等级结论。',
  reportReading: {
    ...reading, version: '1.1.0', title: '这次阅读理解，你是怎样作答的？',
    introduction: '从答对、已回应和超时的数量开始理解本次记录，再谨慎查看用时。',
    summary: { template: '本次正式题中答对 {correctCount} 题，实际回应 {answeredCount} 题，超时 {timeoutCount} 题；总体正确率为 {accuracy}。', metricKeys: ['correctCount', 'answeredCount', 'timeoutCount', 'accuracy'] },
    summaryByProfile: { experience: { template: '本次简短体验总体正确率为 {accuracy}，实际回应 {answeredCount} 题，超时 {timeoutCount} 题。题目较少，不代表稳定能力。', metricKeys: ['accuracy', 'answeredCount', 'timeoutCount'] } },
    studentMetricKeys: ['accuracy', 'correctCount', 'answeredCount', 'timeoutCount', 'medianRtMs'],
    withholdFlags: ['noResponses'], metricGates: { medianRtMs: ['insufficientValidRt'] },
    nextStep: '先看问题要求，再回到短文定位证据；不要只凭印象选择。',
    popular: { ...reading.popular!, concept: '你会读到短文，并根据文字中的信息、条件和因果关系回答一个问题。题目不要求额外的科普知识；用原文比较四个选项。', example: '读活动通知时，同时看清日期、地点和适用条件，可以减少把不同安排混在一起的情况。', takeaway: '先看问题要求，再回到短文定位证据；不要只凭印象选择。',
      frames: [{ title: '读题', text: '先读完整材料和作答要求。' }, { title: '核对', text: '逐一比较选项与原文或原句。' }, { title: '作答', text: '在时限内选出唯一答案，不连按抢答。' }],
      metricHelp: { ...reading.popular!.metricHelp, errorCount: { label: '选错了几次', explanation: '实际回应但选择错误的次数，不含超时。' } },
    },
    professional: { ...reading.professional!, construct: '原创中文阅读理解任务表现',
      procedure: '题目集readingcomp-zh-v1.1.0冻结36道原创审订题，按seed不重复抽取18/30/36题；独立练习1题，答对后进入正式。每题15秒上限，全部正式题进入正确率分母。',
      interpretation: '仅描述本次正确率、作答数、错误数、超时数及合格正确反应中位用时。没有合格用时显示缺失；全部未回应不解释为能力零分。',
      metricNotes: { ...reading.professional!.metricNotes,
        accuracy: { definition: '答对正式题数除以计划且实际齐全的正式题数，超时进入分母。', readingHint: '与已回应、错选及超时数量同读；不是百分位。' },
        medianRtMs: { definition: '正确、未中断且validRtFloorMs≤rtMs≤timeoutMs反应的中位时间。', readingHint: '少于2个合格反应时仅保留原值，不解释稳定速度。' },
      },
    },
  },
}]
