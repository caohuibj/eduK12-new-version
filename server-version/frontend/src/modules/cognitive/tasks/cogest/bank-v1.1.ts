/** Unpublished 1.1.0 revision: 20 source-anchored reality-estimation candidates.
 * HOLD: not enough distinct reviewed items for unchanged standard=30/research=36.
 * Item intervals are authored coarse magnitude choices, NOT clinical/population scoring ranges.
 */
export const COGEST_STIMULUS_SET_VERSION = 'cogest-zh-v1.1.0'
export type CogestItem = {id:string; band:1|2|3; stem:string; options:[string,string,string,string]; answer:0|1|2|3; explanation:string; unit:string; referenceValue:number; optionIntervals:[number,number][]; sourceUrl:string}
export const COGEST_BANK: CogestItem[] = [
  {
    "id": "ce11-r01",
    "band": 1,
    "stem": "一部普通手持手机（不含外壳配件）的质量，哪个区间最合理？",
    "options": [
      "50–500 克",
      "1000–5000 克",
      "10000–50000 克",
      "1–10 克"
    ],
    "answer": 0,
    "explanation": "NIST以手机约150克为数量级示例；品牌型号有差异。",
    "unit": "克",
    "referenceValue": 150,
    "optionIntervals": [
      [
        50,
        500
      ],
      [
        1000,
        5000
      ],
      [
        10000,
        50000
      ],
      [
        1,
        10
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r02",
    "band": 1,
    "stem": "一个中等大小的新鲜苹果的质量，哪个区间最合理？",
    "options": [
      "1000–3000 克",
      "5000–10000 克",
      "1–5 克",
      "50–300 克"
    ],
    "answer": 3,
    "explanation": "NIST中等苹果示例约100克；大小品种会影响实际质量。",
    "unit": "克",
    "referenceValue": 100,
    "optionIntervals": [
      [
        1000,
        3000
      ],
      [
        5000,
        10000
      ],
      [
        1,
        5
      ],
      [
        50,
        300
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r03",
    "band": 1,
    "stem": "一只普通成年家猫的质量，哪个区间最合理？",
    "options": [
      "500–1000 千克",
      "0.05–0.2 千克",
      "2–10 千克",
      "50–100 千克"
    ],
    "answer": 2,
    "explanation": "NIST家猫示例约5千克；不是动物健康标准。",
    "unit": "千克",
    "referenceValue": 5,
    "optionIntervals": [
      [
        500,
        1000
      ],
      [
        0.05,
        0.2
      ],
      [
        2,
        10
      ],
      [
        50,
        100
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r04",
    "band": 1,
    "stem": "一辆成人非电动自行车（不载人或货物）的质量，哪个区间最合理？",
    "options": [
      "0.5–2 千克",
      "5–30 千克",
      "100–300 千克",
      "1000–3000 千克"
    ],
    "answer": 1,
    "explanation": "NIST自行车示例约15千克；车型和材料会变化。",
    "unit": "千克",
    "referenceValue": 15,
    "optionIntervals": [
      [
        0.5,
        2
      ],
      [
        5,
        30
      ],
      [
        100,
        300
      ],
      [
        1000,
        3000
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r05",
    "band": 1,
    "stem": "一辆小型家用轿车（不含乘客及货物）的质量，哪个区间最合理？",
    "options": [
      "100–300 千克",
      "500–3000 千克",
      "10000–30000 千克",
      "10–50 千克"
    ],
    "answer": 1,
    "explanation": "NIST小汽车示例约1300千克；不要求记住特定车型。",
    "unit": "千克",
    "referenceValue": 1300,
    "optionIntervals": [
      [
        100,
        300
      ],
      [
        500,
        3000
      ],
      [
        10000,
        30000
      ],
      [
        10,
        50
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r06",
    "band": 1,
    "stem": "一头成年亚洲象的体重数量级，哪个区间最合理？",
    "options": [
      "2–8 吨",
      "20–50 吨",
      "0.02–0.1 吨",
      "0.2–0.5 吨"
    ],
    "answer": 0,
    "explanation": "动物园列成年亚洲象雌性约2.72吨、雄性约5吨；本题只判吨级而非精确体重。",
    "unit": "吨",
    "referenceValue": 3,
    "optionIntervals": [
      [
        2,
        8
      ],
      [
        20,
        50
      ],
      [
        0.02,
        0.1
      ],
      [
        0.2,
        0.5
      ]
    ],
    "sourceUrl": "https://animals.sandiegozoo.org/animals/elephant"
  },
  {
    "id": "ce11-r07",
    "band": 1,
    "stem": "一个供成人比赛使用的高尔夫球的质量，哪个区间最合理？",
    "options": [
      "300–600 克",
      "0.1–1 克",
      "3–10 克",
      "30–60 克"
    ],
    "answer": 3,
    "explanation": "NIST高尔夫球示例约46克；运动接触经验可能影响判断。",
    "unit": "克",
    "referenceValue": 46,
    "optionIntervals": [
      [
        300,
        600
      ],
      [
        0.1,
        1
      ],
      [
        3,
        10
      ],
      [
        30,
        60
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r08",
    "band": 2,
    "stem": "一支未经削短的普通木杆铅笔的长度，哪个区间最合理？",
    "options": [
      "0.5–2 厘米",
      "10–25 厘米",
      "50–100 厘米",
      "200–400 厘米"
    ],
    "answer": 1,
    "explanation": "NIST铅笔示例约19厘米；题面排除削短的铅笔。",
    "unit": "厘米",
    "referenceValue": 19,
    "optionIntervals": [
      [
        0.5,
        2
      ],
      [
        10,
        25
      ],
      [
        50,
        100
      ],
      [
        200,
        400
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r09",
    "band": 2,
    "stem": "常见高速公路的一条机动车道有多宽？选择最合理区间。",
    "options": [
      "2.5–4.5 米",
      "10–20 米",
      "50–100 米",
      "0.2–0.5 米"
    ],
    "answer": 0,
    "explanation": "NIST高速公路车道示例约3.7米；不是本项目规定的道路标准。",
    "unit": "米",
    "referenceValue": 3.7,
    "optionIntervals": [
      [
        2.5,
        4.5
      ],
      [
        10,
        20
      ],
      [
        50,
        100
      ],
      [
        0.2,
        0.5
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r10",
    "band": 2,
    "stem": "市区常见的大型单层公交车（非微型、非铰接车型）的车身长度，哪个区间最合理？",
    "options": [
      "30–60 米",
      "100–200 米",
      "1–3 米",
      "8–15 米"
    ],
    "answer": 3,
    "explanation": "制造商E12单层公交示例长12.17米；用于支持十米级判断，不当作所有车型的分布。",
    "unit": "米",
    "referenceValue": 12.17,
    "optionIntervals": [
      [
        30,
        60
      ],
      [
        100,
        200
      ],
      [
        1,
        3
      ],
      [
        8,
        15
      ]
    ],
    "sourceUrl": "https://en.yutong.com/products/E12.shtml"
  },
  {
    "id": "ce11-r11",
    "band": 2,
    "stem": "一个成人室内排球沿球面最大圆周绕一整圈的长度，哪个区间最合理？",
    "options": [
      "150–200 厘米",
      "2–5 厘米",
      "10–20 厘米",
      "60–70 厘米"
    ],
    "answer": 3,
    "explanation": "NIST排球周长示例约66厘米；题目问周长，不是直径。“一整圈”明确为最大圆周，排除任意小圆。",
    "unit": "厘米",
    "referenceValue": 66,
    "optionIntervals": [
      [
        150,
        200
      ],
      [
        2,
        5
      ],
      [
        10,
        20
      ],
      [
        60,
        70
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r12",
    "band": 2,
    "stem": "一台常见立式双门家用冰箱，冷藏和冷冻室合计的可用容量，哪个区间最合理？（非迷你冰箱、非商用冷柜）",
    "options": [
      "1–10 升",
      "100–800 升",
      "2000–5000 升",
      "20000–50000 升"
    ],
    "answer": 1,
    "explanation": "海尔双门家用冰箱示例净容量475升。题面不提供箱体尺寸，需按日常冰箱尺度判断百升级；不把单一型号当产品分布。",
    "unit": "升",
    "referenceValue": 475,
    "optionIntervals": [
      [
        1,
        10
      ],
      [
        100,
        800
      ],
      [
        2000,
        5000
      ],
      [
        20000,
        50000
      ]
    ],
    "sourceUrl": "https://www.haier.com/in/refrigerators/haier-475l-2-star-graphite-black-top-mount-frost-free-refrigerator-hrf-5252pgk-n.shtml"
  },
  {
    "id": "ce11-r13",
    "band": 2,
    "stem": "供四至六名成年人日常用餐的普通长方形餐桌，桌面的面积最接近哪个区间？（不把椅子或周围通道算入）",
    "options": [
      "0.1–0.3 平方米",
      "0.5–3 平方米",
      "10–30 平方米",
      "0.01–0.05 平方米"
    ],
    "answer": 1,
    "explanation": "IKEA四至六人桌面示例160×90厘米约1.44平方米；同页150–180厘米长的中型餐桌提供尺度参照。题面不给尺寸，需要自行估计现实桌面大小。",
    "unit": "平方米",
    "referenceValue": 1.44,
    "optionIntervals": [
      [
        0.1,
        0.3
      ],
      [
        0.5,
        3
      ],
      [
        10,
        30
      ],
      [
        0.01,
        0.05
      ]
    ],
    "sourceUrl": "https://www.ikea.com/se/en/rooms/dining/how-to/your-guide-to-choosing-the-perfect-dining-table-pxmuEeoQuGpjiwXh0U6yTPxN/"
  },
  {
    "id": "ce11-r14",
    "band": 2,
    "stem": "一只供成年人泡澡的普通家用浴缸，装水容量的数量级最接近哪个区间？",
    "options": [
      "100–400 升",
      "1000–4000 升",
      "1–5 升",
      "10–30 升"
    ],
    "answer": 0,
    "explanation": "NIST浴缸容量示例约235升；型号、是否放满与实际入浴量不同，题目问容积数量级。",
    "unit": "升",
    "referenceValue": 235,
    "optionIntervals": [
      [
        100,
        400
      ],
      [
        1000,
        4000
      ],
      [
        1,
        5
      ],
      [
        10,
        30
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r15",
    "band": 3,
    "stem": "一只常见单人马克杯（不是迷你浓缩咖啡杯或超大杯）的容量，哪个区间最合理？",
    "options": [
      "2000–5000 毫升",
      "1–10 毫升",
      "20–60 毫升",
      "200–500 毫升"
    ],
    "answer": 3,
    "explanation": "制造商多款马克杯标注约220至450毫升；这里只判断数百毫升的量级。",
    "unit": "毫升",
    "referenceValue": 300,
    "optionIntervals": [
      [
        2000,
        5000
      ],
      [
        1,
        10
      ],
      [
        20,
        60
      ],
      [
        200,
        500
      ]
    ],
    "sourceUrl": "https://www.ikea.is/en/products/cookware-tableware/coffee-and-tea/mugs-and-cups"
  },
  {
    "id": "ce11-r16",
    "band": 3,
    "stem": "日常常见的可多次开启使用的小瓶滴眼液包装瓶（非一次性单剂量小支），标称容量的数量级最接近哪个区间？",
    "options": [
      "0.1–1 毫升",
      "5–30 毫升",
      "100–500 毫升",
      "1000–3000 毫升"
    ],
    "answer": 1,
    "explanation": "NIST小滴眼液瓶示例15毫升；问容器规格，不涉及剂量或用药建议。排除一次性单剂量包装；不把0.4毫升单剂量规格判成错误的多剂量瓶。",
    "unit": "毫升",
    "referenceValue": 15,
    "optionIntervals": [
      [
        0.1,
        1
      ],
      [
        5,
        30
      ],
      [
        100,
        500
      ],
      [
        1000,
        3000
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation"
  },
  {
    "id": "ce11-r17",
    "band": 3,
    "stem": "一张平铺的A4纸，单面面积最接近哪个区间？",
    "options": [
      "50–100 平方厘米",
      "500–800 平方厘米",
      "5000–8000 平方厘米",
      "5–10 平方厘米"
    ],
    "answer": 1,
    "explanation": "佳能列A4纸规格210×297毫米，审计计算单面面积623.7平方厘米；不在题面给尺寸。",
    "unit": "平方厘米",
    "referenceValue": 623.7,
    "optionIntervals": [
      [
        50,
        100
      ],
      [
        500,
        800
      ],
      [
        5000,
        8000
      ],
      [
        5,
        10
      ]
    ],
    "sourceUrl": "https://asia.canon/en/support/6200298100"
  },
  {
    "id": "ce11-r18",
    "band": 3,
    "stem": "一张普通成人单人床的床垫，上表面的面积最接近哪个区间？",
    "options": [
      "1–3 平方米",
      "10–30 平方米",
      "0.02–0.05 平方米",
      "0.2–0.5 平方米"
    ],
    "answer": 0,
    "explanation": "制造商成人单人床垫示例0.9×2米，审计面积1.8平方米；题面不提供计算尺寸。",
    "unit": "平方米",
    "referenceValue": 1.8,
    "optionIntervals": [
      [
        1,
        3
      ],
      [
        10,
        30
      ],
      [
        0.02,
        0.05
      ],
      [
        0.2,
        0.5
      ]
    ],
    "sourceUrl": "https://www.ikea.gr/en/products/valevag-mattress-firm-and-mattress-pad-90x200-cm/29572372/"
  },
  {
    "id": "ce11-r19",
    "band": 3,
    "stem": "一块用于成人国际十一人制比赛的足球场，场内地面的面积最接近哪个区间？",
    "options": [
      "50000–100000 平方米",
      "50–100 平方米",
      "500–1000 平方米",
      "5000–10000 平方米"
    ],
    "answer": 3,
    "explanation": "IFAB国际比赛长100–110米、宽64–75米，面积6400–8250平方米；普通非国际比赛场地不适用本题。",
    "unit": "平方米",
    "referenceValue": 7140,
    "optionIntervals": [
      [
        50000,
        100000
      ],
      [
        50,
        100
      ],
      [
        500,
        1000
      ],
      [
        5000,
        10000
      ]
    ],
    "sourceUrl": "https://theifab.com/laws/latest/the-field-of-play/"
  },
  {
    "id": "ce11-r20",
    "band": 3,
    "stem": "家中厨房水龙头正常供水并完全打开，向一个空的10升水桶接满水，所需时间最接近哪个区间？（非滴水、无断水或故障）",
    "options": [
      "0.01–0.05 分钟",
      "1–5 分钟",
      "20–60 分钟",
      "200–600 分钟"
    ],
    "answer": 1,
    "explanation": "EPA厨房龙头资料给出1.5–2.2美制加仑/分钟的产品流量参照，约5.7–8.3升/分钟；审计计算接10升约1.2–1.8分钟。题面不告诉流量，依生活经验估计；水压低或节流状态不适用。",
    "unit": "分钟",
    "referenceValue": 1.5,
    "optionIntervals": [
      [
        0.01,
        0.05
      ],
      [
        1,
        5
      ],
      [
        20,
        60
      ],
      [
        200,
        600
      ]
    ],
    "sourceUrl": "https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P10180T6.TXT"
  }
]
