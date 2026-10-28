# 26个量表｜同一构建树的源码集成候选（2026-10-28）

**状态：源码拼合候选，非CI合格发布；[skip ci]，没有安装、合并或部署。** 该集成以 PR #375 最新冻结提交 `5eca82fb13bcf0f2bbf3bb5b6deaa47fa1f9b792` 为唯一基线，保留其17个新工具、32个源码版本及main原有57个来源版本。追加9个精确来源版本：1 ARS30、1 BPS9、3 IPIP第一批、3 IPIP第二批、1 DBT-WCCL59简体。去重后26个新工具在同一完整Git tree，生成索引从89个源码版本变为98个。**98是所有含历史的源码版本，不是98个新工具。**

## 各来源固定身份与Git Blob
| 工具 | instrumentVersion | 原始PR | 精确source.json Git blob |
|---|---|---|---|
| ARS-30 | 1.0.0 | #367 | `33c423f39f08ddb0706aa177ccc251554519c49c` |
| BPS-9 | 1.0.0 | #370 | `9d76be4b760597a644f5af21f35e836baaa88a40` |
| IPIP-NEO C1 自我效能 | 1.0.0 | #371 | `ad7f273512fae42aab9a129b319c04af7110d040` |
| IPIP-NEO C5 自律 | 1.0.0 | #371 | `e2c213b684891511ab5f45c25fb5ef1f789dc2bf` |
| IPIP NFC10 思维需求 | 1.0.0 | #371 | `fba466c4ed810047e4fe34d02a2da6343c07234b` |
| IPIP OPT10 乐观 | 1.0.0 | #373 | `d040226fe053633fe57e8ef914974480d2594613` |
| IPIP 同情关怀 | 1.0.0 | #373 | `914725fe3004d0d4bb1c9b773b2c5cfc90a7add2` |
| IPIP 情绪关注 | 1.0.0 | #373 | `dd50cc0544cddc61c4b87627baf574689f0986a4` |
| DBT-WCCL59 简体 | 1.0.2 | #362 | `65fa7348627e396ff8aa04331e05c66a6d084f69` |

## 集成规则
- 只复制现有完整Git blob和必要的来源许可、定向测试及报告展示文件；不重写九包题文、评分或golden，不改变PR375已有25个工具的原冻结字节。
- DBT简体优先采用用户确认审校的PR362，不采用历史b92同key/version冲突来源。其报告为独立`reportVersion=1.0.3`，源内容1.0.2、scoringVersion1.0.0；已保存1.0.2旧报告快照。
- 报告组件和中文标签取PR367当前review后的源码，其中标签仅为元数据、不是新权限门禁。原有实际author/license约束与审阅状态保留。
- 索引使用与正式`scripts/generate-scale-instruments.ts`**逐字节一致的模板**构造；先证明该模板可原样生成PR375原有89来源索引，再加9项并统一ASCII路径排序，不建立第二个运行时registry。新增索引Git blob `de1f0d395c1ef6b712f89c5516642eccc139adcd`。
- 所有源码、测试和报告内容结构的检查只是已有定向证据与本轮静态读取。**本集成新树未运行generator --check、TypeScript、goldens、UI用例、CI、数据库、浏览器或部署**。必须以最终commit/输入范围复核实际变动，并按仓库AGENTS.md与docs/release/README.md执行最小必需正式检查，不能将静态拼合当作可分配认证。

## 版本与Notion
- [26工具详细C/P/R及管理标签台账](README.md)
- [Notion三轴及非门禁原则](https://app.notion.com/p/405d27635a388171b47af3fae9df5aa2)
- [Notion 26工具交叉审核](https://app.notion.com/p/407d27635a388125ad4ad78faf832235)
- 原来源PR证据：[#362](https://github.com/caohuibj/eduK12-new-version/pull/362)、[#367](https://github.com/caohuibj/eduK12-new-version/pull/367)、[#370](https://github.com/caohuibj/eduK12-new-version/pull/370)、[#371](https://github.com/caohuibj/eduK12-new-version/pull/371)、[#373](https://github.com/caohuibj/eduK12-new-version/pull/373)、[#375](https://github.com/caohuibj/eduK12-new-version/pull/375)。

## 下一步只针对真实影响
审核生成索引与9包来源/附件的闭包、DBT新增报告契约和15项中文标签、Scale图表/展开项的真实消费；复用其他25包选中内容checks证据。不为版权联系、常模或未实现的专家批准添加新门禁。随后由管理员按原INSTALL→preview/proof→apply业务协议单独公开发布；生产并非本阶段。
