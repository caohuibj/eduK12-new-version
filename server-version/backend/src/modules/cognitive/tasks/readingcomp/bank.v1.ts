/**
 * Internal DRAFT Chinese reading-comprehension bank (readingcomp-zh-v1.0.0).
 * Original passages authored for this pilot; each answerIndex verified by hand.
 * 每题：短文 + 理解问题（4 选 1）。
 */
export const READINGCOMP_STIMULUS_SET_VERSION = 'readingcomp-zh-v1.0.0'

export type ReadingcompItem = {
  id: string
  band: 1 | 2 | 3
  passage: string
  question: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const READINGCOMP_BANK: ReadingcompItem[] = [
  { id: 'rc-01', band: 1, passage: '小明每天早上六点半起床，先跑步二十分钟，然后吃早餐。他发现坚持晨跑后，上课时精神好了很多，也不容易犯困了。', question: '小明跑步后最大的变化是什么？', options: ['体重减轻了', '上课更有精神', '跑步速度变快', '认识了很多朋友'], answer: 1 },
  { id: 'rc-02', band: 1, passage: '图书馆新来了两百本科普书，放在三楼的自然科学区。借书需要用借书证，每人每次最多借三本，借期两周。', question: '每次最多可以借几本科普书？', options: ['一本', '两本', '三本', '五本'], answer: 2 },
  { id: 'rc-03', band: 2, passage: '蜜蜂通过跳"8"字舞来告诉同伴花蜜的方向和距离。如果舞的方向朝上，表示花蜜在朝太阳的方向；如果舞的时间越长，表示距离越远。', question: '蜜蜂跳"8"字舞的目的是什么？', options: ['吸引配偶', '告诉同伴花蜜信息', '清洁蜂巢', '警告危险'], answer: 1 },
  { id: 'rc-04', band: 2, passage: '竹子是世界上生长最快的植物之一，有些品种一天可以长高将近一米。但竹子在种下的前四年里，地面上几乎看不到任何变化，因为它的能量都用来发展根系了。', question: '竹子前四年为什么地面看不到变化？', options: ['生长停止了', '能量用于发展根系', '被土壤覆盖了', '天气太冷'], answer: 1 },
  { id: 'rc-05', band: 2, passage: '科学家发现，海豚在睡觉时只让一半的大脑休息，另一半保持清醒。这样它们可以继续浮出水面呼吸，同时警惕鲨鱼等天敌。', question: '海豚睡觉时为什么只让一半大脑休息？', options: ['为了省力气', '一半大脑不够用', '继续呼吸并警惕天敌', '习惯性行为'], answer: 2 },
  { id: 'rc-06', band: 2, passage: '城市里的热岛效应是指城市中心的温度比郊区高。主要原因是建筑物和马路吸收了大量太阳辐射，而植物和水面的减少使得降温效果变差。', question: '热岛效应的主要原因是什么？', options: ['人口太多', '建筑物吸热且植物减少', '汽车太多', '工业排放'], answer: 1 },
  { id: 'rc-07', band: 2, passage: '古代的驿站是官方设置的邮政系统，每隔三十里设一个站。信使骑马从一站到下一站，接力传递公文和军情。最快的加急件可以日行五百里。', question: '古代驿站的主要功能是什么？', options: ['接待旅客住宿', '传递公文和军情', '储存粮食', '训练马匹'], answer: 1 },
  { id: 'rc-08', band: 2, passage: '洗碗时先用热水冲可以更容易去除油渍，因为油脂在高温下会变稀、更容易被水冲走。之后再用品温水和洗洁精清洗即可。', question: '为什么用热水冲更容易去油渍？', options: ['热水杀菌', '油脂高温变稀易冲走', '热水泡沫多', '热水溶解洗洁精'], answer: 1 },
  { id: 'rc-09', band: 3, passage: '研究显示，适度的压力可以提高人的表现，这被称为"耶克斯-多德森定律"。但压力过高时，表现反而会急剧下降。关键在于找到每个人的最佳压力水平。', question: '根据耶克斯-多德森定律，压力和表现的关系是什么？', options: ['压力越大表现越好', '压力越小表现越好', '适度压力最佳，过高反而下降', '压力与表现无关'], answer: 2 },
  { id: 'rc-10', band: 3, passage: '光合作用是植物将二氧化碳和水转化为葡萄糖和氧气的过程，需要叶绿体中的叶绿素吸收光能。没有光合作用，地球上的氧气几乎全部无法产生。', question: '光合作用需要的条件不包括以下哪项？', options: ['二氧化碳', '水', '叶绿素', '土壤'], answer: 3 },
  { id: 'rc-11', band: 3, passage: '印刷术是中国四大发明之一。雕版印刷在唐代已经成熟，但每印一页都要刻一块版。北宋毕昇发明了活字印刷，用可以重复使用的单个字模排版，大大提高了效率。', question: '活字印刷相比雕版印刷的优势是什么？', options: ['印刷更精美', '字模可以重复使用', '成本更低廉', '速度更快但质量差'], answer: 1 },
  { id: 'rc-12', band: 3, passage: '鲸鱼不是鱼，而是哺乳动物。它们用肺呼吸而不是鳃，胎生而非卵生，幼鲸靠母乳喂养。鲸鱼的祖先原本是陆地动物，后来逐渐适应了海洋生活。', question: '鲸鱼和鱼类的主要区别是什么？', options: ['鲸鱼更大', '鲸鱼用肺呼吸且胎生', '鲸鱼生活在海里', '鲸鱼有鳞片'], answer: 1 },
  { id: 'rc-13', band: 2, passage: '世界上最高的山峰是珠穆朗玛峰，海拔约 8849 米。但由于板块运动，珠峰每年仍在以几毫米的速度缓慢升高。', question: '珠穆朗玛峰为什么还在升高？', options: ['积雪增加', '板块运动', '测量误差', '火山活动'], answer: 1 },
  { id: 'rc-14', band: 2, passage: '面包发酵需要酵母菌。酵母菌分解面团中的糖分，产生二氧化碳气泡，使面团膨胀变松软。温度过高会杀死酵母菌，过低则发酵太慢。', question: '面包发酵产生的是什么气体使面团膨胀？', options: ['氧气', '二氧化碳', '氮气', '氢气'], answer: 1 },
  { id: 'rc-15', band: 3, passage: '指纹由遗传决定基本形状，但细节特征在胎儿期随机形成，因此即使同卵双胞胎的指纹也不完全相同。指纹在胎儿发育约 17 周时开始出现。', question: '为什么同卵双胞胎的指纹也不完全相同？', options: ['遗传不同', '细节特征随机形成', '生活环境不同', '饮食影响'], answer: 1 },
  { id: 'rc-16', band: 3, passage: '免疫系统通过产生抗体来对抗病毒。疫苗的原理是让免疫系统提前"认识"病毒的特征，从而在真正感染时快速反应。疫苗通常含有灭活或减毒的病毒。', question: '疫苗让免疫系统提前"认识"病毒的方式是什么？', options: ['直接注射抗体', '注入灭活或减毒病毒', '替换免疫系统', '杀死所有病毒'], answer: 1 },
]

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'

/** PR1 题库元数据：来源/授权/等值身份；对外发布闸门见 publish-cognitive-configs。 */
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'readingcomp-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
})
