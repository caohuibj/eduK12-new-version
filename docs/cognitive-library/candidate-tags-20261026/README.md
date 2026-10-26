# 13项认知协议候选：独立多维标签目录

> **仅研究元数据，不是后台标签上线或可导入配置。** 本目录为每张已有协议卡加研究检索维度，不修改原卡，不恢复编码，不把任务目标标成已验证能力。

## 先看结论

- 覆盖原快照的 **13张卡，13个原ID**；18个维度，131个稳定词条。
- 研究次序仍是 **5项优先定稿＋1项有条件优先＋7项储备**。来源A类/优先顺序不等于科学等级、临床有效性或上线资格。
- 与固定历史主干比较：**2项协议变体候选＋11项新增家族候选**。不是新增13个已可用测验，也不能与24个基线家族直接相加。
- 13项均为 `SOURCE_RESEARCH_ONLY`：未在本项目运行、移植、入库或做科学验证。年龄、人群、中文验证均明确待核；没有“儿童适用”“临床有效”“常模”等正向标签。

## 中文标签索引

下表是目录摘要；具体版本、代码/素材许可、拟用输入与计分限制以每项 `catalog.json` 记录及原卡为准。**上游输入列不是本项目设备支持清单。**

| 原卡 / 具体候选 | 领域 → 目标过程 | 上游输入 | 关键指标主题 | 研究次序 |
|---|---|---|---|---|
| [注意网络任务：PEBL PANT 1.2](../task-selection-20261026/attention-task-cards.md#attention-ant-pebl)<br>`attention-ant-pebl` | 注意、执行控制 → 警觉线索效应、空间定向、干扰冲突处理 | 布局自动选择键盘或鼠标 | 分条件正确率、分条件反应时间、线索与冲突反应时差 | 优先协议定稿 |
| [多目标追踪：Flower 固定5目标速度变式](../task-selection-20261026/attention-task-cards.md#attention-mot-flower)<br>`attention-mot-flower` | 注意 → 动态目标追踪 | 指针依次多选 | 正确追踪目标数及比例 | 优先协议定稿 |
| [短时点数判断：Flower 5–9圆点变式](../task-selection-20261026/attention-task-cards.md#attention-enumeration-flower)<br>`attention-enumeration-flower` | 注意 → 短时数量报告 | 整数滑杆与确认 | 数量正确率与误差 | 优先协议定稿 |
| [渐变持续作业：TestMyBrain GradCPT Apr24](../task-selection-20261026/attention-task-cards.md#attention-gradcpt-tmb)<br>`attention-gradcpt-tmb` | 注意、执行控制 → 持续目标监控、不反应控制 | 空格键、源码观察到触控路径 | 分条件正确率、遗漏与误按、分条件反应时间、反应时间变异、信号检测指标 | 研究储备 |
| [注意闪瞬：Holcombe 双目标字母辨认变式](../task-selection-20261026/attention-task-cards.md#attention-blink-holcombe)<br>`attention-blink-holcombe` | 注意 → 时间选择 | 字母键盘 | 分间隔目标报告正确率 | 研究储备 |
| [视觉搜索：PEBL 双阶段搜索—定位变式](../task-selection-20261026/attention-task-cards.md#attention-visual-search-pebl)<br>`attention-visual-search-pebl` | 注意 → 视觉搜索与位置辨认 | 鼠标双阶段点击 | 搜索与定位时长、分条件正确率 | 研究储备 |
| [双任务干扰：PEBL 双箭头双反应变式](../task-selection-20261026/attention-task-cards.md#attention-dual-task-pebl)<br>`attention-dual-task-pebl` | 注意、执行控制 → 同时双维度反应协调 | 四键双维度反应 | 单双条件分维度反应 | 研究储备 |
| [连续图像再认：随机延迟重复示例版](../task-selection-20261026/memory-decision-task-cards.md#continuous-recognition)<br>`continuous-recognition` | 再认记忆 → 重复图像再认 | R键重复检测 | 重复命中与首次误认率、命中减误认差值 | 优先协议定稿 |
| [精度工作记忆：颜色提示空间位置延迟估计](../task-selection-20261026/memory-decision-task-cards.md#precision-working-memory)<br>`precision-working-memory` | 视觉空间工作记忆 → 空间位置保持与再现 | 鼠标圆环定位 | 圆周角误差、指定混合模型参数 | 优先协议定稿 |
| [Horizon探索决策：四次强制采样后短/长前景](../task-selection-20261026/memory-decision-task-cards.md#horizon-exploration)<br>`horizon-exploration` | 决策与学习 → 信息探索 | 左右方向键 | 少采样侧首个自由选择比例、任务实际奖励 | 研究储备 |
| [两阶段强化学习：Experiment Factory 2秒成人变式](../task-selection-20261026/memory-decision-task-cards.md#two-stage-learning)<br>`two-stage-learning` | 决策与学习 → 奖赏与转移学习 | 左右方向键 | 奖赏×转移条件保持比例、任务实际奖励 | 研究储备 |
| [气球努力选择：50/100/200按压与比例奖赏版](../task-selection-20261026/memory-decision-task-cards.md#balloon-effort)<br>`balloon-effort` | 决策与学习 → 努力收益选择、按压执行 | Q/P选择与重复按压 | 高努力选择率、执行按压数速率与超时、任务实际奖励 | 有条件优先协议定稿 |
| [语义判断后的信心：GDP/食物双条件阶梯版](../task-selection-20261026/memory-decision-task-cards.md#metacognitive-confidence)<br>`metacognitive-confidence` | 元认知 → 判断后的信心监控 | 左右方向键、方向键七档信心加空格确认 | 分条件正确率、信号检测指标、信心及正确错误分层、元认知模型指标 | 研究储备 |

## 维度与使用方式

`taxonomy.json` 的 `dimensions.<英文key>.label_zh` 是维度中文名，`values[].key` 是稳定英文值，`label_zh` 是中文显示名。`catalog.json.records[].tags` 只使用这些受控值；中文名可改进，key不要随文案漂移。

| 维度key | 中文名 / 必须保留的含义 |
|---|---|
| `cognitive_domain` / `target_process` | 认知领域与拟研究过程；目标不等于已证明测得的稳定能力。 |
| `paradigm` / `stimulus_form` | 具体任务变式与上游刺激形式；同一范式名、框架或不同版本不可直接合并。 |
| `input_upstream` / `input_proposed` | 静态观察的上游输入与尚未冻结的本项目输入分开。PANT只提出键盘方案待冻结，其余不猜采用方案；所有移动端支持为未核。 |
| `key_metric` | 指标主题，不保证上游已实现全部评分。原始/文献/拟议/模型口径和分母限制见 `metrics_and_rules`。 |
| `intended_use` | 研究候选的选源与协议定稿；不是临床筛查或诊断用途。 |
| `code_license` / `code_rights_disposition` | 代码许可记录与本项目取用去向分开；完整许可证据及条件仍在 `rights`。 |
| `asset_license_review` / `asset_rights_disposition` | 图片、字体、音频、品牌及事实表的独立限制，不由代码许可推定。 |
| `implementation_strategy` | 代码适配 / 文献自研 / 暂缓，只是拟用路线，不是恢复编码授权。 |
| `maturity` / `evidence_limitations` | 仅静态研究与每项实质限制；不包装为已通过技术、科学或人群验证。 |
| `baseline_relation` | 对固定历史主干的研究去重结论；最近家族与基线SHA见 `deduplication`。 |
| `research_priority` | 研究顺序而非证据等级。气球努力从原README保留“有条件”限定。 |
| `rule_type` | **规则登记覆盖维度**：技术质量规则 / 理论参照 / 文献经验 / 项目暂定研究者规则。标签仅定位原卡栏目，不表示四类均已有适用阈值、充分依据或通过验证。 |

示例：查找 `target_process=dynamic_tracking` 会定位多目标追踪研究卡；查找 `code_license=mit_recorded` 只能筛出原卡记录MIT的代码来源，**不能**推出同条目的图片/字体可用，也不能推出该任务已在平台支持。

### 非商业限制标签的准确位置

| 研究候选 | 限制落在哪一轴 | 可中文检索的标签 |
|---|---|---|
| Horizon探索决策 | 上游代码 `code_license=cc_by_nc_sa_4_0_root` | 根CC BY-NC-SA 4.0：**非商业、署名、相同方式共享限制**。项目用途未清权。 |
| 连续图像再认 | OMI示例素材 `asset_license_review=omi_nc_sa_project_unconfirmed` | OMI素材：**非商业、署名与相同方式共享限制**。项目适用性未确认；插件代码仍单列MIT。 |

这些是特定上游代码或素材的限制，不自动把整个认知范式、未来原创自研代码或替换刺激版判为“非商业任务”。“可中文检索”仅指此文档/词表内容可检索，不表示后台搜索已接入。

### 计分、版本与权利不能压成单一“可用”标签

- 原卡与固定上游SHA保留在 `reference`；PANT任务1.2与schema1.1、Flower固定5目标、gradCPT Apr24、AB双字母、视觉搜索36试次及双箭头默认模式均不改成笼统“原版”。记忆/决策卡同样保留示例/论文、72/54/36次、200/201次等差异。
- `metrics_and_rules` 保留原卡完整计分摘要、分母/缺失/负值/拟合限制及四类规则指针。数量报告误差、个人连续再认统计、T2条件分母或模型参数不能仅凭标签称上游已实现并验证。
- 许可标签不是重新裁定SPDX。原卡未确认 `-only` / `-or-later` 时不补后缀；PEBL视觉搜索保留根GPL与文件头权限边界，Horizon保留根CC BY-NC-SA 4.0及项目用途未清权，OMI素材NC-SA不被插件MIT覆盖，gradCPT图片默认CC BY-SA及任务例外仍待核。
- “待联系授权或核清适用性”不表示已经发现禁止条款，也不表示已发出联系。`project_clearance_granted=false` 表示本目录未授予本项目清权结论；有条件公开仍须履行原许可。自制素材只是路线，不能称已制作或已验证等效。
- 所有 `applicability.age_range`、`target_population`、`chinese_validation` 为 `null`（待核），不等于不限年龄/人群、无语言负担或不需要验证。“2秒成人变式”仅保留原卡标题，不赋予本项目成人适用性。

## 与后台/356的边界

本目录只做内容准备。**没有向后台写入标签，没有启用tag搜索、筛选、任务注册或公开库。** 不把多维标签强塞入已有单一 `category`，不把指标的 `construct/role` 当成通用任务标签协议。未来若接入，应由平台/PR #356负责人对其实际固定head的字段映射、持久化与筛选消费者契约核对；此处不判断#356当前已支持、缺什么或已经上线。

暂停中的visualsearch实现及生成注册文件未触碰。其协议卡被纳入研究目录，并不代表恢复该草稿、完成评分修复或新增执行身份。

## 文件、来源绑定与可复核性

| 文件 | 用途 |
|---|---|
| [taxonomy.json](taxonomy.json) | 18维度与131个英文key/中文名，以及各轴解释边界。 |
| [catalog.json](catalog.json) | 13条完整记录；原卡ID、JSON指针、MD锚点、固定源码SHA、许可与规则说明。 |
| [catalog.csv](catalog.csv) | 与JSON逐记录等价的UTF-8表格交换版本。 |

研究快照固定提交：`71d8f6598afb02a1b540642635fcb4bdab4a12b2`。主干去重仅对历史基线 `ff8471e529e7b3c56e1e20f17d1e2581040fc896`，不是当前线上状态。每条 `fixed_source_commit` 是对应上游仓库SHA，与本仓研究快照提交不同，不得互换。

来源为[原README](../task-selection-20261026/README.md)、[7张注意/执行卡](../task-selection-20261026/attention-task-cards.json)、[6张记忆/决策卡](../task-selection-20261026/memory-decision-task-cards.json)及对应MD、[基线家族](../task-selection-20261026/baseline-family-map.json)、[准入说明](../task-selection-20261026/baseline-admission-map.md)、[研究模板](../task-selection-20261026/candidate-qc-template.json)。这些输入文件的SHA-256绑定在 `catalog.json.source_snapshot_files_sha256`；原快照不改写。本轮没有扩大上游源码研究，也不把来源评审里的附加仓、交叉变式或补查抽样增计为第14张卡。

### CSV约定

- 使用标准CSV，所有字段双引号引用并正确转义，UTF-8编码，单表13条数据行。
- `candidate_id`、`name_zh`、`target_process_note`、`status` 为标量列。
- `tag.<维度key>` 使用 `|` 分隔稳定值；值本身不含管道符，显示名从词表查。
- `json.<字段名>` 是合法JSON对象字符串，覆盖原记录其他所有对象。按列还原这些对象和标签数组，可以精确重建 `catalog.json.records[]`；CSV不省略许可限制或版本说明。
- CSV承载的是研究目录，不是平台导入合同。顶层来源清单、词表与目录范围声明仍以JSON/README为准。

## 本轮实际检查

仅文档一致性检查：13唯一ID且完整覆盖原卡；13/13原卡JSON指针、MD锚点与固定源码SHA对应；所有维度及值有定义、无重复值；历史基线家族引用存在；CSV与JSON的13条记录逐字段往返一致。检查覆盖的原有受版本控制及非忽略未跟踪文件共7,687项，内容哈希保持不变，包括已有未提交草稿；本轮只新增本目录4个文件。

这些检查不是应用测试、时序验收、科学有效性、适用人群验证、CI或部署。不存在已通过的后台tag搜索结果。
