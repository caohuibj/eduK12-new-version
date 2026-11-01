/** Unpublished 1.1.0 revision: 36 source-anchored reality-estimation candidates.
 * Limited item review GO: project-authored descriptive trial draft, not a standardized clinical test.
 * Item intervals are authored coarse magnitude choices, NOT clinical/population scoring ranges.
 */
export const COGEST_STIMULUS_SET_VERSION = 'cogest-zh-v1.1.0'
export type CogestItem = {id:string; band:1|2|3; stem:string; options:[string,string,string,string]; answer:0|1|2|3; explanation:string; unit:string; referenceValue:number; optionIntervals:[number,number][]; sourceUrl:string; auditRange?:[number,number]}
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
  },
  {
    "id": "ce11-r21",
    "band": 2,
    "stem": "一位能够独立快步行走的成年人，在平坦道路上连续快步走一千米（非跑步、不停留），所需时间最接近哪个区间？",
    "options": [
      "5–30 分钟",
      "60–180 分钟",
      "600–1800 分钟",
      "0.05–0.5 分钟"
    ],
    "answer": 0,
    "explanation": "NHS用约3英里/小时说明快步，约4.8千米/小时，对一千米约12.5分钟。项目核查8–25分钟是否落在同一粗量级选项；不是成年人的步速正常范围。题面未提供速度，需从行走经验估计。场景人物为成年人，不评参与者的行走能力。",
    "unit": "分钟",
    "referenceValue": 12.5,
    "optionIntervals": [
      [
        5,
        30
      ],
      [
        60,
        180
      ],
      [
        600,
        1800
      ],
      [
        0.05,
        0.5
      ]
    ],
    "sourceUrl": "https://www.nhs.uk/live-well/exercise/walking-for-health/",
    "auditRange": [
      8,
      25
    ]
  },
  {
    "id": "ce11-r22",
    "band": 2,
    "stem": "普通家用电热水壶装约一至二升常温水，在低海拔地区正常通电烧开，通常需要哪个时间量级？（非旅行或车载小功率水壶）",
    "options": [
      "60–180 分钟",
      "600–1800 分钟",
      "0.01–0.1 分钟",
      "2–15 分钟"
    ],
    "answer": 3,
    "explanation": "厂商家用壶示例：235毫升约50秒；按同类加热速率核查一至二升约3.5–7分钟，加入型号/散热差异后只判断几分钟级。3–10分钟是项目情境核查，不是全壶实测或所有水壶的保证。题面不提供功率或加热速率，需结合烧水经验估计。",
    "unit": "分钟",
    "referenceValue": 6,
    "optionIntervals": [
      [
        60,
        180
      ],
      [
        600,
        1800
      ],
      [
        0.01,
        0.1
      ],
      [
        2,
        15
      ]
    ],
    "sourceUrl": "https://en.russellhobbs.com/product/textures-plus-kettle-22591-70",
    "auditRange": [
      3,
      10
    ]
  },
  {
    "id": "ce11-r23",
    "band": 2,
    "stem": "一整条常见家庭装切片吐司（单条长方形面包，非迷你餐包、非多条组合装），按日常三明治厚度切好后，大约有多少片？",
    "options": [
      "1000–3000 片",
      "1–3 片",
      "8–50 片",
      "100–300 片"
    ],
    "answer": 2,
    "explanation": "制造商Arnold/Bimbo发布的整条家庭装示例为14份、每份1片。项目用10–30片核查量级，不声称所有吐司都落在该统计范围；厚切/薄切和大小会变化。题面不报条长或片厚，需以日常面包尺度估计，涉及烘焙食品经验。",
    "unit": "片",
    "referenceValue": 14,
    "optionIntervals": [
      [
        1000,
        3000
      ],
      [
        1,
        3
      ],
      [
        8,
        50
      ],
      [
        100,
        300
      ]
    ],
    "sourceUrl": "https://smartlabel.labelinsight.com/product/9415412/nutrition",
    "auditRange": [
      10,
      30
    ]
  },
  {
    "id": "ce11-r24",
    "band": 2,
    "stem": "一支普通餐桌烛台用的直杆蜡烛（约成人食指粗、二十至三十厘米长，非生日小蜡烛、非巨型粗柱蜡烛），在室内无强风时连续燃尽，大约需要哪个时间量级？",
    "options": [
      "0.001–0.01 小时",
      "0.1–0.5 小时",
      "2–12 小时",
      "48–240 小时"
    ],
    "answer": 2,
    "explanation": "IKEA餐桌细长蜡烛示例高25厘米、直径22毫米，标称燃烧5.5小时。项目以3–10小时核查普通相近类型；材质、直径和风会改变时长。题面不报燃烧速率或质量，需要依据生活过程估计，非操作实验。",
    "unit": "小时",
    "referenceValue": 5.5,
    "optionIntervals": [
      [
        0.001,
        0.01
      ],
      [
        0.1,
        0.5
      ],
      [
        2,
        12
      ],
      [
        48,
        240
      ]
    ],
    "sourceUrl": "https://www.ikea.com/nl/en/p/klokhet-unscented-taper-candle-pale-blue-50612700/",
    "auditRange": [
      3,
      10
    ]
  },
  {
    "id": "ce11-r25",
    "band": 2,
    "stem": "搬动一台普通家用台式微波炉时，机器本身的质量最接近哪个区间？（已取出食物，不含包装，非大型嵌入式或商用设备）",
    "options": [
      "5–30 千克",
      "50–150 千克",
      "500–1500 千克",
      "0.1–1 千克"
    ],
    "answer": 0,
    "explanation": "Panasonic台式家用微波炉示例净质量11.5千克，Samsung同类示例约12千克。8–25千克是项目对普通家用台式机的粗核查，不是全部型号分布。题面不给材料或结构质量，需从厨房电器的现实重量经验估计，不要求参与者实际搬运。",
    "unit": "千克",
    "referenceValue": 11.5,
    "optionIntervals": [
      [
        5,
        30
      ],
      [
        50,
        150
      ],
      [
        500,
        1500
      ],
      [
        0.1,
        1
      ]
    ],
    "sourceUrl": "https://help.na.panasonic.com/answers/features-and-specifications-microwave-oven-nn-st676s/",
    "auditRange": [
      8,
      25
    ]
  },
  {
    "id": "ce11-r26",
    "band": 2,
    "stem": "把普通复印纸平整叠放并轻压齐，纸本身约五厘米厚（不算包装、不是卡纸），大约有多少张？（一张纸的正反两面仍只算一张）",
    "options": [
      "200–1000 张",
      "5000–20000 张",
      "1–10 张",
      "20–80 张"
    ],
    "answer": 0,
    "explanation": "HP/Sylvamo普通复印纸示例厚104±3微米，五厘米约481张。项目用350–650张核查类似普通纸的量级；纸质和叠放间隙会变。题面不给单张厚度，需要从纸叠经验推断；明确张/页不同，未给齐算术输入。",
    "unit": "张",
    "referenceValue": 481,
    "optionIntervals": [
      [
        200,
        1000
      ],
      [
        5000,
        20000
      ],
      [
        1,
        10
      ],
      [
        20,
        80
      ]
    ],
    "sourceUrl": "https://hp-papers.eu/wp-content/uploads/2024/01/HP-Copy-Nymolla-TDS-3.pdf",
    "auditRange": [
      350,
      650
    ]
  },
  {
    "id": "ce11-r27",
    "band": 2,
    "stem": "在中国大陆普通中学，一个常规班级按常见课桌座位坐满，大约有多少名学生？（非小班教学、非年级合班大会）",
    "options": [
      "2000–8000 人",
      "1–5 人",
      "20–80 人",
      "200–800 人"
    ],
    "answer": 2,
    "explanation": "教育部2002年文件中的普通中学班额参照为45–50人；仅作为几十人场景的历史事实锚点，不冒称当前法律或实际学校的统计分布。项目核查30–60人能否落在同一粗选项。需要中国大陆课堂经验，不输出教育政策知识分或儿童能力排名。",
    "unit": "人",
    "referenceValue": 48,
    "optionIntervals": [
      [
        2000,
        8000
      ],
      [
        1,
        5
      ],
      [
        20,
        80
      ],
      [
        200,
        800
      ]
    ],
    "sourceUrl": "https://www.moe.gov.cn/srcsite/A04/s7051/200206/t20020626_162881.html",
    "auditRange": [
      30,
      60
    ]
  },
  {
    "id": "ce11-r28",
    "band": 2,
    "stem": "约一千平方米的规则空地改成普通小轿车平面停车场，留正常行车通道、不用机械叠层，大约能停多少辆车？",
    "options": [
      "1–5 辆",
      "20–80 辆",
      "200–800 辆",
      "2000–8000 辆"
    ],
    "answer": 1,
    "explanation": "公开专利原文描述一种普通双排布置：车位2.5×5米、车道6米，折合每车约20平方米，一千平方米约50辆，再考虑边角损失。25–60辆是项目情境核查，不是停车工程设计保证。题面不给车位或车道尺寸，需要现实空间估计。",
    "unit": "辆",
    "referenceValue": 50,
    "optionIntervals": [
      [
        1,
        5
      ],
      [
        20,
        80
      ],
      [
        200,
        800
      ],
      [
        2000,
        8000
      ]
    ],
    "sourceUrl": "https://patents.google.com/patent/CN104929401A/zh",
    "auditRange": [
      25,
      60
    ]
  },
  {
    "id": "ce11-r29",
    "band": 2,
    "stem": "把一百枚日常流通的薄圆形金属硬币平放、整齐叠起来（非加厚纪念章、不算包装），总高度最接近哪个区间？",
    "options": [
      "1–3 厘米",
      "5–50 厘米",
      "100–300 厘米",
      "0.05–0.5 厘米"
    ],
    "answer": 1,
    "explanation": "NIST以普通薄硬币厚约1毫米作量级参照，一百枚约10厘米；货币种类有差异，项目核查10–30厘米，不是各国币厚总体分布。题面不给单枚厚度，不要求背某国硬币规格，要估计堆叠高度。",
    "unit": "厘米",
    "referenceValue": 10,
    "optionIntervals": [
      [
        1,
        3
      ],
      [
        5,
        50
      ],
      [
        100,
        300
      ],
      [
        0.05,
        0.5
      ]
    ],
    "sourceUrl": "https://www.nist.gov/pml/owm/metric-si/everyday-estimation",
    "auditRange": [
      10,
      30
    ]
  },
  {
    "id": "ce11-r30",
    "band": 2,
    "stem": "公路上常见的短型标准货运集装箱（单个20英尺标准干货箱，非40英尺大箱、非小收纳箱），空箱内部容积最接近哪个区间？",
    "options": [
      "20–50 立方米",
      "200–500 立方米",
      "0.02–0.1 立方米",
      "0.5–2 立方米"
    ],
    "answer": 0,
    "explanation": "Maersk标准20英尺钢制干货箱列内部容积33立方米；项目用30–36立方米作同类规格核查，不推为全部箱型分布。题面不提供内部长宽高，需按运输大箱的现实尺度推断；物流接触经验会影响判断。",
    "unit": "立方米",
    "referenceValue": 33,
    "optionIntervals": [
      [
        20,
        50
      ],
      [
        200,
        500
      ],
      [
        0.02,
        0.1
      ],
      [
        0.5,
        2
      ]
    ],
    "sourceUrl": "https://www.maersk.com/~/media_sc9/maersk/local-information/files/africa/madagascar/overview/container-type-and-sizes/dry-equipment-specifications.pdf",
    "auditRange": [
      30,
      36
    ]
  },
  {
    "id": "ce11-r31",
    "band": 2,
    "stem": "一层约八十厘米长的书架，直立单排摆满普通中等厚度小说或课本（非薄册、非超厚辞典、不叠放），大约能放多少本？",
    "options": [
      "2000–10000 本",
      "1–5 本",
      "10–100 本",
      "200–1000 本"
    ],
    "answer": 2,
    "explanation": "出版社平装书示例厚21毫米，八十厘米单排约38本；项目核查25–80本，对应中等厚度而非薄册/巨厚书。该推导不是书厚总体分布，版本会变。题面不给单本厚度，需从书脊尺度与单排空间估计。",
    "unit": "本",
    "referenceValue": 38,
    "optionIntervals": [
      [
        2000,
        10000
      ],
      [
        1,
        5
      ],
      [
        10,
        100
      ],
      [
        200,
        1000
      ]
    ],
    "sourceUrl": "https://www.penguin.co.uk/books/56487/1984-by-orwell-george/9780141036144",
    "auditRange": [
      25,
      80
    ]
  },
  {
    "id": "ce11-r32",
    "band": 2,
    "stem": "一栋普通十层住宅楼，从地面到屋面的高度最接近哪个区间？（非底层超高商业裙房，不计屋顶塔尖或天线）",
    "options": [
      "0.2–0.5 米",
      "2–5 米",
      "20–50 米",
      "100–300 米"
    ],
    "answer": 2,
    "explanation": "住建部2025年发布说明新建住宅层高不低于3米，十层约30米作尺度锚点；26–40米是普通住宅情境的作者核查范围，不是该规范给的高度分布或上限。题面不给层高，需要按建筑经验估计，不考规范条文记忆。",
    "unit": "米",
    "referenceValue": 30,
    "optionIntervals": [
      [
        0.2,
        0.5
      ],
      [
        2,
        5
      ],
      [
        20,
        50
      ],
      [
        100,
        300
      ]
    ],
    "sourceUrl": "https://www.mohurd.gov.cn/xinwen/gzdt/art/2025/art_33f90d1d6a9a403fa4ecae459b5bf186.html",
    "auditRange": [
      26,
      40
    ]
  },
  {
    "id": "ce11-r33",
    "band": 2,
    "stem": "一小份一百克未煮的完整糙米，大约有多少粒？（按完整米粒计，不含稻壳、非碎米）",
    "options": [
      "100–500 粒",
      "2000–10000 粒",
      "50000–100000 粒",
      "10–50 粒"
    ],
    "answer": 1,
    "explanation": "原始稻米研究中糙米千粒质量20.3–22.7克，因此一百克约4405–4926粒；这是该研究样本的物性推导，不是所有品种的范围或饮食建议。题面不给单粒质量，要用米粒细小与一小份的经验估计数量级。",
    "unit": "粒",
    "referenceValue": 4651,
    "optionIntervals": [
      [
        100,
        500
      ],
      [
        2000,
        10000
      ],
      [
        50000,
        100000
      ],
      [
        10,
        50
      ]
    ],
    "sourceUrl": "https://www.jstage.jst.go.jp/article/jcs/77/3/77_3_315/_article",
    "auditRange": [
      4405,
      4927
    ]
  },
  {
    "id": "ce11-r34",
    "band": 2,
    "stem": "一辆普通家用紧凑型非混动汽油车，正常加满一箱油后在通畅路况正常驾驶、途中不加油，大约能行驶多远？（非重载拖车、非极端驾驶）",
    "options": [
      "300–1500 千米",
      "3000–15000 千米",
      "3–15 千米",
      "30–150 千米"
    ],
    "answer": 0,
    "explanation": "Skoda原厂资料中汽油Fabia配普通选装油箱时WLTP续航超过900千米。项目用400–1200千米核查家用紧凑汽油车量级，实际驾驶、油箱和车型会变，非出行里程保证。题面不给油箱容量/油耗，需按加油出行经验估计。",
    "unit": "千米",
    "referenceValue": 900,
    "optionIntervals": [
      [
        300,
        1500
      ],
      [
        3000,
        15000
      ],
      [
        3,
        15
      ],
      [
        30,
        150
      ]
    ],
    "sourceUrl": "https://www.skoda-storyboard.com/en/press-kits/the-new-skoda-fabia-media-launch-press-kit/the-skoda-fabia-setting-a-new-benchmark-in-its-segment/",
    "auditRange": [
      400,
      1200
    ]
  },
  {
    "id": "ce11-r35",
    "band": 2,
    "stem": "一台普通家用全自动滚筒洗衣机，一次标准节水洗衣程序洗完一桶日常衣物（包括漂洗，非快洗、不额外加漂洗），总耗水量最接近哪个区间？",
    "options": [
      "5000–15000 升",
      "1–5 升",
      "20–150 升",
      "500–1500 升"
    ],
    "answer": 2,
    "explanation": "欧盟官方产品登记中Bosch八千克滚筒机Eco40–60每周期47升。30–100升仅为作者对普通节水程序的粗核查，不是所有洗衣机分布；负载/程序会变。题面不报进水流量或各阶段次数，需要从完整洗涤过程估计水量。",
    "unit": "升",
    "referenceValue": 47,
    "optionIntervals": [
      [
        5000,
        15000
      ],
      [
        1,
        5
      ],
      [
        20,
        150
      ],
      [
        500,
        1500
      ]
    ],
    "sourceUrl": "https://eprel.ec.europa.eu/screen/product/washingmachines2019/1427133",
    "auditRange": [
      30,
      100
    ]
  },
  {
    "id": "ce11-r36",
    "band": 2,
    "stem": "一个常见登机拉杆箱（能放入客舱行李架的成人小旅行箱，非手提小包、非大型托运箱），未扩展时装物品的内部容积最接近哪个区间？",
    "options": [
      "0.02–0.2 升",
      "1–5 升",
      "20–60 升",
      "200–600 升"
    ],
    "answer": 2,
    "explanation": "Samsonite登机箱示例未扩展38升；25–50升是项目对常见小旅行箱的粗核查，不是所有航司标准或产品总体范围。题面不给箱体长宽高，需要按携带衣物/行李的日常空间经验估计。",
    "unit": "升",
    "referenceValue": 38,
    "optionIntervals": [
      [
        0.02,
        0.2
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
    "sourceUrl": "https://www.samsonite.co.uk/proxis-spinner--4-wheels--55cm-slim-matt-climbing-ivy/159484-9781.html",
    "auditRange": [
      25,
      50
    ]
  }
]

export const bankMeta = {stimulusSetVersion:'cogest-zh-v1.1.0',source:'Original project-authored quantity estimates; limited item review permits trial draft; linked factual anchors are not psychometric validation',license:'internal-generated',itemSetRole:'form' as const}
