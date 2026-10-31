# 四入口单次群体报告来源与交付边界

这是现有报告升级的覆盖说明，不增加一套报告、计分或授权系统。原基线核对为 main 9f135a2；后续 #423 保存新独立 Scale 的课程 Episode，#424 沿其群报读取。Teacher 新 GROUP 由 #426／#428／#429／#430 分片交付，具体正式检查及合并状态以各 PR 为准，不等同生产部署；School 目录、纵向计划和 `composite.service.ts` 不在本切片内。

| 入口／来源 | 已有真实来源与当前覆盖 | 本轮处理／限制 |
| --- | --- | --- |
| Survey 发布问卷中的 Scale / Cognitive / SJT / Form | 项目授权 → 已发布波次 → 冻结 unit → 已保存正式结果；共用单次统计、Task Artifact、阅读／打印页面 | 已接通的问卷叶来源保持不变。不是任意独立产品历史记录拼接。变体不能混合。 |
| Training 普通组合 / 固定 Bundle 的四类叶 | 冻结父任务、投放课程、slot、正式子结果；Context 必需输入保留，Bundle Profile 不参与群体分析 | #408 / #419 已进入 main。旧父结果缺失历史课程时不回填。#419 的 N=5 已披露原件是 Scale；不将此前单人 Cognitive / SJT 原件称作多人可披露证明。 |
| Training 独立 Cognitive | `CognitiveAssignment.courseId`、发布时的 `courseSnapshot`、冻结 Profile / config / report；正式 `CognitiveSession`；已有课程所有者和任务创建者范围 | **本切片接线**：仅 `listedStandalone=true`、精确历史课程一致的已发布任务。归档任务保留已生成版本读取，不再生成。排除 composite 子 session。 |
| Training 独立 Scale | `Assessment` 没有直接课程字段；但已有 `AssessmentEpisode.courseId`，不能笼统称系统无可复用字段 | #423 已为新启动保存经真实投放／成员验证的 Episode.courseId，本子分支沿其正式结果接群报生成与快照读取。原无归属记录仍不汇总；当前 `CourseScale` / `CourseStudent` 不证明历史归属。 |
| Training 独立 SJT | `startSituationalAttempt` 只有 instrumentKey / instrumentVersion；正式记录有用户／参与者身份，普通启动没有冻结课程投放来源 | 不猜课程，不按当前名册补历史。课程中的 SJT 已通过普通组合／Bundle 叶适配，独立任务尚无同等可靠课程归属。 |
| Training 独立 Form | 当前课程 Form 已在普通问卷／组合 task 内，有父任务和冻结题目 | 不建立不存在的第二种独立 Form 任务模型。 |
| School SELF 的 Scale / Cognitive / SJT 三类数值叶 | Run / Track 的冻结来源、组织／历史人群、具体叶 GROUP 披露合同；父／叶／spec 最低人数取最大值；当前子群为班级／标签 | Form 叶和年级选择尚未接通，不能将规划描述为当前能力。已有受权来源沿原适配读取，无合法 GROUP 合同的私有组合不列为可生成来源。DOT 处理目录分页，本切片不修改目录／routes；旧 V1 继续原兼容边界。 |
| Teacher 成人自填 Form | 原 Form 群体服务、版本 Artifact、历史任教班级／标签人群；内部人口依据不进入公开结果 | #415 / #418 已进入 main，保持现有边界。学生评教、专家共识属于原独立业务，不混入 SELF。 |
| Teacher SELF Scale | 新明确独立审阅发布的原创 `teacher-scale:<uuid>:GROUP` 和库 Scale 新 GROUP 版本；原 C / FINAL 与已批准本人摘要不变 | 原正向原件覆盖原创与库两类各 N10；复用组织 Artifact 与现有统计。旧 INDIVIDUAL_ONLY / ORGANIZATION NONE 仍不得转为群体。部分样本、实际贡献者保护及指针分页见 9dedd85 切片。 |
| Teacher SELF Cognitive / SJT / Bundle 数值叶 | 新明确发布的 `education-assessment:TEACHER:...` 2.0.0 SELF GROUP，冻结父→slot→C，逐叶 groupDisclosure，再用正式 canonical 指标 | 本切片薄接线使用已保存的10人、20个新 Cognitive/SJT 叶 FINAL 正向续验原件；保存读取不物化原始结果。旧1.0.0个人来源仍拒绝。验证父来源是现有普通混合组合，不冒称 Bundle 产品 Profile 分析或所有原生工具验收。 |

## Teacher 普通私有组合收口

