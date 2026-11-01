import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previous } from './participant-presentation.r1'

export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  ...previous,
  {
    ...previous[0], engineVersion: '1.1.0', presentationVersion: '1.3.1',
    metrics: { ...previous[0].metrics, trialsToAcquisitionCriterion: { ...previous[0].metrics.trialsToAcquisitionCriterion, label: '变化前达到设定连续正确次数所需题数' }, trialsToReversalCriterion: { ...previous[0].metrics.trialsToReversalCriterion, label: '变化后达到设定连续正确次数所需题数' } },
    disclaimer: '本项目固定一次反转变式。统一负反馈且不显示阶段；研究档30题无反转练习、2秒响应、500毫秒反馈。不代表原研究完整复刻、稳定能力或诊断。',
    protocols: {
      ...previous[0].protocols,
      research: { ...previous[0].protocols.research!, participantConclusion: '这次记录描述固定一次规则反转前后的选择变化。', reportCaveats: ['正式240题120/120；研究档先做30题无反转概率练习，每题2秒，反馈保留500毫秒。原文多组、多次且按表现反转，本项目仍为研究变式。'] },
    },
    reportReading: {
      ...previous[0].reportReading!, version: '1.2.1',
      professional: {
        ...previous[0].reportReading!.professional!,
        procedure: '本项目正确选择正反馈概率由冻结rewardProbability决定（默认0.8），错误选择正反馈概率0；新版两类负反馈文字相同，正式界面不显示阶段，反馈至少500毫秒。研究档30题无反转练习及2秒响应依据Cools et al. 2002 Materials and Methods；不是双选项80/20模型。原文没有指定独立固定0.8概率，不能据此称本参数已复刻原协议。项目正式仍240题固定一次反转，原文三组多次反转/特定误导反馈串未实现。',
      },
    },
  },
]
