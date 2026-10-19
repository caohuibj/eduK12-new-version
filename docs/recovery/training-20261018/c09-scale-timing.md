# C09 · Training 可选 Scale 浏览器有效计时

## 切面及冻结规则

基线 `40cb2050b57b77cba2ffea3deb92ed6f67656d5d`；首个可回退 checkpoint `29359f9e`，随后 `313fe677`、`82ffd9bd` 修复审阅/真实测试发现。仅当前隔离云节点，重型检查共享 `.measurement.lock`；不 push、PR、CI、生产或浏览器绕过。

这是普通新版 COURSE QUESTIONNAIRE 的显式可选采集策略。真实来源是发布时服务器读取的 Course.id/courseType/isLibrary 与投放关系；只接纳 TRAINING_COURSE，LEGACY_COURSE 不能猜成 Training。匿名须唯一课程，不能从客户端/Host/作者域/当前成员关系补推历史。新 admission 在既有 membership 查询（匿名唯一课程额外一次有限查询）复核当前类型与 nonlibrary，不新增 ACTIVE 课程状态门槛。已有 attempt 保持冻结来源，仍执行原 principal/ownership/课程访问鉴权。实际数据库另有 course product domain immutable trigger；测试保留其拒绝类型修改的结果，不禁用约束。

四个 additive 字段：CompositeAssessment.trainingTimingPolicy（nullable）、timingExportEnabled（false）；CompositeAssessmentAttempt.trainingTimingSnapshot（nullable）；Assessment.timingEncrypted（nullable）。迁移 `20261018094700_training_scale_timing` 无回填。policy/snapshot 有独立完整性 hash，snapshot 随真实 admission hash、single FINAL payload hash、whole logical receipt hash 绑定。未启用/旧 null 不向旧 hash 添加字段。科学 ScaleDefinition、scorer、报告 worker、responseTimeMs 语义不变。

采集在发布冻结。复制草稿重新校验课程，独立披露能力重置 false。timing-export-policy 路由仅原 owner/admin，revision CAS + 审计。rawAnswers 和 summary 均不隐式授予 timing。

## 浏览器、FINAL 与存储

复用 Survey tracker 和提取后的同一 visibility/focus/pagehide 生命周期 hook；不搬 Survey ONE_BY_ONE 产品默认。Training 单项/whole 使用实际 ScalePlayer 挂载后的边界，前台聚焦累计，隐藏、失焦、显式暂停不累计；暂停禁用答题 fieldset。只记录累积数值、修改/重访计数及恢复标志，无按键内容、鼠标轨迹等新数据。

恢复只读取与 snapshotHash 绑定的累积量，不恢复旧 performance 起点。没有观察到的恢复答案不合成零。封存提交沿用 C06 sealed payload：网络响应丢失后同 submissionId 复用同 answers + timing，不能再读取活跃 tracker。

服务端统一 normalizer 校验有限数值、known/answered item keys、row schema、400000 字节/1000 条单项预算。whole 所有 timing 合计 400000 字节/3000 条，并保留既有整包上限；receipt 接受前校验。Zod record 解析前拒绝会被丢弃的 __proto__。disabled 注入拒绝。enabled 缺少可选 timing 不拒答案，保存 MISSING；旧/off 为 NOT_COLLECTED。未采集与缺失均不补零。

single timing 与答案同 FINAL 事务一次写入；whole timing 先与答案同一 receipt 接受，随后原 worker 同 child FINAL 事务持久化。幂等重放不累加、不补写。密文只含规范 items、contract、snapshotHash/status，不含完整科学定义或整份课程列表。默认关闭保持 timingEncrypted NULL。

compact/shared 路径：unit timing 位于加密 personal reference；whole timing 位于加密 unit tuple 可选第三项，公共模板不含 timing snapshot/课程/参与者事实。旧二项 binary codec 路径不变，带私有 timing 的 whole 使用原 authenticated JSON codec。不能仅以 env=true 代替实际 ref/template 断言。

## 可见范围与导出

仅当前已授权教师/admin 报告投影，以及原队列生成 CSV/ZIP，受当前 timingExportEnabled 控制。学员/匿名反馈不增加耗时评价。科学缓存不存 timing 授权结论；每次在已有必需 header/owner 读取中取当前能力，off/legacy null/participant 不增加 timing 查询。enabled 且已冻结的教师读最多一次批量查询每 Scale timingEncrypted，再追加独立投影；撤销后缓存命中也不返回 timing。

