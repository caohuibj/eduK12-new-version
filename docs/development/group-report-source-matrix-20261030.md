# 四入口单次群体报告来源核对（main 9f135a2）

这是现有报告升级的覆盖说明，不增加一套报告、计分或授权系统。基线核对为 main 9f135a2；后续 #423 已保存新独立 Scale 的课程 Episode，本子分支接其群报读取。Teacher 合同仍为只读方案，不修改 School 目录、纵向计划或 `composite.service.ts`。

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
| Teacher SELF Scale | `teacher-scale:<uuid>:INDIVIDUAL` 的独立审阅发布合同；`analysisMode=INDIVIDUAL_ONLY`，ORGANIZATION audience `NONE` | **属于合同限制，不是遗漏一个 UI 入口**。当前不得将其个人结果转给组织群体报告。 |
| Teacher SELF Cognitive / SJT / Bundle 叶 | `assertTeacherPersonalAssessmentPolicy` 明确 SELF / SELF_REPORT / INDIVIDUAL_ONLY，minimumRespondents=null，并受内容上限收窄 | 同属真实可见范围限制；个人纵向能力不等于群体披露许可。本轮未改。 |

## 当前独立认知接线

- 在现有 Training 单次群体任务清单添加命名空间 `cognitive-assignment:<id>`，不伪造 CompositeAssessment / parent，不新增表或 schema。
- 工具选择只读冻结 assignment。生成批量读取本任务正式完成的直接 session，按已有 latest-completed 选择器先选最新正式完成，再解密所选结果。未完成重做不替代旧完成；最新缺失不回退旧值。6000 份现有来源上限保持。
- 指标来自发布冻结定义，值只使用已保存专业报告 headline / user / detail 中可见的正式数值，并与对应已保存 metrics / unit 一致。保留零、每指标有效 N、质量状态；隐藏／research_only／productIndex 不转为群体指标。不读取／重算试次，不跨 protocol / Profile / C / unit 混合。
- 复用 `summarizeGroupMetrics`、Training 既有 N=5 / 小补集披露、`reporting_task_artifacts`、原课程 UI / 打印路径。assignedN 不可知保持 null；有稳定 userId 才称人数，否则为答卷单位。
- Artifact 只额外保存既有冻结 assignment 合同哈希和选中 session 的不可逆指针哈希。旧版读取先验证真实课程／任务创建者，再读 Artifact，只查询其已纳入 session 元数据及密文摘要；不查询最新完成名单或解密全体结果。新增答卷不会改写旧版。
- 文件范围：`training-analysis/group-source.ts`（叶数值适配）、`source.ts`（任务授权与来源／指针）、`group-report.service.ts`（现有生成／读取分支）。后者只补该来源接线，不碰 Long 的计划／波次或 Composite START；纵向消费者可复用正式数值适配，但本切片不声称已接通群体纵向。

## 需先确认的最小后续方案

**Teacher 非 Form GROUP 合同**：库 Scale 在首批既定工具范围内。新明确审阅发布的 GROUP 版本应使用同一 C / FINAL 事实，在各受众 resultDisclosure 内保留原已批准的本人摘要上限、只向组织披露群体，不把两者做成必须二选一。现有合同字段能表示，但 registry／个人 reader 有具体硬拦截，最小修订及发布角色见 `teacher-nonform-group-contract-proposal-20261030.md`。旧 INDIVIDUAL_ONLY / NONE 版本不变；方案待 DOT 确认，未实施权限变化。

**新的课程独立 Scale 投放**：#423 已在真实课程投放／成员验证后的新 start 中复用 `AssessmentEpisode.courseId`，恢复／重启／FINAL 保留该归属。本子分支只消费该标记的新 SELF 来源与正式冻结分数，接现有统计／Task Artifact；不改 #423 启动候选，不迁移或猜填旧 episode。

**独立 SJT**：普通启动没有同等课程字段；如产品确需独立课程任务，先确认复用现有课程父任务投放是否足够。优先使用已经接通的普通组合／Bundle，不自行为旧历史新增来源表或批量迁移。

## 必要验证范围

新增两个纯适配用例覆盖最新完成／缺失／零／可见值和协议／Profile／单位隔离；一条真实五人独立认知发布→正式提交→生成→读取合同，另只对归档后的旧版可达性补状态变化断言。后端类型检查一次。既有 Survey / Training / School / Teacher 业务、PG、前端／浏览器输入未改，不重复旧 81 / 175 / 41 项或整套浏览器。不是生产压测或部署证明。
