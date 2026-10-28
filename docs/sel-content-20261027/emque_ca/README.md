# EmQue-CA 14 项学生自评：工作材料及验收（2026-10-28）

- `source.md`：论文来源、计分方式、许可核验与中文路径说明。
- `instrument.ts`（`server-version/backend/src/modules/scale/instruments/emque_ca_student_en/1.0.0/`）：可执行 DRAFT——14 题英文原题逐字誊入（CC BY 4.0 论文 Table 4），三维均值计分、报告与 4 组 golden cases 齐备。
- `scoring.py` / `test_scoring.py`：三维均值参考实现与回归测试（端点、归属、缺答、非法值、样例）。
- `report_sample.html`：静态模拟报告（三维分布条、反思、行动、局限），分数口径与原生一致（均值 1–3）。

## 计分

三点作答（1 = not true，2 = somewhat true，3 = true）。情感共情 6 题、认知共情 3 题、意图安慰 5 题，各取均值（1–3）；无反向题，不提供总分。任一维缺题则该维无分（`complete_required`，缺答不补 0）——这是产品保守规则，不声称是作者缺答规则。

## 验收状态

1. **题文与分数：通过。** 14 题逐字誊自论文 Table 4；三维归属、无反向与论文一致；4 组 golden cases 与参考 scoring.py 及运行时精确浮点语义一致。中文译题未交付，中文施测前须翻译验证并立新版本。
2. **报告：静态样稿完成**（含分布图、非学术反馈、反思、行动、局限与模拟声明）；动态接入与浏览器视觉验收未完成。

源码 snapshot 不含可运行项目依赖；原生定义经本地 JSON 结构断言与 JS 精确浮点复算，完整 TypeScript 编译与运行时核验由集成方完成。
