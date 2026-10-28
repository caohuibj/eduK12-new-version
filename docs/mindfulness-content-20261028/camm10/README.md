# CAMM-10（Child and Adolescent Mindfulness Measure 原版 10 题）：工作材料与验收状态

- `source.md`：作者官方 PDF 的逐字题文（10 题英文原文，含弯撇号 U+2019）、指导语与 0–4 五档选项（含原文表头 "Some-times True" 的排版断词连字符）、第 2 页官方计分说明逐字摘录（含 "First reverse all scores by changing 0 to 4, 1 to 3, 3 to 1, and 4 to 0 (2 stays unchanged). Then sum all items. Higher scores correspond to higher levels of mindfulness." 与 PDF 内印出的 Greco, L., Baer, R. A., & Smith, G. T. (2011) 引文）、来源 URL 与引文、许可实况（作者学术页公开托管、未附明确再分发许可声明）、与 kims39/ffmq39/ffmq15（KIMS/FFMQ 家族）的前身关系声明；另记录 PDF 格式异常与提取伪影（第 2、5、6 题选项行断行、第 8、9 题题干跨行、layout 模式多空格伪影、引文原文无期号）。
- `scoring.json` / `scoring.py`：参考计算。单维 mindful_awareness（恰为 1–10 全部题目，无重叠无遗漏）；反向 10 题（全部），反向公式 4−原分（0↔4、1↔3、2 不变，与 PDF 原句逐字对应）；缺答任一题 sum/mean 为 null（complete_required 为产品保守约定，非原作者规则）；单维即官方"全部反向后求和"的总分，范围 0–40，不另设独立 total，不发明子维度。
- `test_scoring.py`：12 项测试（划分与反向键覆盖、全 0 → 40、全 4 → 0、全 2 中点 → 20、混合精确值 24、逐题逐档反向等价 4−原分且和恒在 0–40、缺 1 题 → null、全缺、missing None、非法取值、非法题号、非字典输入），`python docs/mindfulness-content-20261028/camm10/test_scoring.py` 全部通过。
- `report_sample.html`：仿 bes20 原生模板的静态中文样稿，含 hero、模拟数据声明、单维总分真实范围条形图（0–40）、"给自己 + 给支持者（家长/教师）"两张"想一想+小行动"解读卡片、结尾与页脚（引文/许可/人群限定）；面向青少年及其支持者的口吻，全部数字标注为模拟，明确说明这是儿童青少年工具、结果不定义孩子好坏，无等级、排名、诊断或临床界值话术。
- `server-version/backend/src/modules/scale/instruments/camm10/1.0.0/instrument.ts`：原生 ScaleInstrumentSourceV1 条目（catalog-only 候选），10 题英文原文、计分区与 scoring.json 一致、6 个 goldenCases 与测试 golden 值一致。

## 验证结论

1. **题文验收 PASS。** 10 条英文题干与五档选项逐字取自作者官方 PDF 提取文本（pypdf plain 提取 + layout 模式交叉核对，空白折叠后两种模式 10 题零分歧）；第 2 页官方计分说明逐字摘录并核对为"全部 10 题反向后求和"（0↔4、1↔3、2 不变，等价于 4−原分），与预期单维结构一致；题号集合恰为 1–10（测试断言覆盖）。
2. **计分与测试 PASS。** `python docs/mindfulness-content-20261028/camm10/test_scoring.py` 12 项全绿；总分范围 0–40（全 0 → 40、全 4 → 0 两端点断言）；instrument.ts 的 JSON 载荷与 scoring.json 交叉一致（题号集合、反向题、反向公式、缺答策略、求和范围逐项核对），goldenCases 期望值（40 / 0 / 20 / 24 / null / null）与测试同源。
3. **报告在样稿层面完整。** 静态中文样稿含单维总分条形图（真实 0–40 范围）、面向青少年与支持者的解读卡片、局限与许可声明均已呈现；尚未做动态集成、缺答显示的实际接入及浏览器视觉检查。

## 缺口与保留事项

- 作者学术页（https://www.ruthbaer.com/academics/）公开托管该 PDF，但**页面未附明确再分发许可声明**；本条目标记 `license:author_hosted_pdf`、`license:redistribution_review_pending`，翻译、再分发或任何商业使用前需另行确认权利范围。与同作者家族 ffmq15（作者文件 CC BY 3.0）许可情形不同，两者不互相套用。
- PDF 第 2 页计分说明末尾印有引文（"For more information, see:" 引出，非页脚）：Greco, L., Baer, R. A., & Smith, G. T. (2011), Psychological Assessment, 23, 606-614；原文无期号、第一作者无中间名缩写，本条目按标准出版记录登记为 23(3), 606–614（DOI: 10.1037/a0022877，PDF 本身未印 DOI）。
- 缺答处理为产品保守约定（任一题缺答总分不计算），原作者未规定缺失插补规则；不发明常模、百分位、界值、年龄分段解释或能力等级。
- **PDF 与作者页面均未印年龄下限或适用年龄段说明**（"9 岁以上"等说法不见于本 PDF）；已发表记录为美国社区学校儿童青少年样本，成人样本使用亦见诸文献。本条目按儿童青少年自评工具登记（`population:child_adolescent`、`population:k12`），catalog 层不设硬性年龄门槛，接入时按产品人群策略另行约束。
- CAMM 与 KIMS/FFMQ 同属 Ruth Baer 学术页托管家族但结构不同（单维 10 题 vs 四技能/五侧面，题本不同）；不与 kims39、ffmq39、ffmq15 互换分数、题文或证据。语言验证为英文原文（`language_validation:original_en`），无中文人群验证。
