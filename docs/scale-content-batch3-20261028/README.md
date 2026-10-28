# 量表内容审计与版本化优化：第三批

基线 main `8774b1cf158dae1c5eb0f4950044c6ae6d6a18dd`；固定候选来源 `content/dot-local-scales-20261025@b92c69aefa2472775fa7ee86b9c208366886c908`。三个已有 Terra 6.1 high 子 agent 每次处理一包，完成即接下一包；主 agent 统一核对、修订、版本和提交。用户已明确暂不生产部署，要求固定内容将来不重复审核。

## 实际范围和状态

候选源的78个最新工具（按instrumentKey去重）对应69份本轮新审计、8个先前已审包和1个既有PR362审校来源。本数不是当前安装数，也不是78个已批准工具或85个版本包。[audit-queue.json](audit-queue.json)逐项区分：本批实际修订17包、先前冻结8包、既有PR362复用1包、其他52包保留审计并等待必要普通修订/注册整合。其中人工科研、译审与版权备注不自动变成安装运行门禁，不将所有备注当工程阻碍。

本批17包只新增/修订原有量表内容路径、wrapper及既有静态generated索引。没有改系统注册器、共享治理/接口、认知、UI、CI或数据库。原定义/历史/检查原件按固定源保留；分数说明或指导语拆分会改变定义身份时建立新instrument版本。报告修订有新reportVersion；原报告对应的旧AI编辑时间戳不冒充新文案审查，必要时在新报告移除旧qcReview，不编造新QC。

| instrumentKey | 原instrument → 候选instrument | scoring / report | 题数 |
|---|---|---|---|
| `apq42_parent_global_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 42 |
| `bpses5_zh_cn_research` | 1.0.0 → 1.0.0 | 1.0.0 / 1.0.0 | 5 |
| `brcs4_zh_cn_research` | 1.0.0 → 1.0.0 | 1.0.0 / 1.0.0 | 4 |
| `cfq7_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 7 |
| `dbt_wccl59_zh_tw_official_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 59 |
| `djgls6_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 6 |
| `ebq16_zh_cn_research` | 1.0.1 → 1.0.2 | 1.0.0 / 1.0.4 | 16 |
| `ipip_emotion_based_decision9_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.0 | 9 |
| `ipip_negative_expressivity10_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.0 | 10 |
| `ipip_positive_expressivity9_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 9 |
| `ipip_responsive_distress10_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.0 | 10 |
| `ipip_responsive_joy10_zh_cn_research` | 1.0.0 → 1.0.0 | 1.0.0 / 1.0.1 | 10 |
| `kseg6_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 6 |
| `maia2_37_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.0 | 37 |
| `spane12_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 12 |
| `sswq16_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.1 | 16 |

| `psyflex6_zh_cn_research` | 1.0.0 → 1.0.1 | 1.0.0 / 1.0.0 | 6 |

实际修订包括：现成工作稿指导语独立绑定；两包把首题的指导语原文拆出并保留纯题干；正向情绪表达、CFQ7、KSEG6、SSWQ16、DJGLS6报告对齐其回答锚点及真实分数含义；SPANE两个示例词对应实际题目；EBQ七项说明高分方向；MAIA两个反向维度的说明更准确；DBT官方繁体题本对应的报告/分数说明改为繁体；APQ题8明确惩罚对象、监督不足报告说明方向、绑定家长报告合同，旧年龄字段按既有6–13岁/完成月龄72..167意图转为[72,168)并修订policyVersion。

题文含义、选项、公式、反向、维度归属、阈值和常模均不借工程字段偷偷改变。APQ题8是原英文对象的代词澄清，有显式新版本/差异；其他待人工译意事项保持。scoringVersion保留原算法版本；分数标签/description虽影响当前measurement hash，却不伪称计分公式已改变。SPANE新报告身份复用原1.0.0 plugin登记，原scorer函数文件未改，不重复注册或新造引擎。

源码技术PUBLISHED只是候选包状态。catalog/科研成熟度/译审/权利/科学审批各自保留原值，不能把这16包一律写成专家批准。全部本批数据库安装、PUBLIC发布、目录可见/分配均 **NOT_EXECUTED**，生产 **DEFERRED_BY_USER**。不自动给真实用户或组织授权。

