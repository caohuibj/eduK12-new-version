# FFMQ-39（正念五侧面问卷原版 39 题）：工作材料与验收状态

- `source.md`：作者官方 PDF 的逐字题文（39 题英文原文，含弯引号与原文标点）、指导语与五档选项、第 3 页官方计分键逐字摘录、来源 URL 与引文、许可实况（作者学术页公开托管、未附明确再分发许可声明）、与 ffmq15_zh_cn_research 的长短版关系声明；另记录 PDF 格式异常（第 16 题无句号、第 29 题 images 后无逗号、第 35 题 "depending what" 无 on、第 24 题排版间距异常）。
- `scoring.json` / `scoring.py`：参考计算。五维 observe 1,6,11,15,20,26,31,36、describe 2,7,12,16,22,27,32,37、act_aware 5,8,13,18,23,28,34,38、nonjudge 3,10,14,17,25,30,35,39、nonreact 4,9,19,21,24,29,33（8/8/8/8/7，恰划分 1–39）；反向 19 题（3,5,8,10,12,13,14,16,17,18,22,23,25,28,30,34,35,38,39），反向公式 6−原分；缺答任一题该维 sum/mean 为 null（complete_required 为产品保守约定，非原作者规则）；PDF 计分表无总分行，故不设 total。
- `test_scoring.py`：10 项测试（划分、全 1、全 5、含反向中间值、全 3 中点、单维缺 1 题、全缺、混合缺答、反向题缺答、非法输入），`python test_scoring.py` 全部通过。
- `report_sample.html`：仿 bes20 原生模板的静态中文样稿，含 hero、模拟数据声明、五维真实范围条形图（8–40 / 8–40 / 8–40 / 8–40 / 7–35）、逐维"想一想+小行动"卡片、结尾与页脚（引文/许可/人群限定）；全部数字标注为模拟，无等级、排名、诊断或临床界值话术。
- `server-version/backend/src/modules/scale/instruments/ffmq39/1.0.0/instrument.ts`：原生 ScaleInstrumentSourceV1 条目（catalog-only 候选），39 题英文原文、计分区与 scoring.json 一致、goldenCases 与测试一致。

## 验证结论

1. **题文验收 PASS。** 39 条英文题干与五档选项逐字取自作者官方 PDF 提取文本（pypdf stream 提取 + layout 模式交叉核对断行/断字，拼接处仅还原空格）；第 3 页官方计分键逐字摘录并核对为 8/8/8/8/7、19 道反向题，与预期一致。
2. **报告在样稿层面完整。** 原生模板 + 原创插图 + 五维得分条形图 + 逐维反思/行动 + 局限与许可声明均已呈现；尚未做动态集成、缺答显示的实际接入及浏览器视觉检查。

## 缺口与保留事项

- 作者学术页（https://www.ruthbaer.com/academics/）公开托管该 PDF，但**页面未附明确再分发许可声明**；本条目标记 `license:author_hosted_pdf`、`license:redistribution_review_pending`，翻译、再分发或任何商业使用前需另行确认权利范围。与同家族 ffmq15（作者文件 CC BY 3.0）许可情形不同，两者不互相套用。
- PDF 本身未印期刊引文页脚（仅作者署名与 University of Kentucky）；引文按原版研究标准出处记录：Baer, Smith, Hopkins, Krietemeyer, & Toney (2006), Assessment 13(1), 27–45。
- 缺答处理为产品保守约定（任一题缺答该维不计算），原作者未规定缺失插补规则；不发明常模、百分位、界值或能力等级。
- 原版验证样本为美国大学生成人样本；本条目按 18 岁以上成人自评使用，语言验证为英文原文（`language_validation:original_en`），无中文人群验证，不与 ffmq15 中文工作稿互换分数或证据。
