# SEC-SJT DRAFT：范围与最小适配需求

## 本次范围

仅 SEC-SJT 内容/科学/发布源文件、自动生成目录、独立测试和相关资料。正式题 10×5，独立练习 1×5；固定 NEXT 链到 terminal；TEXT_V1、SINGLE_CHOICE。保留原研究初译与评分键，未改共享 Survey、schema、权限或实际数据。不声称发布或真实施测可用。

## 不能静默压平的语义

1. 练习与正式题必须有不同角色。练习保留独立 sceneKey、RAW_ONLY 和原文，不创建 metric/expertKey/contribution。当前草案要求练习选择以继续，是明确标注的平台改编。
2. 正式题 SCORED required:false。允许空白/退出不等于允许部分计分；任何一题缺答总分 null。未匹配的有效选择是 0，缺答不是 0；invalid 不得强制转数字。
3. 评分需以完整正式题集合为 expected coverage，不以已答题数重算分母。FINAL 可接收包含练习的原始响应，但评分投影仅含正式题，练习选择不影响值/覆盖/贡献。
4. Survey 入口目前在 catalog.sources.ts 拒绝 !required 或非 SCORED 的通道，错误为 SOURCE_SJT_FLOW_UNSUPPORTED。因此本阶段只完成可审源包与 standalone 契约。后续需显式承载角色与可缺答状态、保留 NEXT 次序/稳定 ID；不能删除练习、折成普通量表、强制填满或把 null 改 0 来适配。
5. 作答/研究导出需区分 practice RAW_ONLY、formal SCORED、正式题缺失及完整性状态，保留稳定题号、版本和原始选择。面向参与者的呈现/报告不得附 expertKey、逐选项贡献或正确答案反馈。完整原始题文及许可的授权材料导出，与参与者报告是不同用途；不能因为报告隐藏 key 就声称整个授权源包保密。
6. 报告只有 0–10 原键匹配数或不可计算，以及未验证译稿、原人群、缺失规则和 BY-SA 署名。无八维分量表、常模、cutoff、诊断或筛选结论。

## 原文与改编

原始指导语在练习前，原练习后提示在题1前，保留纸本每页2题措辞并清楚标注数字每页1题。没有测验硬时限，可休息。中文工作初译未经过人工双语审核或中文验证。原作 Wolf, Schneider & Schütz (2020), https://doi.org/10.20378/irb-48863 ，材料与改编 CC BY-SA 4.0；平台代码仍用仓库许可。

## 可复用验证

server-version/backend/scripts/public-library/sec-sjt-contract.tsx 可选择 SEC_SJT_CHECK_GROUP=core、independent、report 或默认 all；SSR 构建须 JSX automatic，与前端设置一致。新独立 oracle 来自原题本评分表与工作簿，不由 instrument goldenCases 反推。已有已通过输入不重复执行；本次首轮 core 通过后在 SSR 因 classic JSX 构建失败，仅补执行新的 independent 及 report 组。具体证据、未执行项及输入哈希见 source-implementation-evidence.json。