Form完整历史已由#438合并，#443提供纵向内部部分指标选项及目录首读GET重试。新普通组合切片只在明确新SELF GROUP版本中支持作者自有原创Scale、已独立批准GROUP的库Scale、经原授权/许可的Cognitive/SJT叶，逐块冻结组织聚合上限、真实C/slot/单位，并保留原本人反馈。真实PG原件覆盖10个原创Scale父结果，N10/mean1/SD0，保存读取canonical0；原生Cognitive/SJT新增为固定源/单位/选择的薄适配边界，不冒称重新完成全部协议实测。

普通组合LIBRARY_SCALE在既有逐块JSON保存独立批准GROUP的resourceKey/resourceVersion/entryHash，发布/历史分别复用原库reader的NEW_USE/HISTORY，不另建表或审批流程。material.use或本人摘要不授予GROUP；没有对应批准的STANDARD_SCALE仍不提供群体选择。已有独立Teacher库Scale GROUP消费不受影响。普通组合Form仍是完成回执，不新增评分；用户已明确将Teacher原生NUMBER/SLIDER Form纵向排除本轮。具体原件和单点检查理由见 `docs/evidence/teacher-private-composition-group-20261031/`。

## 当前独立认知接线

- 在现有 Training 单次群体任务清单添加命名空间 `cognitive-assignment:<id>`，不伪造 CompositeAssessment / parent，不新增表或 schema。
- 工具选择只读冻结 assignment。生成批量读取本任务正式完成的直接 session，按已有 latest-completed 选择器先选最新正式完成，再解密所选结果。未完成重做不替代旧完成；最新缺失不回退旧值。6000 份现有来源上限保持。
- 指标来自发布冻结定义，值只使用已保存专业报告 headline / user / detail 中可见的正式数值，并与对应已保存 metrics / unit 一致。保留零、每指标有效 N、质量状态；隐藏／research_only／productIndex 不转为群体指标。不读取／重算试次，不跨 protocol / Profile / C / unit 混合。
- 复用 `summarizeGroupMetrics`、Training 既有 N=5 / 小补集披露、`reporting_task_artifacts`、原课程 UI / 打印路径。assignedN 不可知保持 null；有稳定 userId 才称人数，否则为答卷单位。
- Artifact 只额外保存既有冻结 assignment 合同哈希和选中 session 的不可逆指针哈希。旧版读取先验证真实课程／任务创建者，再读 Artifact，只查询其已纳入 session 元数据及密文摘要；不查询最新完成名单或解密全体结果。新增答卷不会改写旧版。
- 文件范围：`training-analysis/group-source.ts`（叶数值适配）、`source.ts`（任务授权与来源／指针）、`group-report.service.ts`（现有生成／读取分支）。后者只补该来源接线，不碰 Long 的计划／波次或 Composite START；纵向消费者可复用正式数值适配，但本切片不声称已接通群体纵向。

## 需先确认的最小后续方案

**Teacher 非 Form GROUP 合同**：原方案已获明确实施批准。共享合同／publisher／本人 reader 是 #426 后续的既有切片，Teacher 原创／库 Scale 消费与原生 Cognitive／SJT 是独立交付切片。沿用 COHORT_AGGREGATE 和各受众 resultDisclosure，不新增角色、权限体系或计分；旧 INDIVIDUAL_ONLY / NONE、observer 与通用 raw COHORT_ONLY 限制保留。具体当前原件见 `docs/evidence/teacher-numeric-group-consumer-20261031/`、`teacher-group-partial-population-20261031/` 和 `teacher-native-group-leaves-20261031/`。原方案文档保留历史身份，不把源码／合并结果说成已部署或把旧来源自动升级。

**新的课程独立 Scale 投放**：#423 已在真实课程投放／成员验证后的新 start 中复用 `AssessmentEpisode.courseId`，恢复／重启／FINAL 保留该归属。本子分支只消费该标记的新 SELF 来源与正式冻结分数，接现有统计／Task Artifact；不改 #423 启动候选，不迁移或猜填旧 episode。

**独立 SJT**：普通启动没有同等课程字段；如产品确需独立课程任务，先确认复用现有课程父任务投放是否足够。优先使用已经接通的普通组合／Bundle，不自行为旧历史新增来源表或批量迁移。

## 必要验证范围

新增两个纯适配用例覆盖最新完成／缺失／零／可见值和协议／Profile／单位隔离；一条真实五人独立认知发布→正式提交→生成→读取合同，另只对归档后的旧版可达性补状态变化断言。后端类型检查一次。既有 Survey / Training / School / Teacher 业务、PG、前端／浏览器输入未改，不重复旧 81 / 175 / 41 项或整套浏览器。不是生产压测或部署证明。
