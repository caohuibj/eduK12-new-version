# CBT/DBT 内容入库与验收记录｜2026-10-28（第一批）

本分支（CBTDBTcontents，基线 main `c412baf`）按 SELcontents 同一管线入库 CBT/DBT 领域第一批 4 个工具家族、4 个精确版本，全部为可执行原生 DRAFT。全部为内容草稿：没有导入生产数据库、发布、建 PR、触发 CI、合并或部署（提交带 `[skip ci]`）。

## 批次清单

| 顺序 | 工具与内容记录 | 评价层次 | 题文与计分验收 | 报告 | 独立提交 |
|---|---|---|---|---|---|
| 1 | [ATQ-30](./atq30/) | CBT 认知机制：近一周消极自动思维频率（成人/大学生原始样本） | 通过；原生DRAFT；30题，总分求和30–150＋四因子求和（仅覆盖16题） | 原生模板＋图文样稿 | `d6d1431` |
| 2 | [KIMS-39](./kims39/) | DBT 技能：正念四技能自评（成人原始样本） | 通过；原生DRAFT；39题，官方四分量表求和，18反向题，无总分 | 原生模板＋图文样稿 | `306d8df` |
| 3 | [BSL-23](./bsl23/) | DBT 临床症状结局：边缘型症状强度（成人临床研究用） | 通过；原生DRAFT；23题0–4，总分0–92＋均值；官方缺2题宽限未采用并标注 | 原生模板＋图文样稿（安全口径） | `c6982f4` |
| 4 | [DTS-15](./dts15/) | DBT 心理机制：痛苦耐受评价自评（大学生原始样本） | 通过（仅总分）：15题统一反向6−作答求均值；四因子题项归属未经原论文核实，未实现 | 原生模板＋图文样稿 | `3bab5bb` |

## 计分与核验

- 4 个可执行版本共 16 组原生 golden cases 全部通过；每家族 `scoring.py` 独立实现与 `build_native.py` 内嵌模型交叉一致，详见 [native-validation.json](./native-validation.json)。
- 缺答不补 0：统一采用 complete_required 产品保守约定，并在各工具记录中声明这不是原作者缺答规则（BSL-23 官方允许缺 2 题算均值，本实现未采用）。
- 未发明常模、百分位、临床界值或能力等级；BSL-23 明确禁止用于普通学生筛查与个体分级（forbiddenUses 含 INDIVIDUAL_REFLECTION）。

## 报告验收

4 份 HTML 样稿均有分数范围条形图、非学术反馈、反思问题、可尝试行动与原创 SVG；数值为明确标注的模拟数据。系统现有 ReportRangeTrack 用真实分数绘图；未引入新的报告渲染框架或外部图片依赖。BSL-23 样稿为安全口径：不逐题解读、不分级，含危机求助提示。浏览器视觉/交互验收未完成，不得把本记录用作 UI 上线证据。

## 查重（与现有库、候选清单及 open PR）

与 SELcontents / ACTcontents / 候选清单（PR #365）及 PR #362 均无精确 key 冲突。相邻构念关系见 [dedup.json](./dedup.json)。要点：

- KIMS-39 与候选清单中 `ffmq15`、`chime_s24` 同属正念但为不同工具家族，不合并。
- DTS 与候选清单中 `ders16_bjureberg`、`ders_sf18` 相邻不同构念，不互相替代。
- BSL-23 与库内 `dass21` 人群与用途不同，不得互推。
- DBT-WCCL59 已由 PR #362（`dbt_wccl59_zh_cn_research@1.0.2`）承载，本分支未重复入库。

## 已在库/在 PR（本分支不重复入库）

- ERQ-CA、ERICA-16：SELcontents 分支已入库。
- ERQ-10 成人版、DERS-16、DERS-SF18、BADS-SF9、FFMQ-15、GAD-7、PHQ-9 等：PR #365 候选清单（源自 `content/dot-local-scales-20261025`）已登记。
- DBT-WCCL59 zh-CN 1.0.2：PR #362 已是发布候选。
- DASS-21：main 已在库。

## 后续批次（待入库）

1. CATS-40（儿童自动思维量表；麦考瑞官方链接已失效，须另寻官方来源并核对许可）。
2. DAS-A/B（Beck Institute 公开题本；许可状态须记录）。
3. RFL-48（生存理由量表，UW BRTC 分发＋官方简体中文版）。
4. PBQ-SF、SAS（Beck Institute；工具较长，逐字转录工作量大）。
5. DTS 四因子分量表（须先取得并核实原论文）。
6. RCADS-47/25（UCLA 明确要求书面许可且禁止公开重发布题项——只做 catalog-only 登记，不复制题文）。
7. BDI-II / BAI（Pearson 授权销售，不入库题文）；SASII、DBT 日记卡（专业访谈/过程记录工具，单独类别评估）。

## 与 SEL 批次相同的约定

每家族独立提交；逐字题文、官方计分键、`complete_required` 缺答不补 0、中文反馈、golden cases；未触发 CI、未建 PR、未合并、未部署。语言、长短版和报告者版本不重复计为独立构念。受限题文（如 RCADS、BDI-II/BAI）不复制到公开仓库。
