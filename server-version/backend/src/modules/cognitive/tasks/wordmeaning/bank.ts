/**
 * Internal DRAFT Chinese word-meaning bank (wordmeaning-zh-v1.0.0).
 * Original items authored for this pilot; not copied from any published test.
 * 每题：目标词 + 4 个释义选项（1 正确 3 干扰）。
 */
export const WORDMEANING_STIMULUS_SET_VERSION = 'wordmeaning-zh-v1.0.0'

export type WordmeaningItem = {
  id: string
  band: 1 | 2 | 3
  word: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const WORDMEANING_BANK: WordmeaningItem[] = [
  { id: 'wm-01', band: 1, word: '凝视', options: ['专注地看', '随意扫过', '斜着眼睛看', '闭目思考'], answer: 0 },
  { id: 'wm-02', band: 1, word: '汇集', options: ['分散到各处', '聚到一起', '逐渐减少', '互相比较'], answer: 1 },
  { id: 'wm-03', band: 1, word: '消耗', options: ['慢慢积累', '保存起来', '逐渐用掉', '分给他人'], answer: 2 },
  { id: 'wm-04', band: 1, word: '恢复', options: ['彻底放弃', '变回原来的样子', '更进一步', '重新开始做'], answer: 1 },
  { id: 'wm-05', band: 1, word: '忽略', options: ['特别重视', '故意拒绝', '没有注意到', '反复提醒'], answer: 2 },
  { id: 'wm-06', band: 1, word: '珍贵', options: ['数量很多', '价值大而意义深', '价格便宜', '容易得到'], answer: 1 },
  { id: 'wm-07', band: 2, word: '辽阔', options: ['宽广广阔', '狭窄拥挤', '高低不平', '边界清晰'], answer: 0 },
  { id: 'wm-08', band: 2, word: '迟疑', options: ['果断行动', '拿不定主意', '快速奔跑', '大声反驳'], answer: 1 },
  { id: 'wm-09', band: 2, word: '凋零', options: ['盛开绽放', '被修剪整齐', '枯萎衰落', '被移植成活'], answer: 2 },
  { id: 'wm-10', band: 2, word: '推测', options: ['根据已知猜想未知', '精确测量', '直接下结论不再验证', '回忆过去的事'], answer: 0 },
  { id: 'wm-11', band: 2, word: '隐蔽', options: ['公开陈列', '藏起来不显露', '明显可见', '被彻底破坏'], answer: 1 },
  { id: 'wm-12', band: 2, word: '适应', options: ['适合新的环境或情况', '拒绝一切变化', '恢复旧习惯', '改变他人'], answer: 0 },
  { id: 'wm-13', band: 2, word: '繁荣', options: ['萧条衰落', '人口减少', '兴旺发达', '秩序混乱'], answer: 2 },
  { id: 'wm-14', band: 2, word: '妥善', options: ['稳妥完善地处理', '匆忙应付', '随意丢弃', '反复拖延'], answer: 0 },
  { id: 'wm-15', band: 2, word: '阻碍', options: ['帮助前进', '使事情顺利发展', '使不能顺利进行', '加速完成'], answer: 2 },
  { id: 'wm-16', band: 2, word: '违背', options: ['严格遵守', '不遵守、违反', '主动承诺', '商量一致'], answer: 1 },
  { id: 'wm-17', band: 2, word: '蕴含', options: ['排除在外', '公开展示', '包含在里面', '被完全消耗'], answer: 2 },
  { id: 'wm-18', band: 3, word: '精湛', options: ['粗糙简陋', '技艺高超', '刚刚入门', '勉强合格'], answer: 1 },
  { id: 'wm-19', band: 3, word: '斟酌', options: ['不加思考地决定', '反复考虑权衡', '大声争辩', '随意涂改'], answer: 1 },
  { id: 'wm-20', band: 3, word: '蜿蜒', options: ['笔直延伸', '弯曲延伸', '突然中断', '快速流动'], answer: 1 },
  { id: 'wm-21', band: 3, word: '权衡', options: ['单方面决定', '比较衡量轻重', '放弃选择', '平均分配'], answer: 1 },
  { id: 'wm-22', band: 3, word: '稀疏', options: ['密不透风', '间隔大而不稠密', '整齐排列', '层层叠叠'], answer: 1 },
  { id: 'wm-23', band: 3, word: '轮廓', options: ['内部构造', '物体的外缘线条', '表面颜色', '整体重量'], answer: 1 },
  { id: 'wm-24', band: 3, word: '依存', options: ['互相依附而存在', '完全独立', '彼此竞争', '一方消灭另一方'], answer: 0 },
  { id: 'wm-25', band: 3, word: '前提', options: ['最终的结论', '成立的先决条件', '意外的结果', '相反的假设'], answer: 1 },
  { id: 'wm-26', band: 3, word: '见效', options: ['开始产生效果', '彻底失败', '被推迟', '需要重新设计'], answer: 0 },
  { id: 'wm-27', band: 3, word: '缓和', options: ['使局势更紧张', '变得平稳缓和', '突然爆发', '完全解决'], answer: 1 },
  { id: 'wm-28', band: 3, word: '匀称', options: ['歪斜不正', '均匀相称', '局部突出', '杂乱堆积'], answer: 1 },
  { id: 'wm-29', band: 2, word: '鸟瞰', options: ['从高处俯视', '抬头仰望', '近距离端详', '闭眼想象'], answer: 0 },
  { id: 'wm-30', band: 2, word: '跻身', options: ['退出某个行列', '使自己上升到某个行列', '被人排挤', '原地踏步'], answer: 1 },
  { id: 'wm-31', band: 3, word: '悖论', options: ['显然正确的事实', '看似矛盾却可能成立的论述', '毫无逻辑的胡话', '被普遍接受的常识'], answer: 1 },
  { id: 'wm-32', band: 3, word: '侵蚀', options: ['逐渐损坏或削弱', '一次性击穿', '被包裹保护', '快速生长'], answer: 0 },
  { id: 'wm-33', band: 3, word: '冗余', options: ['必不可少的部分', '多余重复的部分', '核心的关键', '被删除的内容'], answer: 1 },
  { id: 'wm-34', band: 3, word: '潜质', options: ['已经表现出的成绩', '尚未发挥的潜在能力', '外在的装饰', '确定的缺陷'], answer: 1 },
  { id: 'wm-35', band: 2, word: '一致', options: ['彼此相同没有分歧', '各说各话', '部分相反', '毫无关系'], answer: 0 },
  { id: 'wm-36', band: 2, word: '显著', options: ['非常不明显', '特别明显、容易看出', '慢慢显现', '被完全遮住'], answer: 1 },
]


/** 只读来源附注；不新增安装、授权或发布判定，复用既有catalog与发布链。 */
export const bankMeta = {
  stimulusSetVersion: 'wordmeaning-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
} as const