CSV/ZIP 的 TIMING_scope/status 及逐题 firstResponseMs、activeTimeMs、changeCount、revisitCount、status 来源同规范密文。时间单位毫秒；缺失数字为空，不等于 0；NOT_COLLECTED 与 MISSING 明确分开；中断、恢复无首次时钟由逐题 status 描述。报告 API 保留 visits/interrupted/recoveredWithoutClock 原始描述性元数据。item code 使用既有 export 字段规范化，例如 Q1 映射 q1。summary 可独立包含 timing，不包含 raw Q_V 答案列。C07 typedForm 无损列与共享 CSV guard 不改。

原导出 projection/fingerprint/queue/artifact/download 重新鉴权全部复用。开启时指纹纳入能力和 revision，撤销旧产物不可下载；重新开启也不复活旧产物。

## 验证及边界

- 后端定向 normalizer/admission/projection 测试、control-reference codec 测试与 tsc。
- 前端 Survey 原生命周期/计时、Training 单项/whole 封存恢复、authoring 控制及报告投影组件测试与 tsc。
- 真实隔离 PG16.15 UTC、loopback、无 Unix socket；非 owner runtime；Redis7.4.11、Node24.21；实际 HTTP authoring/preflight/publish/admission/FINAL/replay/report/export/revoke。
- HTTP 02 四模式 PASS：单项登录 enabled、whole匿名 enabled、whole登录 MISSING、单项 off；来源拒绝、其他 owner 拒绝、坏 key/proto 拒绝、旧hash/replay冲突、学员无 timing、summary CSV/ZIP 无 raw、撤销/重新开启旧产物404。具体 fingerprint/次数/耗时/字节/cleanup 见 evidence。
- 原 HTTP 01 失败保留：fixture 误用大写导出后缀 Q1；修为既有 q1。HTTP03 失败保留：fixture 试图变更不可变 course product domain，数据库正确拒绝，未绕约束。codec 初次测试因插入 case 改变旧 size test 的 cases[0] 失败，修测试排列，不放宽180字节断言。
- 完整 CPU/RSS/DB 并发属于 C26，本阶段仅定向观测请求字节、延时与新增存储，不宣称吞吐/成本收益。浏览器正式 C25 另有隔离临时 HTTPS；本批不重试 blocked Chromium。

回退：先关闭新草稿采集/当前披露，退回本批源码前 checkpoint；保留 additive nullable 数据，禁止删已有 timing 或重解释历史。迁移向前兼容但旧源码对已启用策略不识别，恢复旧服务前须停止新 timed 准入并保留已接受 receipt 的匹配 worker。

### 实测记录（2026-10-18 UTC）

`c09-evidence/http-02.json`：普通存储217个真实请求全部通过；`http-04.json`：compact/shared/compact-report 221请求全部通过，实际 UAR2/WVP2 ref 与公共模板隐私断言通过。两轮 cleanupVerified=true。单个合成题 observed 密文普通776字节/compact490字节；MISSING 普通458/compact370；off无 timing 密文。这不是数据库总存储/吞吐比较；JSON.stringify(null) 的4字节是测试输出表示，不是数据库新增实体成本。

教师报告显示与 API 同规则，只展示当次授权投影，不从答题缓存或总时长补推。前端 `TrainingTimingReport`/`CompositeReportPage` 2文件19测试通过；显式 `tsc -p tsconfig.app.json --noEmit` 与 Vite production build 通过（保留既有大 chunk warning）。backend control-reference codec 18测试通过；normalizer7测试通过。此前6前端文件64测试、补充sealed retry与边界2文件7测试通过。新增报告query 2测试、Survey 3个contract 69测试通过；Survey research-wave FINAL 在新隔离真实PG运行27项、0 pending，cleanupVerified=true。恢复鉴权边界2项通过，39项非目标测试明确过滤；仅逻辑防御，未声称数据库实际改变course_type。完整日志/摘要见 c09-evidence/index.json。早期未指定项目的前端tsc只读取solution配置，不作为通过证据；最终显式app项目检查已通过。
