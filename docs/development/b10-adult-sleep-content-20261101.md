# B10 成人作息与睡眠状况：内容交接

`adult_bedtime_sleep_zh_cn@0.1.0` 是新增 DRAFT / EXPERIMENTAL 内容包，面向18岁及以上成人非商业研究。仅复用 BPS9 与 SCI8 共17题；年龄确认及可选轮班、典型就寝时间、希望讨论的事情是独立不计分背景。没有修改任何叶工具、旧 Bundle、权限、引擎、界面、数据库或工作流。

开工读取实际 main `74423a1c4b40f65c084797434aaa86271594e687`，查阅完整 B10 设计 v1.0 和共享画像实施规范；再次检索 packages/generated/legacy 与开放 PR 未发现此同组合。本文日期不表示人工专家或作者批准。

## 真实叶身份与适用边界

| 叶来源 | CONTENT轴 | PARAMETERS轴 | basic REPORT | 读取指标 | 原量尺/时间窗 |
|---|---|---|---|---|---|
| `bps9_zh_cn_research@1.0.0` | `1.0.0:1.0.0` | `none-v1` | `1.0.0` | `bedtime_procrastination` | 9题均分1–5；一般平时习惯，无固定7/30天窗口 |
| `sci8_zh_cn_research@1.0.0` | `1.0.0:1.0.0` | `none-v1` | `1.1.0` | `sleep_condition` | 8题专属映射合计0–32；过去一个月，第8题另问持续时间 |

上述字符串来自当前 `sourceParts`，不是将 `referencePolicy.type=none` 当作参数版本。两项使用各自 source 的 basic 报告，未选 report-variants 中的趣味版或旧报告。原计分版本均为 `1.0.0`，本地化版本均为 `1.0.0`，语言 `zh-CN`，报告者 `SELF`。

BPS 原2/3/7/9反向 `6−raw`，均分越大表示上床拖延倾向越多；SCI每题独立响应映射，合计越大表示睡眠状况较有利。缺失沿叶工具规则，不补0或改均分。Bundle不重复实现叶 scorer，也不把SCI统一成同意度Likert。

SCI来源的 `allowedCommercialNatures` 仅 `NON_COMMERCIAL`；本包 `nonCommercialOnly=true`，保留既有 rights/language/scientific/report要求。SCI量表版权归Sleepio Limited，来源标注CC BY-NC 4.0；独立中文工作翻译和数字呈现并非作者认可，译审/本地效度待完成。未知许可不改写成授权，代码来源PUBLISHED不表示生产已装。完整引文、许可链接及项目叙事的独立出处列在 `scientific.json`。

## 实际执行规则与表达边界

`b=(BPSmean−1)/4`，`s=1−SCI_total/32`。原分仍原向展示，禁止平均两轴生成睡眠健康指数。四种项目叙事在现有 v1 条件引擎中等价执行：

| 规则 | 原分条件 | 设计轴条件 |
|---|---|---|
| SL1 | BPS≥4、SCI≥24 | b≥.75、s≤.25 |
| SL2 | BPS≥4、SCI≤8 | b≥.75、s≥.75 |
| SL3 | BPS≤2、SCI≤8 | b≤.25、s≥.75 |
| SL4 | BPS≤2、SCI≥24 | b≤.25、s≤.25 |

任一原分在中间区间时返回 `middle_or_mixed`，不选SL类型。原分有界检查防止越界事实命中模式。缺项停止联合叙事，保留允许展示的完整独立结果。年龄确认不成立或未知时沿既有 applicability 返回 UNAVAILABLE。

已有 Profile v2 `dependencies.ts` 要求每个绑定都是题目均分，`profile/contract.ts` 的适用性仅有学生年级或 `ADULT_TEACHER`。成人SCI合计不满足该合同。本包据共享规范的回退要求采用已有 schema1 / `declarative-evidence-v1@1.0.0` 固定规则与报告，未伪装成教师包，也未改SCI聚合方式。**当前输出是原分证据＋SL/中间文本，不是物化的b/s数字、Profile v2匹配状态、相似度或新双轴图。** 现有证据块保留两条原量尺，固定卡提供“计划—实际—体验”的可选反思，不捏造计划时刻或日记。

