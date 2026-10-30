# Training 单次群体报告增量（2026-10-30）

本批接在 Survey PR404 的稳定点 `d21fe795639f340882426bcebeef78263c208221`，
集成的 main 为 `1cc077a8ee8e9475799788ab2b8bf5a4511630fe`。
产品提交 `5660eb1a8ce96def7495b029601164e30177b70f`，tree
`59515581e28bc9045049e1a6dfaf197393800c9c`。完整产品约定继续以
[group-report-implementation-20261030.md](group-report-implementation-20261030.md) 为准。
本批是可阅读、打印的课程问卷单次闭环，不声称四入口或 Training 所有来源已经完成。

## 本批行为与范围

- 在课程既有分析入口默认打开单次报告；主动进入原“前后测比较”时才挂载原分析页面。
  查看单次快照不触发旧纵向分析的全课程来源发现。
- 先读课程当前有权任务名称和已生成版本索引。配置工具是独立显式动作；重复打开已有版本
  直接用 taskId/artifactId 读取。生成更新版追加同一共享快照表，旧版保留。
- 仅原有业务培训师、当前课程创建者，沿用原账户状态和真实课程交付关系；课程共享、
  ADMIN 身份或派生报告授权不扩大原工具访问权。只选 SELF；观察者/学生评教等保护入口不混入。
- 当前来源是已有冻结课程问卷与普通组合（QUESTIONNAIRE/LEGACY_COMPOSITE）。
  原 reader 明确排除的独立/unscoped Assessment 与固定 ASSESSMENT_BUNDLE 尚未接入此目录；
  不依据今天学员名单补造归属。Bundle 叶工具适配仍需后续完成，不做其 Profile 分布。
- 叶工具按 item 定位；Form 按冻结 section 定位，其各题/矩阵行是指标。
  统计支持原有正式 Scale、Cognitive、SJT 数值，及 typed/旧基础 Form 数值和单/多选。
  不平均类别编码、不读取原始试次重新计分、不生成自由文本总结。
- 复用现有 source 的题本/计分/单位/profile、冻结分卷与材料分组、Scale 数值披露以及
  研究 consent/withdrawal 检查。生成时只发现选中叶工具，不连带读取其他 Scale/SJT 结果。
- 最新正式完成父结果先于分卷与指标选择；同人旧分数不回补最新缺失，未完成重做不替换已完成。
  这只是当前 Training adapter 的小型父结果选择，未创建独立纵向 Series/Observation 引擎；
  个人纵向接口稳定后在自然集成点替换为共用输入，未复制 PR399/406 未定版文件。
- 无稳定全局身份时计答卷；研究内绑定只在该来源内匹配，不推定跨研究是同一人。
  assignedN 不可知仍为 null。每项指标独立有效 N，保留 0、负值与缺失。

## 复用与实现边界

`training-analysis/source.ts` 增加内部单次/header/page 投影选项，继续使用原有批量
accepted facts 与 canonical parser。Form 旧基础事实通过
`preloadCompositeReportFacts(..., {includeLegacyForm:true})` 读取原冻结 collection snapshot；
默认原报告/分析调用行为不变。调用内缓存 Form 定义，按父结果页读取，不新建流计算框架。
保留 6000 父结果、500 展开 Form 指标、每批现有观测/参数界限，不做无界查询。

统计使用 PR404 的 `summarizeGroupMetrics`。Training 原有最低有效样本 5 保留：
不足样本的统计/计数从公开投影中去除；小缺失补集隐藏；选项频数或其补集过小则整项分布隐藏。
不新增异常值剔除或审核流程。现有人工质量按原精确 sourceHash 范围复用，未将不同分析范围的
判定擅自改成全局标签。共享阅读组件仅扩展“未披露”投影，Survey 公开统计不改变。

仍用 PR404 已有加密 `reporting_task_artifacts`，Training 无新 migration/队列/缓存。
读取只复核课程/任务范围、原父结果及冻结 epoch/slot 指针、现有研究状态和精确质量状态。
SQL 返回 accepted snapshot 密文的摘要，应用不解密原结果或重新发现最新 FINAL；
新答卷不扩大旧快照。打印与页面共用已获准投影，无后台指标旁路。

## 实际验证与失败续行

证据在 [../evidence/group-report-training-20261030/manifest.json](../evidence/group-report-training-20261030/manifest.json)。
它是执行后整理与文件哈希清单，未签名，也不是正式 CI 接纳证明。

- 原直接受影响 source/service/Scale dictionary/SJT flow 与新 group 合同首轮
  **168 PASS / 1 FAIL**。失败是新矩阵 fixture 只有一个选项，违反原题本至少两个选项规则；
  修正 fixture 后只选择该失败项与新 legacy 用例，**2 PASS / 88 filtered**。
- 后增“只发现所选 Form，不读无关 Scale/SJT” **1 PASS / 87 filtered**。
  定义缓存/查找整理后只复验 group 的四个受影响 case，**4 PASS / 84 filtered**；
  不把这些已重复的 case 再计作新增覆盖。backend unit 合计 171 个不同成功 case。
