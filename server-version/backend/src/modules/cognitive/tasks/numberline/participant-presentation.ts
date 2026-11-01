import type { CognitiveParticipantPresentationV1 } from '../../participant-presentation.types'
import { participantPresentations as previous } from './participant-presentation.r1'
export const participantPresentations: CognitiveParticipantPresentationV1[] = [
  ...previous,
  { ...previous[0], engineVersion: '1.1.0', scoringVersion: '1.1.0', presentationVersion: '1.1.1', title: '数字到位置估计（NP数字适配）',
    practicalTips: ['回看本次回应数量和位置误差；不据六个点给自己贴能力类型标签。'],
    disclaimer: '本项目NP单范围六点数字适配，不是完整NP/PN研究、纸笔25厘米复刻或年龄常模。',
    protocols: {},
    reportReading: {
      ...previous[0].reportReading!, version: '1.1.1', title: '这次，数字被放在了哪里？',
      introduction: '你这次在一个固定范围内估计六个数字的位置。先看回应数量，再看与目标的平均距离。',
      nextStep: '结合本次范围、预定作答时限和回应数阅读位置误差；不把六次估计拟合成个人能力类型。',
      popular: { ...previous[0].reportReading!.popular!, concept: '这个任务只观察数字到位置的对应：看到数字，再在线段上点击你估计的位置。', takeaway: '单范围六点只描述本次估计，不代表稳定数感或同龄排名。', boundary: '范围、A/B及4或30秒在配置中冻结；没有中点策略教学、正确位置练习反馈或15%练习门槛。', frames: [{ title: '读范围和数字', text: '确认线段两个端点，再读本题数字。' }, { title: '给出位置', text: '在预定时间内点击估计的位置。' }, { title: '回看记录', text: '六次误差和缺失分别保留，不补零。' }] },
      professional: { ...previous[0].reportReading!.professional!,
        procedure: '依据Siegler & Opfer (2003), DOI 10.1111/1467-9280.02438 Method，冻结0–100或0–1000单范围A/B六个原选点，块内种子洗牌，预定4或30秒。两范围通过既有独立配置安排，不新增混合范围/PN/双session调度。网页无中点/四分位参照刻度，只端点；一题中性点击练习无正确位置反馈。数字界面不声称物理25厘米或时序已校准。',
        interpretation: '本次单范围六点描述性记录，不判定线性/对数表征类型；原研究的NP/PN、两session设计未整体复刻。',
        configFields: [{ key: 'lineMax', label: '本次范围右端数值' }, { key: 'targetSet', label: '冻结选点组' }, { key: 'maxResponseMs', label: '预定响应上限（毫秒）' }, { key: 'totalTrials', label: '正式点数' }, { key: 'stimulusSetVersion', label: '数值设置版本' }],
      },
    },
  },
]
