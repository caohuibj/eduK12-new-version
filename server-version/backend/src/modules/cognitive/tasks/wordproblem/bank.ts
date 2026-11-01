/**
 * Internal DRAFT Chinese math word-problem bank (wordproblem-zh-v1.0.0).
 * Original items authored for this pilot; each answerIndex verified by hand.
 * 类型：行程、工程、比例、折扣、浓度、简单几何、植树/周期。
 */
export const WORDPROBLEM_STIMULUS_SET_VERSION = 'wordproblem-zh-v1.0.0'

export type WordproblemItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const WORDPROBLEM_BANK: WordproblemItem[] = [
  { id: 'wp-01', band: 1, stem: '小明每分钟走 60 米，从家到学校走了 10 分钟，家到学校多少米？', options: ['600 米', '360 米', '70 米', '6000 米'], answer: 0 },
  { id: 'wp-02', band: 1, stem: '一支笔 3 元，一支橡皮 2 元，买 4 支笔和 3 块橡皮一共多少元？', options: ['17 元', '18 元', '14 元', '20 元'], answer: 1 },
  { id: 'wp-03', band: 1, stem: '一箱苹果 24 个，平均分给 6 个小朋友，每人分得几个？', options: ['3 个', '5 个', '4 个', '6 个'], answer: 2 },
  { id: 'wp-04', band: 1, stem: '一辆汽车 3 小时行驶 180 千米，照这样的速度，5 小时行驶多少千米？', options: ['240 千米', '300 千米', '360 千米', '280 千米'], answer: 1 },
  { id: 'wp-05', band: 2, stem: '一件衣服原价 200 元，打八折后的价格是多少元？', options: ['160 元', '180 元', '120 元', '150 元'], answer: 0 },
  { id: 'wp-06', band: 2, stem: '甲 4 天完成一项工程的 1/3，照这样的速度，全部完成需要多少天？', options: ['10 天', '8 天', '12 天', '14 天'], answer: 2 },
  { id: 'wp-07', band: 2, stem: '一个长方形花坛长 8 米、宽 5 米，它的周长是多少米？', options: ['40 米', '13 米', '26 米', '20 米'], answer: 2 },
  { id: 'wp-08', band: 2, stem: '一辆公交车上有 35 人，到站后下车 12 人、上车 8 人，现在车上有多少人？', options: ['39 人', '31 人', '55 人', '27 人'], answer: 1 },
  { id: 'wp-09', band: 2, stem: '盐水 200 克含盐 20 克，盐占盐水的百分之几？', options: ['15%', '20%', '10%', '25%'], answer: 2 },
  { id: 'wp-10', band: 2, stem: '甲乙两人从相距 900 米的两地同时相向而行，甲每分钟走 55 米，乙每分钟走 65 米，几分钟后相遇？', options: ['6 分钟', '7.5 分钟', '8 分钟', '9 分钟'], answer: 1 },
  { id: 'wp-11', band: 2, stem: '一根木料锯成 4 段需要 6 分钟，照这样的速度，锯成 7 段需要多少分钟？', options: ['10.5 分钟', '12 分钟', '14 分钟', '9 分钟'], answer: 2 },
  { id: 'wp-12', band: 2, stem: '商店进了一批水果，卖出 5/8 后还剩 60 千克，这批水果原来多少千克？', options: ['120 千克', '140 千克', '160 千克', '180 千克'], answer: 2 },
  { id: 'wp-13', band: 3, stem: '一项工程甲单独做 10 天完成，乙单独做 15 天完成，两人合作需要多少天完成？', options: ['5 天', '6 天', '7 天', '8 天'], answer: 1 },
  { id: 'wp-14', band: 3, stem: '一个圆形花坛直径 10 米，在它外围修一条宽 1 米的环形小路，小路的面积约是多少平方米（π 取 3.14）？', options: ['31.4 平方米', '34.54 平方米', '65.94 平方米', '78.5 平方米'], answer: 1 },
  { id: 'wp-15', band: 3, stem: '某商品先提价 10%，再降价 10%，现价与原价相比有什么变化？', options: ['不变', '比原价低', '比原价高', '无法确定'], answer: 1 },
  { id: 'wp-16', band: 3, stem: '鸡兔同笼，共 35 个头、94 只脚，鸡有多少只？', options: ['23 只', '20 只', '25 只', '18 只'], answer: 0 },
  { id: 'wp-17', band: 3, stem: '小华读一本书，第一天读了全书的 1/4，第二天读了全书的 2/5，第二天比第一天多读 24 页，这本书共多少页？', options: ['120 页', '150 页', '160 页', '180 页'], answer: 2 },
  { id: 'wp-18', band: 3, stem: '甲、乙两个仓库储存粮食的质量比为 5:3，如果从甲仓库运 12 吨到乙仓库，两仓库质量就相等，甲仓库原有粮食多少吨？', options: ['36 吨', '30 吨', '48 吨', '40 吨'], answer: 1 },
  { id: 'wp-19', band: 3, stem: '一只船在静水中速度为每小时 20 千米，水流速度为每小时 4 千米，顺流航行 120 千米需要多少小时？', options: ['4 小时', '5 小时', '6 小时', '7.5 小时'], answer: 1 },
  { id: 'wp-20', band: 3, stem: '将 25 克糖溶入 100 克水中，糖水的浓度是多少？', options: ['25%', '20%', '15%', '30%'], answer: 1 },
  { id: 'wp-21', band: 2, stem: '三个连续自然数的和是 84，其中最大的数是多少？', options: ['27', '28', '29', '30'], answer: 2 },
  { id: 'wp-22', band: 2, stem: '一块蛋糕切成 8 块，小明吃了其中的 3 块，他吃了这块蛋糕的几分之几？', options: ['3/5', '3/8', '5/8', '8/3'], answer: 1 },
  { id: 'wp-23', band: 3, stem: '商店以每件 60 元的价格进了一批衬衫，加价 25% 出售，每件售价多少元？', options: ['75 元', '80 元', '72 元', '85 元'], answer: 0 },
  { id: 'wp-24', band: 1, stem: '小红有 45 元，买书用去 18 元，还剩多少元？', options: ['63 元', '27 元', '37 元', '17 元'], answer: 1 },
]



/** Frozen source metadata; publication remains a separate authorized operation. */
export const bankMeta = {
  stimulusSetVersion: 'wordproblem-zh-v1.0.0',
  source: 'internal-authored (pilot bank, not copied from any published test)',
  license: 'internal-generated',
  itemSetRole: 'form',
} as const
