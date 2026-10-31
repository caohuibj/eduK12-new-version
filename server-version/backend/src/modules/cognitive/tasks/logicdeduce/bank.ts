/**
 * Internal DRAFT Chinese logical-deduction bank (logicdeduce-zh-v1.0.0).
 * Original items authored for this pilot; each answerIndex verified by hand.
 * 类型：排序传递、条件推理、三段论、算术嵌入、空间排列。
 */
export const LOGICDEDUCE_STIMULUS_SET_VERSION = 'logicdeduce-zh-v1.0.0'

export type LogicdeduceItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const LOGICDEDUCE_BANK: LogicdeduceItem[] = [
  { id: 'ld-01', band: 1, stem: '甲比乙高，乙比丙高，三人中最高的是谁？', options: ['甲', '乙', '丙', '无法确定'], answer: 0 },
  { id: 'ld-02', band: 1, stem: '小明比小红跑得快，小红比小刚跑得快，谁跑得最慢？', options: ['小明', '小红', '小刚', '无法确定'], answer: 2 },
  { id: 'ld-03', band: 1, stem: '红球比蓝球多，蓝球比绿球多，哪种球最少？', options: ['红球', '蓝球', '绿球', '一样多'], answer: 2 },
  { id: 'ld-04', band: 3, stem: '甲、乙、丙赛跑，甲在乙前面到达，丙在乙前面到达，谁与谁之间的名次无法确定？', options: ['甲和乙', '乙和丙', '甲和丙', '三人都确定'], answer: 2 },
  { id: 'ld-05', band: 2, stem: '小张住在小刘的东边、小陈的西边，谁住最西边？', options: ['小张', '小刘', '小陈', '无法确定'], answer: 2 },
  { id: 'ld-06', band: 1, stem: '5 个人排队，小红前面有 3 人，后面有 1 人，小红排第几？', options: ['第 3', '第 4', '第 5', '第 2'], answer: 1 },
  { id: 'ld-07', band: 2, stem: '如果下雨，运动会就取消。今天运动会没有取消，所以？', options: ['下了雨', '没有下雨', '雨很小', '无法确定'], answer: 1 },
  { id: 'ld-08', band: 1, stem: '所有的猫都怕水，小华的宠物是一只猫，小华的宠物怕水吗？', options: ['怕水', '不怕水', '不一定', '与水无关'], answer: 0 },
  { id: 'ld-09', band: 3, stem: '所有金属都导电，塑料不是金属，塑料导电吗？', options: ['导电', '不导电', '无法从题干判断', '一定不导电'], answer: 2 },
  { id: 'ld-10', band: 2, stem: '如果所有的 A 都是 B，所有的 B 都是 C，那么所有的 A 都是 C 吗？', options: ['是', '不是', '不一定', '只有部分是'], answer: 0 },
  { id: 'ld-11', band: 3, stem: '题目说"有些鸟不会飞"，企鹅是鸟，企鹅会飞吗？', options: ['一定会飞', '一定不会飞', '不一定', '所有的鸟都会飞'], answer: 2 },
  { id: 'ld-12', band: 2, stem: '甲比乙大 2 岁，乙比丙大 2 岁，丙今年 10 岁，甲今年几岁？', options: ['12 岁', '13 岁', '14 岁', '16 岁'], answer: 2 },
  { id: 'ld-13', band: 1, stem: '排队时小红前面有 3 人，后面有 4 人，队伍一共几人？', options: ['6 人', '7 人', '8 人', '9 人'], answer: 2 },
  { id: 'ld-14', band: 2, stem: '一打铅笔有 12 支，送出 3 支后又买了 5 支，现在有多少支？', options: ['10 支', '14 支', '15 支', '20 支'], answer: 1 },
  { id: 'ld-15', band: 1, stem: '小明的书比小红多 3 本，小红有 8 本，小明有多少本？', options: ['5 本', '8 本', '11 本', '24 本'], answer: 2 },
  { id: 'ld-16', band: 2, stem: '教室里有 5 盏灯，关掉了 2 盏，还亮着几盏？', options: ['2 盏', '3 盏', '5 盏', '7 盏'], answer: 1 },
  { id: 'ld-17', band: 2, stem: '如果 A > B 且 B > C，那么 A 和 C 的关系是？', options: ['A > C', 'A < C', 'A = C', '无法确定'], answer: 0 },
  { id: 'ld-18', band: 1, stem: '兄弟三人，小明是老大，小华是老三，小刚排第几？', options: ['老大', '老二', '老三', '无法确定'], answer: 1 },
  { id: 'ld-19', band: 2, stem: '5 人的年龄从大到小排列是甲、乙、丙、丁、戊，谁第二小？', options: ['乙', '丙', '丁', '戊'], answer: 2 },
  { id: 'ld-20', band: 1, stem: '从周一开始，今天是第四天，今天是星期几？', options: ['星期三', '星期四', '星期五', '星期六'], answer: 1 },
  { id: 'ld-21', band: 2, stem: '甲的钱是乙的 2 倍，乙有 20 元，甲有多少元？', options: ['20 元', '30 元', '40 元', '60 元'], answer: 2 },
  { id: 'ld-22', band: 3, stem: '甲每分钟走 60 米，乙每分钟走 80 米，两人同时同地同向出发，3 分钟后乙比甲多走多少米？', options: ['40 米', '60 米', '80 米', '120 米'], answer: 1 },
  { id: 'ld-23', band: 3, stem: '小华有红蓝两种笔共 10 支，红笔比蓝笔多 2 支，红笔有几支？', options: ['4 支', '5 支', '6 支', '8 支'], answer: 2 },
  { id: 'ld-24', band: 3, stem: '房间有 4 个角落，每个角落放 1 只猫，每只猫面前都能看到另外 3 只猫，房间里共有几只猫？', options: ['3 只', '4 只', '7 只', '12 只'], answer: 1 },
]

import { cognitiveBankMetaSchema, type CognitiveBankMeta } from '../../banks/bank-meta'

/** PR1 题库元数据：来源/授权/等值身份；对外发布闸门见 publish-cognitive-configs。 */
export const bankMeta: CognitiveBankMeta = cognitiveBankMetaSchema.parse({
  stimulusSetVersion: 'logicdeduce-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
})
