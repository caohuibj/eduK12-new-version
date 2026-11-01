# B10 成人作息与睡眠状况：内容交接

`adult_bedtime_sleep_zh_cn@0.1.0` 是新增 DRAFT / EXPERIMENTAL 内容包，面向18岁及以上成人非商业研究。仅复用 BPS9 与 SCI8 共17题；年龄确认及可选轮班、典型就寝时间、希望讨论的事情是独立不计分背景。没有修改任何叶工具、旧 Bundle、权限、引擎、界面、数据库或工作流。

开工读取实际 main `74423a1c4b40f65c084797434aaa86271594e687`，核对本Bundle产品需求与已有来源；再次检索 packages/generated/legacy 与开放 PR 未发现此同组合。本工程记录不表示人工专家或作者批准。

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

已有 Profile v2要求题目均分，适用性仅有学生年级或 `ADULT_TEACHER`。成人SCI合计不使用该合同，也不伪装成教师包或改SCI聚合方式。本次改为依赖共享候选 `packageSchemaVersion=3` / `declarative-evidence-v1@1.2.0`：

- `rules.derivations`：`b`为BPS1–5的DIRECT `RANGE_POSITION`，`s`为SCI0–32的REFLECT `RANGE_POSITION`，均由冻结原分派生，不重读答卷。
- `rules.theme`：轴键为 `b/s`，主题规则仅 `sl1/sl2/sl3/sl4`。结果保存派生数值、状态及 `profileId`；无匹配时按共享合同返回BOUNDARY，不强制归类；margin为null，不输出相似度、概率或Profile v2评分。
- `report.rows`：两条原分及两条坐标，各自声明中文标签、mean/sum/position单位、原范围、题数9/8及不同时间窗。SCI原分仍高分较有利，仅困难体验坐标反射。
- `report.blocks[].rowKeys`：原分证据与两坐标面板分别绑定，复用共享范围轨道展示；主题及“计划—实际—体验”反思卡保持固定文字，不捏造计划时刻、日记或新增雷达/专属界面。
- `report.narrativeContent=BUNDLE_OWNED_SELF`：只声明本Bundle原创实验性文案，沿已有来源数值/解释披露交集和自评受众投影，不增加授权或放开商用。

初稿v1的真实缺答记录保留：SCI原结果可同时具有null及invalid质量。schema3共享映射另读取冻结结果的原始missing-only质量标记；对 `missing_items/score_not_calculable` 这类明确缺项，缺失SCI坐标为null、主题为INSUFFICIENT，完整BPS仍显示。未知/全局invalid仍保留invalid，不借缺项之名洗白。此轮使用先前已真实产生的叶结果、来源结果hash和质量标记验证新映射，没有重跑叶计分器或另写状态机。原始missing、非法、不适用及真实0分别沿共享合同保留。

报告只声明现有作答者 `student` 受众，不增加管理员、研究者或教师读取个人结果的授权。实际来源可见性和冻结结果读取沿现有路径。尾区、SL名称和建议均是项目EXPERIMENTAL提案，非临床切点、常模百分位、病因或经验人群类型；不提供药物、强制睡眠限制或自动治疗处方。

标签语义随 `scientific.scope` 保留：睡眠/恢复主题、两个独立构念、18+成人、自评、非商业研究、非诊断、中文工作译稿及译审/本地验证待完成。Bundle严格schema没有 `classificationTags` 字段，未添加不支持的facet；这些是来源/目录元数据说明，未声称写入新的可检索标签系统。

## 本次schema3定向验证与集成

读取实际main `8ae80a2323fddee756f521f9aff126b09f49f548`，共享核心尚未在该main。本包仅临时使用B候选 `ae20aab4c5cdb347f714e60bfce6740ebbf086b7` 的解析/派生/投影及C候选 `45449e9aa8b1d583868247cfd06b81f81ce7d5c7` 的 `BundleDerivedReport` 组件；没有将核心源码带入本包PR。A保存/封装层与真实报告出口由集成线接续，本轮不声称其闭环已执行。

实际完成：

