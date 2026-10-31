/**
 * Internal DRAFT Chinese proofreading bank (proofread-zh-v1.0.0).
 * Original sentences authored for this pilot; each answerIndex verified by hand.
 * 每题：一个含错句子，四个选项指出错误的字/词（或"没有错误"）。
 */
export const PROOFREAD_STIMULUS_SET_VERSION = 'proofread-zh-v1.0.0'

export type ProofreadItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const PROOFREAD_BANK: ProofreadItem[] = [
  { id: 'pf-01', band: 1, stem: '他今天很高兴，一路上说说笑笑，不知不觉就到了校圆。', options: ['高兴', '说说笑笑', '不知不觉', '校圆'], answer: 3 },
  { id: 'pf-02', band: 1, stem: '我们要爱护公物，不要在墙上乱涂乱画，更不要猜坏花草树木。', options: ['爱护', '乱涂乱画', '猜坏', '花草树木'], answer: 2 },
  { id: 'pf-03', band: 1, stem: '老师常常告戒我们，做事要认真细心，不能马虎大意。', options: ['常常', '告戒', '认真细心', '马虎大意'], answer: 1 },
  { id: 'pf-04', band: 2, stem: '他的成积一直在班里名列前矛，这次考试又得了第一名。', options: ['成积', '名列前矛', '考试', '第一名'], answer: 0 },
  { id: 'pf-05', band: 2, stem: '这本小说情节曲拆离奇，读起来引人入胜，让人爱不释手。', options: ['情节', '曲拆离奇', '引人入胜', '爱不释手'], answer: 1 },
  { id: 'pf-06', band: 2, stem: '虽然天气很热，但是他还是坚持锻练身体，从不间断。', options: ['天气很热', '坚持锻练', '从不间断', '虽然'], answer: 1 },
  { id: 'pf-07', band: 2, stem: '这篇文章按排合理，条理清楚，是一篇难得的好文章。', options: ['按排合理', '条理清楚', '难得的好', '文章'], answer: 0 },
  { id: 'pf-08', band: 2, stem: '他的话让我们深受启发了，大家纷纷表示要努力学习。', options: ['深受启发', '纷纷表示', '努力学习', '让我们'], answer: 3 },
  { id: 'pf-09', band: 3, stem: '面对困难，我们不能抱负，要勇敢地迎接挑占。', options: ['面对困难', '抱负', '勇敢地', '挑占'], answer: 3 },
  { id: 'pf-10', band: 3, stem: '科学家们废侵忘食地工作，终于攻刻了这道难题。', options: ['废侵忘食', '工作', '攻刻', '难题'], answer: 2 },
  { id: 'pf-11', band: 3, stem: '他的演说博得了热烈的掌生，会场的气氛非常活跃。', options: ['演说', '博得', '掌生', '活跃'], answer: 2 },
  { id: 'pf-12', band: 3, stem: '这份报告直接影响了公司的战绝部署，意议非常重大。', options: ['报告', '战绝部署', '意议', '重大'], answer: 2 },
  { id: 'pf-13', band: 3, stem: '那里的风景真是一绝，山青水秀，鸟语花香，令人流连忘反。', options: ['风景', '山青水秀', '鸟语花香', '流连忘反'], answer: 3 },
  { id: 'pf-14', band: 2, stem: '这次活动圆满结素，同学们都表示收获很大。', options: ['活动', '圆满结素', '同学们', '收获很大'], answer: 1 },
  { id: 'pf-15', band: 2, stem: '他做事总是一丝不句，从不马虎，深得老师的信任。', options: ['一丝不句', '从不马虎', '深得', '信任'], answer: 0 },
  { id: 'pf-16', band: 3, stem: '在老师的帮助下班里的学习风气焕然一新，同学们的精社面貌也大大改观。', options: ['帮助', '焕然一新', '精社面貌', '改观'], answer: 2 },
  { id: 'pf-17', band: 1, stem: '春暖花开的季结，公园里游人如织，到处是赏花的人群。', options: ['春暖花开', '季结', '游人如织', '赏花'], answer: 1 },
  { id: 'pf-18', band: 2, stem: '他的性恪很开郎，跟谁都合得来，朋友们都很喜欢他。', options: ['性恪', '开郎', '合得来', '喜欢'], answer: 0 },
  { id: 'pf-19', band: 3, stem: '这本书内容详实，图文并茂，是一本不可多得的佳做。', options: ['内容详实', '图文并茂', '不可多得', '佳做'], answer: 3 },
  { id: 'pf-20', band: 2, stem: '我们应当从实际出发，实事求是地分西问题、解决问题。', options: ['实际出发', '实事求是', '分西问题', '解决问题'], answer: 2 },
  { id: 'pf-21', band: 2, stem: '他热情的帮助了我，我很感激他。', options: ['热情地帮助', '帮助了我', '感激', '他'], answer: 0 },
  { id: 'pf-22', band: 3, stem: '虽然他的身体不太好，但是他仍然坚持工作，从无愿言。', options: ['身体不太好', '坚持工作', '从无愿言', '虽然'], answer: 2 },
  { id: 'pf-23', band: 1, stem: '妈妈说要我放学后直接回家，不要在路上玩流。', options: ['放学', '直接回家', '在路上', '玩流'], answer: 3 },
  { id: 'pf-24', band: 3, stem: '他的态度很坚决，不管别人怎么劝说他都听不进去，真拿他没办法。', options: ['态度', '坚决', '劝说', '没办法'], answer: 3 },
]

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'

/** PR1 题库元数据：来源/授权/等值身份；对外发布闸门见 publish-cognitive-configs。 */
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'proofread-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
})
