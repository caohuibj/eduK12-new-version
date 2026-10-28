# KIMS-39（Kentucky Inventory of Mindfulness Skills 原版 39 题）：工作材料与验收状态

- `source.md`：作者官方 PDF 的逐字题文（39 题英文原文，含弯撇号 U+2019 与弯引号 U+201C/U+201D）、指导语与五档选项、第 3 页官方计分键逐字摘录（含 PDF 内印出的 Baer, Smith, & Allen 2004 引文）、来源 URL 与引文、许可实况（作者学术页公开托管、未附明确再分发许可声明）、与 ffmq39/ffmq15（FFMQ 家族）的前身关系声明；另记录 PDF 格式异常与提取伪影（第 36 题题号后原文双空格、第 16 题 layout 提取词间距伪影、计分表 "12R" 后排版空格、引文原文无期号）。
- `scoring.json` / `scoring.py`：参考计算。四技能 observe 1,5,9,13,17,21,25,29,30,33,37,39、describe 2,6,10,14,18,22,26,34、act_aware 3,7,11,15,19,23,27,31,35,38、nonjudge 4,8,12,16,20,24,28,32,36（12/8/10/9，恰划分 1–39）；反向 18 题（3,4,8,11,12,14,16,18,20,22,23,24,27,28,31,32,35,36），反向公式 6−原分；缺答任一题该技能 sum/mean 为 null（complete_required 为产品保守约定，非原作者规则）；PDF 计分表无总分行，故不设 total。
- `test_scoring.py`：9 项测试（划分与反向键、全 1、全 5、全 3 中点、含反向中间值循环作答、四技能分别缺 1 题、全缺、混合缺答、非法输入），`python test_scoring.py` 全部通过。
- `report_sample.html`：仿 bes20/ffmq39 原生模板的静态中文样稿，含 hero、模拟数据声明、四技能真实范围条形图（12–60 / 8–40 / 10–50 / 9–45）、逐技能"想一想+小行动"卡片、结尾与页脚（引文/许可/人群限定）；全部数字标注为模拟，无等级、排名、诊断或临床界值话术。
- `server-version/backend/src/modules/scale/instruments/kims39/1.0.0/instrument.ts`：原生 ScaleInstrumentSourceV1 条目（catalog-only 候选），39 题英文原文、计分区与 scoring.json 一致、10 个 goldenCases 与测试 golden 值一致。

## 验证结论

1. **题文验收 PASS。** 39 条英文题干与五档选项逐字取自作者官方 PDF 提取文本（pypdf stream 提取 + layout 模式交叉核对，空白折叠后两种模式 39 题零分歧）；第 3 页官方计分键逐字摘录并核对为 12/8/10/9、18 道反向题，与预期一致；四组题号集合恰划分 1–39、无重叠无遗漏（测试断言覆盖）。
2. **计分与测试 PASS。** `python docs/mindfulness-content-20261028/kims39/test_scoring.py` 9 项全绿；instrument.ts 的 JSON 载荷与 scoring.json 交叉一致（题号分组、反向题、缺答策略、求和范围逐项核对），goldenCases 期望值由同一计分逻辑生成。
3. **报告在样稿层面完整。** 静态中文样稿含四技能得分条形图（真实 min–max）、逐技能反思/行动、局限与许可声明均已呈现；尚未做动态集成、缺答显示的实际接入及浏览器视觉检查。

## 缺口与保留事项

- 作者学术页（https://www.ruthbaer.com/academics/）公开托管该 PDF，但**页面未附明确再分发许可声明**；本条目标记 `license:author_hosted_pdf`、`license:redistribution_review_pending`，翻译、再分发或任何商业使用前需另行确认权利范围。与同作者家族 ffmq15（作者文件 CC BY 3.0）许可情形不同，两者不互相套用。
- PDF 第 3 页计分说明内印有原版引文（"For more information, see:" 引出，非页脚）：Baer, R. A., Smith G. T., & Allen, K. B. (2004), Assessment, 11, 191-206；原文未标期号，本条目按标准出版记录登记为 11(3), 191–206（DOI: 10.1177/1073191104268029，PDF 本身未印 DOI）。
- 缺答处理为产品保守约定（任一题缺答该技能不计算），原作者未规定缺失插补规则；不发明常模、百分位、界值或能力等级。
- 文献中有 Observe 分维在部分样本（尤其无正念练习经验者）内部一致性偏低的已知报告；本条目仅陈述该情况、不作裁定，不据此删题或改键。
- KIMS 是 FFMQ 的前身但结构不同（四技能 vs 五侧面，题本不同）；不与 ffmq39、ffmq15 互换分数、题文或证据。原版验证样本为美国大学生成人样本；本条目按 18 岁以上成人自评使用，语言验证为英文原文（`language_validation:original_en`），无中文人群验证。
