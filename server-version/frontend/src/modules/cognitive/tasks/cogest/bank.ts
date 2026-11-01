/**
 * Internal DRAFT Chinese cognitive-estimation bank (cogest-zh-v1.0.0).
 * Original items authored for this pilot; each answerIndex verified by hand.
 * 类型：物体属性估计、时间估计、数量估计、距离/大小估计。
 */
export const COGEST_STIMULUS_SET_VERSION = 'cogest-zh-v1.0.0'

export type CogestItem = {
  id: string
  band: 1 | 2 | 3
  stem: string
  options: [string, string, string, string]
  answer: 0 | 1 | 2 | 3
}

export const COGEST_BANK: CogestItem[] = [
  { id: 'ce-01', band: 1, stem: '一头成年大象大约有多重？', options: ['约 500 千克', '约 3 吨', '约 10 吨', '约 100 千克'], answer: 1 },
  { id: 'ce-02', band: 1, stem: '一个成年人每天大约需要喝多少水？', options: ['约 200 毫升', '约 2 升', '约 10 升', '约 500 毫升'], answer: 1 },
  { id: 'ce-03', band: 1, stem: '一杯水（普通玻璃杯）大约有多少毫升？', options: ['约 50 毫升', '约 250 毫升', '约 1 升', '约 50 升'], answer: 1 },
  { id: 'ce-04', band: 1, stem: '一辆公交车大约能坐多少人？', options: ['约 10 人', '约 50 人', '约 200 人', '约 500 人'], answer: 1 },
  { id: 'ce-05', band: 2, stem: '从北京到上海的距离大约是多少？', options: ['约 100 千米', '约 500 千米', '约 1200 千米', '约 5000 千米'], answer: 2 },
  { id: 'ce-06', band: 2, stem: '一个成年人一天大约需要多少千卡热量？', options: ['约 500 千卡', '约 2000 千卡', '约 5000 千卡', '约 10000 千卡'], answer: 1 },
  { id: 'ce-07', band: 2, stem: '地球绕太阳一圈大约需要多长时间？', options: ['约 1 天', '约 30 天', '约 365 天', '约 10 年'], answer: 2 },
  { id: 'ce-08', band: 2, stem: '一本普通字典大约有多少页？', options: ['约 50 页', '约 500 页', '约 5000 页', '约 100 页'], answer: 1 },
  { id: 'ce-09', band: 2, stem: '人的正常体温大约是多少摄氏度？', options: ['约 35°C', '约 37°C', '约 39°C', '约 41°C'], answer: 1 },
  { id: 'ce-10', band: 2, stem: '一架民航客机的巡航速度大约是多少？', options: ['约 200 千米/时', '约 900 千米/时', '约 3000 千米/时', '约 100 千米/时'], answer: 1 },
  { id: 'ce-11', band: 2, stem: '一个标准足球场的面积大约是多少？', options: ['约 700 平方米', '约 7000 平方米', '约 7 万平方米', '约 700 平方千米'], answer: 1 },
  { id: 'ce-12', band: 2, stem: '光从太阳到地球大约需要多长时间？', options: ['约 8 秒', '约 8 分钟', '约 8 小时', '约 8 天'], answer: 1 },
  { id: 'ce-13', band: 3, stem: '中国人口大约是多少？', options: ['约 1.4 亿', '约 14 亿', '约 140 亿', '约 1400 万'], answer: 1 },
  { id: 'ce-14', band: 3, stem: '珠穆朗玛峰的海拔大约是多少米？', options: ['约 5000 米', '约 8849 米', '约 12000 米', '约 3000 米'], answer: 1 },
  { id: 'ce-15', band: 3, stem: '人体最大的器官是什么？', options: ['心脏', '肝脏', '皮肤', '大脑'], answer: 2 },
  { id: 'ce-16', band: 3, stem: '一年中月相从新月到满月大约需要多少天？', options: ['约 7 天', '约 15 天', '约 30 天', '约 90 天'], answer: 1 },
  { id: 'ce-17', band: 3, stem: '正常成年人的静息心率大约是多少次/分钟？', options: ['约 40 次', '约 70 次', '约 120 次', '约 200 次'], answer: 1 },
  { id: 'ce-18', band: 3, stem: '一张标准 A4 纸的面积大约是多少？', options: ['约 60 平方厘米', '约 600 平方厘米', '约 6000 平方厘米', '约 6 平方米'], answer: 1 },
  { id: 'ce-19', band: 3, stem: '世界上最深的海洋（马里亚纳海沟）深度大约是多少？', options:['约 1000 米', '约 5000 米', '约 11000 米', '约 30000 米'], answer: 2 },
  { id: 'ce-20', band: 3, stem: '一个成年人全身的骨头大约有多少块？', options: ['约 106 块', '约 206 块', '约 306 块', '约 506 块'], answer: 1 },
  { id: 'ce-21', band: 2, stem: '一个鸡蛋大约有多重？', options: ['约 5 克', '约 50 克', '约 500 克', '约 5 千克'], answer: 1 },
  { id: 'ce-22', band: 2, stem: '一列高铁的运行速度大约是多少？', options: ['约 80 千米/时', '约 350 千米/时', '约 800 千米/时', '约 1500 千米/时'], answer: 1 },
  { id: 'ce-23', band: 3, stem: '人类第一次登上月球是在哪一年？', options: ['1959 年', '1969 年', '1979 年', '1989 年'], answer: 1 },
  { id: 'ce-24', band: 3, stem: '一瓶 500 毫升的矿泉水大约有多重？', options: ['约 50 克', '约 500 克', '约 1 千克', '约 5 千克'], answer: 1 },
]