- 真实 PostgreSQL/HTTP setup 首轮未进入业务 case（suite failure / 1 pending）。
  builder 默认创建两个 Form section，fixture 错将首 section 提交当作整个父结果完成。
  只读保留结果确认：数值 section 已完成，多选 section 尚未完成；没有重建已发布问卷、
  重做第一份已提交 section 或清空数据库。续行指定原 task，补剩余 section 与其余 5 人。
  原记录与诊断保留，业务 **1 PASS**：6 名合成学员实际 FINAL、数值与多选分别生成、
  更新版/旧版并存、原版本重读、owner/stranger/未登录/学生权限。
  原快照读取时 spy 实际只记录 **1 次 artifact 解密**，没有 participant FINAL 解密。
- 前端新入口 **2 PASS**：默认读取快照不调用纵向 discovery，显式配置/生成一次，旧版重读，
  未披露值不进入阅读/打印标记。原比较页面测试仍针对原具名内层组件，不改变其原断言。
- Chromium 实际 React/axios 配置与阅读组件，通过合成 HTTP fixture 验证读取无需 discovery、
  选择工具/生成、切指标、读旧版、真实 fullscreen、1440/390 无横向溢出、打印全部指标。
  保留截图和真实两页 A4 PDF，pdftotext 包含本周小时/学习活动/阅读/讨论。
  这是合成浏览器合同，不能冒称完整产品 backend 浏览器旅程或生产容量测试。
- backend tsc 当前候选实际 exit 0；frontend app tsc exit 0；受影响 frontend lint exit 0，
  保留 1 条新增 ref-cleanup hook warning，不声称零 warning。
  初次文件创建 cwd 失误时的缺模块/类型错误日志也保留；之后只修当前问题。
  有一次 backend type 的 exit 0 已随 Notion 读取返回，跟踪结果时误又启动同输入命令；
  后一次也 exit 0，原件单列。它不是新增必需检查，不以此声称没有重复调用。
- 仅对自建 loopback `eduk12_group_report_test_20261030` 补齐当前 main 的迁移；
  真实 dev/test/生产库、Redis 和其他节点未改。未重验 PR404 的 81 项/浏览器或整个计分库，
  未运行应用镜像/全量构建、压测、完整原始认知/SJT trial 旅程。

当前 174 个不同成功 case = backend unit 171 + real HTTP/PG 1 + frontend 2。
原失败 invocation 未改写成成功；不把 filtered/pending 作为已验证。
后续变更仅整理 group 独立路径的叶来源定位、调用内定义缓存和说明文字，定向 case 已列明；
历史首轮与 PG 断言不是最终所有输入的签名 CI 证据，不重放未受影响的公式/全角色用例来填表。

## CI 与接下来

Training Draft 将以 PR404 分支为 stacked base，便于独立审阅本批差异；当前主 CI 与
publication 的 pull_request base 列表不包含这个分支。因此正式 CI/Ready、镜像/SAST、
精确 main schema upgrade/native dump-restore、合并资格均 **NOTRUN**，未人工触发全平台路线。
未修改 CI 控制、PR401 控制或 PR399/406 的个人纵向文件。
基线审定后再按实际完整差异确定缺失检查，不把 PR404 的 Draft 预检绿灯当作本批正式资格。

后续仍需：独立与固定 Bundle 的合法叶来源、School/Teacher 单次及单维子群、稳定个人
Longitudinal 接口后的预配置群体趋势/相邻配对。默认各轮当时人群等产品决策不改变。
未 APPROVE/merge/deploy，无生产或真实用户写入。

## PR408 真实课程入口修订

DOT 对 `69da22cf` 的 review 指出：原 COURSE_ANALYSIS_ENABLED=false 在课程导航与
TrainingTrainerCourse 两处阻断入口；先前组件/独立报告夹具通过不能证明真实课程页可达。
本次明确修正这个缺口，没有将原证据改写成实际入口验证。

增加 COURSE_GROUP_REPORT_ENABLED=true，课程“群体报告”页签和原 analysis 深链仅开放单次报告；
COURSE_ANALYSIS_ENABLED 仍为 false，包装器不提供旧“前后测比较”按钮，也不挂载旧分析。
课程 owner 判断、真实 API 授权及其他功能开关没有扩展。

只选择一条真实 TrainingTrainerCourse 路由旅程：从课程测评页签进入单次报告，再重载
`/courses/:courseId/detail?section=analysis` 并读取快照；断言旧 comparison 入口不可见且不请求
training-analysis。Vitest **1 PASS / 18 filtered**，不重跑 174 项。
Chromium 使用真实课程页面、BrowserRouter、课程页签和 flags，通过同一导航/深链/快照旅程，
保留实际 URL、请求轨迹与截图。HTTP 响应及 owner 为合成数据；不冒称重新验证了真实登录或授权。
frontend app types、四个受影响源文件 lint 均 exit 0。

两个浏览器 setup 失败（esbuild 同步 API 不支持插件、课程 CSS 需 WebP loader）保留，
修对应构建入口后首次产出本次课程夹具；没有重跑旧全屏/打印/174 项。
证据位于 `docs/evidence/group-report-training-20261030/course-entry/`。
PR404 的 main/正式资格工作仍在其独立分支进行，本修订不混入该候选。