已有v1谓词在质量为 `invalid` 时优先返回invalid状态。真实SCI缺答经叶工具会形成 `value.state=missing`、`value=null`、`quality=invalid`；本包保留这些不同事实，不改写来源。此路径命中通用 `invalid_core` 不完整/无效说明，并保留BPS独立摘要；不会生成SL或声称睡眠良好。包内missing fixture同时覆盖纯missing输入，invalid与not-applicable独立覆盖。没有为此新写状态机。

报告只声明现有作答者 `student` 受众，不增加管理员、研究者或教师读取个人结果的授权。实际来源可见性和冻结结果读取沿现有路径。尾区、SL名称和建议均是项目EXPERIMENTAL提案，非临床切点、常模百分位、病因或经验人群类型；不提供药物、强制睡眠限制或自动治疗处方。

标签语义随 `scientific.scope` 保留：睡眠/恢复主题、两个独立构念、18+成人、自评、非商业研究、非诊断、中文工作译稿及译审/本地验证待完成。Bundle严格schema没有 `classificationTags` 字段，未添加不支持的facet；这些是来源/目录元数据说明，未声称写入新的可检索标签系统。

## 最小验证与集成

改动为本包JSON目录、合成smoke JSON与本交接文档。主要执行位置为本任务隔离checkout；复用未变叶来源，不重翻题本或重跑其历史审查。预算2–3分钟，实际包检查及15项组合检查合计约3秒。

实际通过：

- 现有 `tsx src/scripts/bundle-onboarding.ts check src/modules/assessment-bundle/packages/adult_bedtime_sleep_zh_cn/0.1.0`：schema、四类fixtures、来源selector/type/unit依赖。
- 15项定向组合检查：实际叶 `buildScaleResult` → `projectBundleScaleSource` → `mapDeclarativeEvidence` →冻结snapshot的既有规则；设计16/9与6命中SL3，反向端点、SCI0/32、四个含等号尾区、中间、真实SCI缺答及成人范围、错误来源版本拒绝、报告每条rule引用、非商业及真实C/P/R身份。
- 既有生成器隔离生成及一致性检查：仅新增一条，旧包hash与历史文件不变。没有修改共享 `generated/packages.json`。
- 包内容hash：`fc896e8759b882f3cf5f97f2cb24d44a5962e57911f1e2b5a35c40d548aaa85c`。

运行Node `v24.19.0` 低于仓库声明的24.21，故本记录是本地探索证据，非正式CI。没有运行数据库、安装、发布、权限或全产品生命周期、全量类型/构建、性能、灾备、合并或部署。

首次范围检查发现交接文档放在 `docs/bundle-declarative-onboarding/`，该目录不属于现有被动工程记录白名单，因而content=false。只将本新增交接记录移到既有 `docs/development/` 范围后定向复核路由；不修改CI规则，不重跑已通过的包或计分验证。原范围失败不冒称成功。

**共享索引由集成线统一生成。** 当前Draft不单独覆盖共享注册产物；它尚未作为代码目录条目激活。合并各内容目录时沿现有生成器执行一次 `npm run bundle:manifest:generate` / `npm run bundle:manifest:check`。当前#494内容CI在Bundle变化时会执行manifest-check，因此索引汇合前不能把本Draft说成CI就绪或已注册。没有手工拼接generated JSON。

正式验证计划为#494现有content路线：`scale-onboarding-boundary.yml` 选定本目录 `check <directory>`、history和注册manifest-check；不启动PG/Redis、迁移、产品回归、性能或恢复。输入相同的实际通过记录不重复执行；本地结果未被正式CI接纳时如实保持待审，不伪造成功状态。当前PR保持Draft，未激活正式CI；集成线在统一索引和最终冻结身份后接续。