- 现有 `bundle-onboarding.ts check <本包目录>` 在临时B候选上通过；原四类fixture只追加新expectedDerived断言，未重做题本或旧叶计分验证。
- 4项本包新增映射/报告测试通过（104ms断言、总1.25秒）：复用上轮冻结原分，检查16/9与6派生 `b=(16/9−1)/4`、`s=.8125`、MATCHED/sl3；0/1端点、四尾区含等号及中间BOUNDARY；真实缺项标记使SCI坐标null且主题INSUFFICIENT并保留BPS；保存payload的JSON回读投影一致。
- 共享C组件的静态渲染接受该DTO并显示中文标签、mean/sum/position单位、9/8题数、各自时间窗及两面板；数值披露不足时对应行redacted、主题WITHHELD，未额外开放admin个人结果。
- 本轮内容hash：`e8b71d4c0bae592c2f093cc83af3115fdf3cd1a757aea0e306cd2ccc7d741091`。本轮仍为Node24.19本地探索证据，非正式CI。

本次提交只涉及本包JSON与此说明：不改核心、叶工具、共享索引、依赖、工作流或其他Bundle。实际报告出口、A封装/保存、数据库安装/回读及生产路径尚待集成；静态组件渲染不是浏览器或持久化出口验收。保持Draft，依赖共享核心入主线后才可在正式候选上验证内容轻量检查；未merge/deploy。

## 先前v1验证记录（保留，不重复运行）

改动为本包JSON目录、合成smoke JSON与本交接文档。主要执行位置为本任务隔离checkout；复用未变叶来源，不重翻题本或重跑其历史审查。预算2–3分钟，实际包检查及15项组合检查合计约3秒。

实际通过：

- 现有 `tsx src/scripts/bundle-onboarding.ts check src/modules/assessment-bundle/packages/adult_bedtime_sleep_zh_cn/0.1.0`：schema、四类fixtures、来源selector/type/unit依赖。
- 15项定向组合检查：实际叶 `buildScaleResult` → `projectBundleScaleSource` → `mapDeclarativeEvidence` →冻结snapshot的既有规则；设计16/9与6命中SL3，反向端点、SCI0/32、四个含等号尾区、中间、真实SCI缺答及成人范围、错误来源版本拒绝、报告每条rule引用、非商业及真实C/P/R身份。
- 既有生成器隔离生成及一致性检查：仅新增一条，旧包hash与历史文件不变。没有修改共享 `generated/packages.json`。
- 上述执行时包内容hash：`fc896e8759b882f3cf5f97f2cb24d44a5962e57911f1e2b5a35c40d548aaa85c`。

运行Node `v24.19.0` 低于仓库声明的24.21，故本记录是本地探索证据，非正式CI。没有运行数据库、安装、发布、权限或全产品生命周期、全量类型/构建、性能、灾备、合并或部署。

首次范围检查发现交接文档放在 `docs/bundle-declarative-onboarding/`，该目录不属于现有被动工程记录白名单，因而content=false。只将本新增交接记录移到既有 `docs/development/` 范围后定向复核路由；不修改CI规则，不重跑已通过的包或计分验证。原范围失败不冒称成功。

后续普通提交仅清理私人设计文件的名称、版本及日期引用，保留 `project_design` 引用标识、原创叙事性质、公开学术文献与实际产品版本。清理后包内容hash为 `cb1eb825c9dbf5348a1147876efbac334a9baa1a419c1fd72c58d37972735835`；只读取现有包解析器核对引用并计算身份，未重跑规则、计分或CI，也不把旧内容hash的运行记录改写成新hash已正式验收。旧提交及其历史引用未重写，不声称旧缓存已清除。

**共享索引由集成线统一生成。** 当前Draft不单独覆盖共享注册产物；它尚未作为代码目录条目激活。共享核心与各内容目录汇合后，沿现有生成器执行一次 `npm run bundle:manifest:generate` / `npm run bundle:manifest:check`。当前#494内容CI在Bundle变化时会执行manifest-check，因此核心和索引汇合前不能把本Draft说成CI就绪或已注册。没有手工拼接generated JSON。

正式验证计划为#494现有content路线：`scale-onboarding-boundary.yml` 选定本目录 `check <directory>`、history和注册manifest-check；不启动PG/Redis、迁移、产品回归、性能或恢复。输入相同的实际通过记录不重复执行；本地结果未被正式CI接纳时如实保持待审，不伪造成功状态。当前PR保持Draft，未激活正式CI；集成线在统一索引和最终冻结身份后接续。
