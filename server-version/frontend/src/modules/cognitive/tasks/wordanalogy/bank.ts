/**
 * Internal DRAFT Chinese verbal-analogy bank (wordanalogy-zh-v1.0.0).
 * Original items authored for this pilot; not copied from any published test.
 * 关系类型：部分-整体、功能-工具、因果、类别、序列、程度/反义、构成、对应动作。
 */
export const WORDANALOGY_STIMULUS_SET_VERSION = 'wordanalogy-zh-v1.0.0'

export type WordanalogyItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const WORDANALOGY_BANK: WordanalogyItem[] = [
  { id: 'wa-01', band: 1, stem: '鸟 对于 翅膀 相当于 鱼 对于 ____', options: ['鳍', '鳞片', '水', '鳃盖'], answer: 0 },
  { id: 'wa-02', band: 1, stem: '医生 对于 病人 相当于 老师 对于 ____', options: ['课本', '教室', '学生', '黑板'], answer: 2 },
  { id: 'wa-03', band: 1, stem: '热 对于 冷 相当于 高 对于 ____', options: ['远', '矮', '强', '大'], answer: 1 },
  { id: 'wa-04', band: 1, stem: '笔 对于 写字 相当于 刀 对于 ____', options: ['锋利', '铁', '切菜', '厨房'], answer: 2 },
  { id: 'wa-05', band: 1, stem: '喝水 对于 解渴 相当于 吃饭 对于 ____', options: ['厨房', '充饥', '粮食', '味道'], answer: 1 },
  { id: 'wa-06', band: 2, stem: '轮胎 对于 汽车 相当于 鞋底 对于 ____', options: ['鞋带', '袜子', '鞋', '脚'], answer: 2 },
  { id: 'wa-07', band: 1, stem: '春 对于 夏 相当于 秋 对于 ____', options: ['冬', '凉爽', '收获', '落叶'], answer: 0 },
  { id: 'wa-08', band: 2, stem: '作者 对于 书 相当于 厨师 对于 ____', options: ['厨房', '菜谱', '菜肴', '顾客'], answer: 2 },
  { id: 'wa-09', band: 2, stem: '秒 对于 分钟 相当于 分钟 对于 ____', options: ['刻', '小时', '天', '周'], answer: 1 },
  { id: 'wa-10', band: 2, stem: '树 对于 森林 相当于 士兵 对于 ____', options: ['军营', '军队', '武器', '军官'], answer: 1 },
  { id: 'wa-11', band: 2, stem: '冰 对于 水 相当于 水蒸气 对于 ____', options: ['雪', '河', '水', '雾凇'], answer: 2 },
  { id: 'wa-12', band: 2, stem: '灯 对于 光 相当于 炉子 对于 ____', options: ['火苗', '热量', '暖和', '煤炭'], answer: 1 },
  { id: 'wa-13', band: 1, stem: '教师 对于 学校 相当于 售货员 对于 ____', options: ['商品', '商店', '收银台', '顾客'], answer: 1 },
  { id: 'wa-14', band: 2, stem: '米 对于 千米 相当于 克 对于 ____', options: ['升', '千克', '吨', '两'], answer: 1 },
  { id: 'wa-15', band: 2, stem: '提问 对于 回答 相当于 借出 对于 ____', options: ['归还', '欠款', '赠送', '拿走'], answer: 0 },
  { id: 'wa-16', band: 3, stem: '花朵 对于 蜜蜂 相当于 血液 对于 ____', options: ['蝴蝶', '蚊子', '蜘蛛', '蚂蚁'], answer: 1 },
  { id: 'wa-17', band: 2, stem: '轮船 对于 海洋 相当于 火车 对于 ____', options: ['车站', '铁轨', '乘客', '蒸汽'], answer: 1 },
  { id: 'wa-18', band: 2, stem: '勇敢 对于 怯懦 相当于 勤奋 对于 ____', options: ['努力', '懒惰', '聪明', '节俭'], answer: 1 },
  { id: 'wa-19', band: 2, stem: '皇帝 对于 王冠 相当于 冠军 对于 ____', options: ['跑道', '奖杯', '教练', '纪录'], answer: 1 },
  { id: 'wa-20', band: 2, stem: '电池 对于 手电筒 相当于 汽油 对于 ____', options: ['加油站', '汽车', '轮胎', '机油'], answer: 1 },
  { id: 'wa-21', band: 3, stem: '剧本 对于 电影 相当于 图纸 对于 ____', options: ['画家', '建筑', '工地', '模型'], answer: 1 },
  { id: 'wa-22', band: 3, stem: '蔬菜 对于 维生素 相当于 肥肉 对于 ____', options: ['蛋白质', '脂肪', '糖分', '水分'], answer: 1 },
  { id: 'wa-23', band: 2, stem: '日 对于 月 相当于 月 对于 ____', options: ['周', '季度', '年', '旬'], answer: 2 },
  { id: 'wa-24', band: 2, stem: '钥匙 对于 锁 相当于 密码 对于 ____', options: ['手机', '键盘', '账户', '卡片'], answer: 2 },
  { id: 'wa-25', band: 2, stem: '播种 对于 收获 相当于 努力 对于 ____', options: ['汗水', '成功', '目标', '休息'], answer: 1 },
  { id: 'wa-26', band: 1, stem: '海洋 对于 海水 相当于 沙漠 对于 ____', options: ['绿洲', '沙子', '骆驼', '干旱'], answer: 1 },
  { id: 'wa-27', band: 3, stem: '正方形 对于 正方体 相当于 圆 对于 ____', options: ['圆面', '球', '圆柱', '圆锥'], answer: 1 },
  { id: 'wa-28', band: 3, stem: '收音机 对于 耳朵 相当于 电视机 对于 ____', options: ['节目', '眼睛', '屏幕', '天线'], answer: 1 },
  { id: 'wa-29', band: 3, stem: '疑问 对于 求解 相当于 危险 对于 ____', options: ['勇敢', '规避', '事故', '警报'], answer: 1 },
  { id: 'wa-30', band: 2, stem: '森林 对于 涵养水源 相当于 湿地 对于 ____', options: ['净化水质', '渔业', '观光', '灌溉'], answer: 0 },
  { id: 'wa-31', band: 3, stem: '里程碑 对于 旅程 相当于 坐标 对于 ____', options: ['地图', '位置', '航行', '方向'], answer: 1 },
  { id: 'wa-32', band: 3, stem: '乐谱 对于 演奏 相当于 菜谱 对于 ____', options: ['厨房', '烹饪', '食材', '餐具'], answer: 1 },
  { id: 'wa-33', band: 3, stem: '总结 对于 经验 相当于 检索 对于 ____', options: ['书架', '信息', '目录', '图书馆'], answer: 1 },
  { id: 'wa-34', band: 2, stem: '恒温动物 对于 体温稳定 相当于 变温动物 对于 ____', options: ['冬眠', '体温随环境变化', '卵生', '水生'], answer: 1 },
  { id: 'wa-35', band: 3, stem: '过滤器 对于 杂质 相当于 筛选 对于 ____', options: ['信息', '简历', '条件', '淘汰'], answer: 0 },
  { id: 'wa-36', band: 3, stem: '自由 对于 约束 相当于 创新 对于 ____', options: ['想法', '常规', '突破', '尝试'], answer: 1 },
]
