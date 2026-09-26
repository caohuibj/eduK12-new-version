# Reporting V2.2：群体筛选与自动纵向报告

核对基线：`e6c3f84bcc2bf134bcbe86bfa30912dc470a2589`（2026-09-26 main）。

## 结论与范围

原计划对现有架构的判断基本正确：已有 GROUP、REPEATED_COHORT、MATCHED_LONGITUDINAL、不可变 Series/Wave/Artifact 和 comparability；缺的是报告时子群选择及自动编排。代码路径在 `server-version/` 下，不能直接按原计划中的根目录路径修改。

本次实现用户明确强调的两个目标：标签／班级子群的单次报告，以及相同筛选条件下的多次测量纵向报告。它们共同交付为一个可独立验证的核心改动，避免只交付筛选而纵向入口仍不可用。个人纵向报告和匿名链接管理是原计划中另两项独立扩展，本次核心交付不将其算作完成；匿名结果依旧不能进入 Organization reporting。

## 与原计划相比的重要修正

1. **客户端不提交历史锚点。** 请求仅携带 selector V2、clauses、combine；服务端读取 Run.publishedAt 并冻结。未知字段、结果值筛选、外组织引用均拒绝。
2. **按维度组合。** 同一标签维度可选择 ANY/ALL，不同维度与班级之间 AND。班级列表内部 OR。集合与子句去重排序后计算 identity。
3. **两种群体语义明确分开。** WAVE_SPECIFIC 在每次发布时解析标签／班级；BASELINE_FIXED 冻结最早一次所选用户，后续按 userId 追踪，允许 Membership episode 改变。后续有 execution 但未完成者保留 NOT_COMPLETED；没有该次 execution 的人不能伪造观察。某时间点完全没有所选群体时整体拒绝生成，不静默丢弃时间点。
4. **PAIRWISE 的真实边界是恰好两个时间点。** 当前引擎不能接收三次并自动产生多个不同配对样本。界面明确这一点，默认 FULL_CASE 支持三个及以上时间点。若以后要求一次产出多个 pairwise 比较，应新增显式 pair-artifact 集合契约，不能把每对不同样本伪装成同一个全程样本。
5. **自动 Series identity 包括结果快照。** 只对 source IDs + selector 做 hash 会把后续新完成数据锁在旧 Wave 中，或者引发 immutable binding conflict。本次使用 cohort identity + 权威结果 manifest + 排序后的来源 + strategy。输入相同可安全重试／并发复用，输入变化创建新证据。
6. **保留 V1 hash 契约。** 无 selector 的旧 GROUP 请求仍生成 V1；V2 单独规范化，并将 execution/actor 身份纳入 identity。已有快照、Series、Wave、Artifact 不迁移重写。
7. **发现接口可翻页。** 取消原有全局 200 条截止，以受限页大小分批读取、逐 Run 检查当前 authority。界面可加载更早测量。候选不等于可比较，跨版本仍由既有 comparability 规则决定是否允许 delta。
8. **不自动发明报告方案。** 用户仍需有已发布的对应 GROUP／longitudinal spec；本次不自动发布 scientific contract，也不修改 scorer。

## 已实现接口

- `GET /organizations/:organizationId/reporting/cohort-options`：当前 Reporting workspace 有权访问的班级、分类维度、标签元数据，不含成员名单和人数。
- `GET /organizations/:organizationId/reporting/sources?page=1&pageSize=100`：兼容现有来源结构，新增 nextPage；没有全局候选截断。
- 既有 `POST .../reporting/analyses` GROUP 请求可加 `cohortSelector`。
- 同一 analyses 路由接收 automatic longitudinal 请求，无需客户端创建 Series/Wave。

```json
{
  "analysisKind": "MATCHED_LONGITUDINAL",
  "sources": [
    { "runId": "<T1-run-uuid>", "trackId": "<T1-track-uuid>" },
    { "runId": "<T2-run-uuid>", "trackId": "<T2-track-uuid>" }
  ],
  "cohortSelector": {
    "schemaVersion": 2,
    "combine": "ALL",
    "clauses": [
      { "kind": "LABELS", "labelIds": ["<male-label-uuid>"], "match": "ANY" },
      { "kind": "CLASS_UNITS", "classUnitIds": ["<class-uuid>"] }
    ]
  },
  "cohortStrategy": "BASELINE_FIXED",
  "mode": "FULL_CASE",
  "specId": "<published-spec-uuid>"
}
```

指定成员界面和受个人权限保护的搜索接口已在 [收尾验收](reporting-v2.2-closure.md) 补齐。

## 实现不变量

- 选择结果只与本次已冻结 Run/Track population 相交；每个选中 execution 必须准确匹配一次权威结果或未完成记录。
- 结果源继续校验完整 Track 的来源完整性，再产生子群结果 batch；不重新计分。
- 阈值按所选子群及有效贡献者执行；母群体人数不能帮助小子群通过阈值。
- 所有输入 Run 在编排前授权，每个 Wave 绑定及最终生成再次授权；读取和导出沿用当前权限复核。
- 未完成／低质量／不可比较规则沿用已有引擎。没有 comparability evidence 时不能增加数字差值。
- React 只选条件和呈现服务器投影，不下发原始成员结果进行浏览器统计。
- 同一个 Run 不可作为两个纵向时间点，避免将同次重复 Track 误当作重复测量。

## 数据库与验证

只增加历史标签／班级查询索引与 resource discovery 索引，不修改历史报告数据。新 migration 已在独立 PostgreSQL 16 测试容器从空库完整应用。新 PG suites 加入 CI 的 critical integration must-not-skip 清单。

核心验收覆盖：旧 V1 可读取、V2 去重复用、精确结果子集、小子群 suppression、不可更新／删除、非法引用、标签 ANY/ALL、标签与班级 AND、半开历史区间、转班、50/500/2000 人查询预算、自动排序三个时间点、两种群体策略、两个既有纵向引擎、重试与并发复用、跨 Membership episode 匹配、未完成数据保留。

上线前仍须对本次提交完成仓库 Full Gate（包括完整后端、前端、迁移演练、浏览器验收、Docker、CodeQL、merge-gate）。本地定向回归不替代 Full Gate；不得把 Draft 或本地通过表述为已上线。

## 本地验收记录（2026-09-26）

- Reporting 全部相关单元与 PostgreSQL 集成：20 个文件，68 项通过，无跳过。包含旧 HTTP、发现、导出、隐私与 query-budget suites。
- 报告页面：2 项通过，覆盖权限撤销后清除投影，以及同一男生标签用于单次／纵向生成。
- 后端正式 build（含现有 bundle、SJT、Scale 检查）通过。
- 前端完整 typecheck 与本次修改文件 ESLint 通过。
- 独立测试库完整应用 82 个迁移；无生产数据访问或迁移。
- 首次并行运行旧 PG suites 曾出现一次 Run publish 序列化写冲突，隔离串行完整回归通过；没有修改业务事务语义来掩盖该问题。