## 固定审核，部署不重审内容

[content-freeze.json](content-freeze.json)绑定本批17包及先前8包，共25包的精确源版本/hash和原证据路径。与这些字节相同的题目、计分、报告，未来部署不重做内容审核；若只改变某个内容，只有对应审查受影响。原声明的手工科研/权利状态继续真实，内容审计不授予未明的公开再分发或商业权利。

这份冻结不是正式CI、合并或生产成功。实际部署仍须使用已批准合并产物、真实SYSTEM_ADMIN和目标状态，通过既有单包安装/发布preview/proofHash/apply业务操作；这不是再次做四入口、显示或幂等回归。当前PR保持Draft；CI、Ready、合并和部署由dot统筹。

## 必要检查、失败和复用

见[validation-index.json](validation-index.json)与[evidence](evidence)。17个实际选中内容合同有互不重复的通过case；原whole invocation失败仍为失败，不能将其中passed case写成整命令成功。每份execution-receipt记录精确命令、退出、原日志hash和前后输入清单，命令副本在[commands](commands)。输入清单是保守backend源/锁/配置范围，不表示全库被测试；完整node_modules历史字节清单未采集。

- 第一组7项通过，外层退出0；当时一次generated check通过。
- 第二组初次在import因SPANE重复descriptor失败，外层1、用例未执行、后续generated check未执行；原stderr完整保留。仅修包wrapper复用原登记。
- 第二组重试实际6通过/3失败，外层1。APQ旧maxInclusive不被schema接受，两包缺报告受众合同。没有伪造QC或用填字数解决。
- 只处理3个失败项后，TW/SPANE结构/运行编译2项通过；它们旧scoring/items/golden/measurement完全未变，通过原失败结果中没有golden错误及实际validator无条件遍历golden的代码证据复用计分，不再回放。APQ一项因为验收脚本错误假设“旧schema-invalid DRAFT可在registry读取”失败；原件保留。
- 最后只修APQ验收脚本，明确旧版字节保留且真实隔离；APQ新候选1项通过并首次实际执行它的golden。最终generated check通过，外层0。其余15项未重跑。

没有运行全库、全量tsc、构建、浏览器/手机/平板截图、四入口、安装/幂等、数据库、CI或生产。必要源码适配是在本云端唯一执行；用户已否定的逐包系统验证没有恢复。

## 审计来源与待收口项

原审计在[audits](audits)、普通补丁在[patches](patches)。[supplements](supplements)保留5DCR通过既有PR328及原GESIS锚点补齐、IERQ通过可正常读取的作者附录补齐、APQ按实际main已去除字数/QC要求的纠正。原不可读/旧门禁结论保留为历史，不覆盖成同期成功。

Psy-Flex6最高锚点“总是如此”与原文very often不同；[具体提案](proposals/psyflex6-anchor.json)已获用户明确批准并应用为新1.0.1“非常经常”，两处localizationVersion同步1.0.1，指导语/计分/报告保持原版本，旧1.0.0保留。新增定向1项及当次变动索引检查通过，外层0；此前16项未重跑。DERS16的五组解释是否能称为独立分量表、PRFQ原资料计分争议等需按现成依据收口；TES12随机呈现与现有Runner不兼容保留，不在本内容任务改系统或悄改成固定题序。课程/会谈范围占位仍需真实绑定，不能说已经采集。这些是具体待办，不把所有译审/科研备注升级成新自动门禁。

[dbt-cn-source-variants.json](dbt-cn-source-variants.json)同时保留b92与PR362同key/version哈希及18处精确差异，题文相同。保持既有PR362为拟整合来源，不静默用b92覆盖，也未重做原审校。[original-byte-comparison.json](original-byte-comparison.json)逐项保存本批复制原件的字节比对。

准备阶段一次多余tsx版本探针使用了错误工作目录而退出1，未执行应用用例；源准备已完成且未重复写入。事实及原始日志缺项见 [preparation-probe-failure.json](evidence/preparation-probe-failure.json)，不将这条外层失败写成成功。
