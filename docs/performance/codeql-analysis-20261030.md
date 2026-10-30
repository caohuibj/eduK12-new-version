# CodeQL 本地分析与最小优化建议

分析基线：2026-10-30。下方首批实施记录为本地独立改动；未触发新扫描。

## 实际基线

- Bundle PR405：run41031648227/job123982698422，总19分45秒。准备/初始化约24秒；JS抽取约121秒，Python抽取约4秒；JS finalize约43秒，Python约8秒；JS查询阶段约961秒，Python约15秒。查询可并行且共享中间结果，不将单条耗时相加。
- PR404 run41033280096：CodeQL总78秒，analyze43秒。
- PR408 run41035994222：CodeQL总69秒，analyze40秒。
- Bundle实际配置：完整 backend/src、frontend/src、.github/scripts、server-version/e2e；security-extended；threads2/ram3500。运行机日志内存约16GB。
- 058cd240目录清点：上述路径共5157个JS/TS/Python候选文件（不是已证实实际抽取数量），约2142个文件名称/目录含测试标记。JDR绑定只有41个源码路径和11个控制路径。
- 原日志明确 No overlay-base databases found 与 overlay mode none without caching；diff-informed扩展已启用，不能把“增量分析”当作尚未开启的一键选项。
- 105个JS查询中，PolynomialReDoS单项显示5m6s，TaintedPath3m39s，ShellCommandInjectionFromEnvironment2m51s。不能因单条慢而删安全规则，也不能据此认定业务存在漏洞。

## 根因与置信边界

1. 已确认扫描输入比JDR实际变化宽得多。nativeSastConfig按共享native分支使用完整源目录，且因仓库存在school-teacher-package文件而把整个e2e加入，并非按当前候选的真正需要选择。
2. 查询阶段是主要瓶颈，网络和初始化不是。Python非关键路径，不值得先拆多语言job。
3. 资源上限偏保守，可做低风险优化候选；没有同输入A/B，不能宣称增加CPU/RAM会按比例提速。
4. main多次合并导致候选重对齐；完整扫描覆盖集合因此变化，旧结果不能仅凭业务文件未变就宣称有效。稳定集成顺序可直接减少重复候选。
5. 无overlay缓存确有发生；为何未命中与当前extended配置/主分支缓存生产的关系尚未全面验证。不建议此轮自制数据库缓存或另造扫描系统。

## 建议顺序

第一步：不降低覆盖，先用现有机器资源。只对宽扫描模式将2线程/3500MB调整为适合当前4核16GB公共Runner的4线程/约8000MB，保留系统余量；小范围轻量检查保持现状。保持同一候选、语言、查询套件和路径，仅在下一次本来就需要执行的扫描记录阶段耗时。不是为性能另跑多轮实验。

第二步：修正Bundle扫描范围选择。至少去掉因“文件存在”而无条件加入所有e2e的逻辑。按实际改动涉及的Bundle、报告、授权、运行器及直接调用关系建立少量稳定目录范围；不能只拿41个改动文件当完整数据流，也不开发通用依赖图推导系统。改动共享跨域模块且不能证明界限时保留宽扫描。

第三步：沿现有官方证据接纳，只在完整扫描输入/查询和执行配置未变时复用；变化的控制或独立部分单独处理。有应用交叉依赖变化时不能拼接旧SARIF冒充完整检查。不要为每个PR添加一套新的复用器和证明流程。

暂不做：新安全平台、付费Runner、自建缓存/分析引擎、JS/Python矩阵拆分、删除慢查询、为提高速度取消security-extended、改门禁成功定义、大规模改写ci.yml。

缓存若以后仍有必要，优先调查官方overlay的兼容条件和现有main生产，不另造机制。官方2026-03说明当时自动overlay优化限default suite；不能承诺当前extended直接获得同样收益，更不能暗改套件。

## 最小验收

- 资源调整只核实际配置和下一次必要扫描的成功/耗时，未变应用测试不重跑。
- 范围修订只证明此次必需源码/消费者/控制均被选中；不再机械重复四入口旅程。
- 复用保留精确原运行和输入关联；没有新问题就停止追加检查。
- 效果报告区分实测/估计；不承诺19分钟变1分钟。

## 来源

- https://github.com/caohuibj/eduK12-new-version/actions/runs/41031648227
- https://github.com/caohuibj/eduK12-new-version/actions/runs/41033280096
- https://github.com/caohuibj/eduK12-new-version/actions/runs/41035994222
- .github/scripts/school-teacher-native.mjs 与 .github/workflows/ci.yml @058cd240
- https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/analysis-takes-too-long
- https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-the-command-line/incremental-analysis
- https://github.blog/changelog/2026-03-24-faster-incremental-analysis-with-codeql-in-pull-requests/
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job

## 首批实施记录

独立分支以 main31845e3a 为基线。只改原native配置选择器和原CodeQL资源参数：完整应用目录/查询套件不动；e2e仅按候选source选取（既有已认证package continuation不变）；native任务4线程8000MB，其他任务仍2线程3500MB。未新建workflow、缓存、复用认证系统或门禁。

验证：2026-10-30 DOT Node24.22.1 单个配置定向测试通过，检查候选e2e选择、无关文件存在不扩范围、原continuation及查询套件保留、资源表达式。git diff --check通过。未执行应用测试或性能扫描；正式耗时收益待下一必要运行。该分支待当前核心功能候选收口后对齐，不改正在运行的CI。

独立审阅发现并修正：生产调用必须显式传入当前 lane 的 binding，不能因仓库存在 package 文件就默认选 package continuation。该修订与 PR405 已有方向一致；新增同一配置用例核对实际调用及默认不误选旧 continuation。
