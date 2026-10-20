# Training / Survey 真实数据 reader 复用盘点

固定源码：6ca90b06d77868ba1932fcfec66fce0856da3fd8。只读源码盘点，未访问业务数据库或原始个人数据；管理员能力 PR 尚未合并，以下是现有业务范围边界，不是未来管理 grant 的替代实现。

## 可直接复用的边界

| 入口 | 现有入口/reader | 实际保证 | 新版本接入仍缺什么 |
|---|---|---|---|
| Survey 项目源 | analytics.source.ts:449 loadSurveySource；readSurveySourceMaterial:467 | 当前 project owner、SURVEY domain、active/unfrozen/unexpired user、ACTIVE researcher grant、enabled MFA；FOR SHARE 锁；波次属于同项目；最多500 FINAL/页；截止点/sourceRevision/count fence | 最终 reference.analyze/review/publish 能力与范围交集；候选写事务内重新比较项目revision/现有授权，不能跨事务沿用旧资格 |
| Survey 事实 | analytics.source.ts:834–886；analytics.cohorts.ts FrozenScoreObservation | FINAL/project/wave/publication/definitionDigest 一致、results hash、执行轨迹、非withdrawn/未排除、score quality/missing状态、sourceFinalHash；selectRaw=false/selectScore只取所需指标 | 在同次已验证publication读取里导出measurementReleaseId/hash及实际metric身份；不得从前端manifest回填。新/旧身份一次迁移前不能伪造对应 |
| Survey Cognitive | cognitive.results.ts:77 decodeResults、108 loadSurveyCognitiveResultGroups | 项目/波次/attempt/publication/slot/epoch及resultId/hash/measurementDigest；原始trial单独includeRaw；metrics-only批次最多8组，不重跑scorer | 使用实际子resultId/resultHash作为事实版本，结合publication新release映射；candidate默认不必取raw trials |
| Survey 样本纳排 | sample-quality.service.ts owner/listSampleQuality/setSampleQuality；analytics.source.ts:519/842 | owner锁，完成/未撤回真实FINAL，质量review revision，质量变更增加project revision并撤销旧导出票；WITHDRAWN排除 | entry人口组/重复作答/有效数值规则须明确，以真实reader结果生成eligibleEntryKeys。平台治理身份不自动得到项目样本 |
| Survey 原始导出 | analytics.export.service.ts:23 assertRecentSurveyMfa、48 guardedOwner、318 downloadSurveyExport | 最近5分钟签名Survey MFA；创建/下载均重新查owner、grant与project revision；导出票不是永久访问权 | 复用既有MFA而非另造；参考分析权限不能自动扩成raw export，默认原始事实与解释导出仍须分开 |
| Training scoped入口 | composite.service.ts:231 assertOwner、733 assertRelationalTeacherAttemptReadAllowed、5846 getExportContext；composite-export.service.ts:146 teacherRelationalExportVisibility | 作者/教师资源范围、关系测评仅指定observer个体策略、组织资源禁止走通用接口；受resultDisclosure治理的投放拒通用导出 | 现有ADMIN分支不是新reference能力；最终用管理员接口与这些业务scope相交。getExportData/底层reader不可视为已授权服务 |
| Training Scale事实 | compact-assessment-storage.ts:104 createStoredScaleFactsReader/148 createStoredScaleExportReader；scale-fact-records.ts:27 loadScaleFactRecords | assessmentId+attemptEpoch+submission/payload identity、sourceResultHash，compact/raw按需恢复；不重新计分 | 真实事实ID建议绑定child assessmentId+epoch，factVersion用已核sourceResultHash；release映射从已验证runtime/一次迁移获得，不能用当前Scale默认指针替代历史 |
| Training 批次 | composite-report-read-batch.ts:60 preloadCompositeReportFacts | 只接受已授权且已投影parent，校验parent/epoch/slot/version，shared runtime与template有界预载，sourceResultHashes可复用 | 新候选服务复用一次请求local reader，不重走报告布局；numericOnly/selectedItemIds避免无关指标。reader自身无业务授权 |
| Training SJT | situational-canonical-export.ts:20 loadSituationalExportSlotSets、42 readSituationalExportResults | frozen slot集合、canonical UNIT_RESULT，源submission/parent/epoch及instrument/scorer/runtime精确身份；skip/restart不当作完成样本 | 保留真实SJT事实ID及hash，不转换为Scale。新release引用需由冻结slot/迁移映射查出 |
| Training Cognitive | cognitive/export.service.ts getCognitiveExportData；composite导出已加载session/result | 可重用冻结config/engine/scoring与既有result事实解码；summary无需raw trials | export builder不证明调用者授权，须由现有assignment/composite授权入口先限定session集合；不能把报告解释数值当raw metric |

## 人口条件与样本版本

Training 已有 contextSnapshotEncrypted/contextSnapshotHash 和冻结人口上下文，可在原有绑定验证后用 ReferenceCore 人口谓词产生 entry membership。需同时保留实际测量版本、质量状态、单位、epoch与重复作答规则。

Survey 当前项目原始表单字段是研究者自定义语义；本次未找到通用冻结人口context（Cognitive现有contextSnapshotHash也为null）。不得根据题名或前端自报把某题解释为年龄/性别，或把缺失字段匹配到分层参考。初始可靠选项是只允许真正无人口限制的已批准参考；若需要分层，必须使用显式定义且版本化的字段映射，并从已验证的冻结事实提取。这是接入差异，不是新增连续年龄模型需求。

同一个事实可以贡献不同指标；同一个entry不能重复计入。eligibleEntryKeys需要由可信reader基于明确人口/质量/纳排映射产生，不由manifest复制。分析截止点后的新增、withdrawal或质量修改应触发既有sourceRevision/count fence拒绝，不静默沿用旧候选资格。

## 对接顺序与不可删的检查

1. 等管理员最终接口，以认证actor与现有资源owner/使用范围产生真实权限上下文；只传入实际获准资源，禁止用ADMIN角色推断reference/report能力。
2. 优先接Survey已有有界selectScore reader，冻结真实sourceFinalHash/childResultHash与publication release映射；保留现有计算前后source-fence。这两次读取解决计算期间撤权/撤回，不能当作无风险重复SQL删除。
3. 候选写入/复核/发布事务读数据库candidate/review，并重核当前资源revision与能力；reviewer/analyzer不从请求body取。发布者可以是审核者，正式跨入口norm审核者不得是分析者。
4. Training复用已授权parent集合与request-local facts reader，再接真实frozen context。新解释只读原始计分事实与精确参考，不调用scorer，不用当前默认版本猜历史。

尚未改应用reader或新增API。本次盘点不替代真实授权/Prisma/并发/浏览器验证。
