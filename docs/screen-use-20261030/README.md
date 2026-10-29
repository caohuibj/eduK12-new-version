# 手机与电脑使用（问题性使用方向）内容入库与验收记录｜2026-10-30

本分支（`screen-use-20261030`）基于 main `9801107019d51a4af7ddb651789b674867539d24`，延续 `SELcontents` 与 `exam-anxiety-20261030` 分支确立的入库标准：逐字题文、官方计分键、`complete_required` 缺答不补 0、zh 反馈、golden cases、逐家族独立提交、`[skip ci]`；未触发 CI、未建 PR、未合并、未部署。

## 领域现状

库内（main、SELcontents 分支、各开放 PR）此前**没有任何**手机/电脑/网络使用类工具；本批为该领域第一批。候选按引用量与近年度优先检索排序，同时以**许可与题文可获取性**为硬门槛——这是本轮唯一决定 DRAFT 与 catalog-only 分配的因素。

## 本轮结果：8 个工具家族，2 个可执行 DRAFT + 6 个 catalog-only 登记

| # | 工具 | 状态 | 引用规模 | 阻塞点 |
|---|---|---|---|---|
| 1 | [SAS-SV](./sas_sv/source.md)（`sas_sv_10_adol_en@1.0.0`） | **可执行 DRAFT**（en，zh 反馈） | 约 3,571 | 中文译题未交付 |
| 2 | [IGDS9-SF](./igds9_sf/source.md)（`igds9_sf_en@1.0.0`） | **可执行 DRAFT**（en，zh 反馈） | 约 1,600 | 作者条款未归档；发表版交叉核对 |
| 3 | [IAT-20](./iat/source-and-blockers.md) | catalog-only | 数千次级 | 题文源自 Wiley 专著/作者分发件，本环境不可达 |
| 4 | [MPATS-16](./mpats/source-and-blockers.md)（中文原创） | catalog-only | 国内最广使用 | CNKI 付费墙 + 期刊/作者授权 |
| 5 | [CIAS-26](./cias/source-and-blockers.md)（中文原创·繁体） | catalog-only | 中文学术圈最久使用 | 期刊付费墙 + 授权；简体须另立版本 |
| 6 | [BSMAS-6](./bsmas/source-and-blockers.md) | catalog-only | 千次级 | APA 付费墙 + Bergen 申请式分发条款 |
| 7 | [NMP-Q-20](./nmpq/source-and-blockers.md) | catalog-only | 千次级 | Elsevier 付费墙 + 作者条款 |
| 8 | [SMD9](./smd9/source-and-blockers.md)（青少年专用） | catalog-only | 约 1,730 | Utrecht 作者自存档本环境不可达 |

不得把 catalog 登记当作工具入库完成。

## 两个可执行 DRAFT

### SAS-SV（Kwon et al., 2013，PLoS ONE，CC BY）

- 题文逐字取自**作者随文分发的 Appendix S1（XLSX）**，PLoS 页面 CC BY 许可声明原文已核对引用；`license.status: verified`、`redistribution: allowed`。
- 10 题、官方 6 点同意度（含 Weakly disagree/agree 两档，原样保留）、官方计分为 10 题总和（10–60）。
- 关键数字（XML 原文核对）：N=540 韩国初中生（均值 14.46 岁）、**α=.911**、ROC 切分点男 31/女 33（AUC .963/.947）。切分点仅记录于文档与 limitations，报告不据此给个人等级。
- 中文验证路径：Cheung et al. (2019) 香港青少年 / Luk et al. (2018) 香港成人。
- [工具记录](./sas_sv/source.md)；[计分参考 `scoring.py`](./sas_sv/scoring.py)（4 组 golden cases 通过）；[图文样稿](./sas_sv/report_sample.html)。

### IGDS9-SF（Pontes & Griffiths, 2015，CHB）

- 题文与官方指导语逐字取自 **Birkbeck 机构库作者自存档接受稿**（eprints 43473，本环境可获取）；绿色 OA 但正式条款未归档 → 按 ERQ-CA 先例登记 `license: unknown`，DRAFT 交付。
- 9 题、官方 5 点频率计分（1=Never … 5=Very Often）、总分 9–45；官方指导语含 12 个月时间窗与全平台定义（电脑/主机/手机/平板，在线或离线）。
- 关键数字：N=1,060（EFA 532 + CFA 528）、**α=.87–.88**、效度 IGD-20 r=.816；青少年证据 Schivinski et al. (2018，开放获取 CC BY)。
- [工具记录](./igds9_sf/source.md)；[计分参考 `scoring.py`](./igds9_sf/scoring.py)（4 组 golden cases 通过）；[图文样稿](./igds9_sf/report_sample.html)。

## 报告验收

两份样稿均含总分图、非学术反馈、反思问题、可尝试行动与免责声明；数值为明确标注的模拟数据；未引入新的报告渲染框架或外部图片依赖。六个登记项无样稿（登记阶段）。

与既有记录一致：本轮完成静态内容、分数和结构核验，未通过实际浏览器视觉/交互验收；不得把本记录用作 UI 上线证据。

## 查重

`dedup.json` 登记本轮全部相邻关系：SAS-SV↔MPATS（同为问题性手机使用：引进 vs 本土）、IGDS9-SF↔SMD9（同源 IGD 九标准、对象不同）、IAT↔CIAS（整体性网络使用：引进 vs 本土）、NMP-Q↔dass21/`gad7`（情境特异 vs 泛化焦虑）、BSMAS↔其他（平台 vs 设备/活动）、整个领域↔`bescs`/`bscs_zh_cn`（自控为邻近调节变量）、`who5`/`sdq`（福祉与行为困难一般工具不重复登记）。与 `exam-anxiety-20261030` 分支（westside/aeq/tai/ctas）和 SELcontents 分支的精确 key 均无冲突。

## 下一轮计划

1. **MPATS 优先升级**（中文原版、国内场景最实用）：经 CNKI 取原文 + 作者/期刊授权 → 直接立 zh-CN DRAFT。
2. SMD9 升级：从可达网络取 Utrecht 自存档 → 9 题是/否格式适配评估。
3. IAT 升级：存档 netaddiction.com 分发件与许可声明。
4. BSMAS/NMP-Q/CIAS：按各自授权路径逐项推进。
5. 中文译题与本地常模：所有引进工具的中文施测路径独立立项。
6. 第二批候选：社交媒体素养/数字福祉类（如数字压力、问题性社交媒体使用长版）、屏幕时间习惯问卷——待本批集成后再行检索。
