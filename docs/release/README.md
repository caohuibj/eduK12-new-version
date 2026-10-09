# 应用发布、CI 与验收统一规则

本文件是新发布路线的统一入口，实现位于 `server-version/scripts/release/`。生产启用须有当次用户授权；文档本身不自动赋予部署权限。本轮用户已追加快速合并及部署授权，实际结果另行记录。

## 最小验证与路线对照

**同一产物在 CI 验收一次。部署只确认产物、就绪、短关键路径和回退；不再重跑 CI。未改变的组件不构建、不切换、不进行业务回归。** 成功证据在输入不变且仍适用时复用；故障先定位，只复验失败项。用户暂停全量验证时不得自行恢复。

| 路线 | 原发布问题 | CI / 候选阶段必需项目 | 部署阶段 |
|---|---|---|---|
| A：已证明的普通样式/纯本地入口交互 | CSS 原 CI 已轻量，但现场另要求完整 22 项、迁移/恢复及再次构建 | 前端同一 build stage 编译、lint/types/audit；只有入口 TSX 变化才运行对应 TrainingScreens 契约；实际前端镜像扫描；精确受影响页面的 390/768/1440 交互、截图/WCAG | 加载同一镜像 ID；只切前端；核对 HTML/CSP、一个静态资源、短就绪观察及旧镜像回退；不停止后端写入 |
| B：已证明的窄登录 admission 修复 | 原来进入 platform 与全生命周期 | 新后端镜像；6 个既有登录/权限/CSRF/限流/cookie 契约；SAST；隔离真实 API 的正确、错误密码、错误身份不建会话及旧入口登录；实际镜像扫描；前端变化时取 A 并集 | 兼容性/旧镜像验证后切 backend 与同镜像 worker；服务就绪、匿名认证边界、短观察及明确回退；不再次执行账号生命周期 |
| C：数据/科学/广泛权限/依赖/配置/未知 | 未区分影响，现场固定作业数量 | 采用既有实际受影响门禁；未知应用范围保守全量；涉及数据/恢复程序时保留相应恢复阻塞条件 | 不进入 A/B 执行器；保留适用的数据、配置和回退保护 |
| C 中已证明仅发布工具/CI/规则变化 | 未修改业务也触发应用编译、科学回归和恢复 | `release-tooling` 精确文件/完整元数据范围、组件 tree 未变化；工具/路由契约与合成 HTTP 演练；ready PR 保留 SAST | 这是工具变更，不是新应用发布；需另行授权适配实际生产入口 |

分类使用完整 raw NUL Git diff，禁用重命名折叠，检查删除、两端路径、模式和类型。只接受明确文件及内容边界；不使用标题/标签/代码行数降级。混合 A+B 取并集，混入未知项升级 C。入口 TSX 不允许新接口、权限、存储或副作用；B 初始只覆盖 authController 的窄 entrance schema/admission 区段，哈希、账户、限流、令牌、cookie、其他处理器必须字节一致。其他“小接口”没有自动获得 B 资格。

CSS 精确映射页面：入口样式只检查首页，登录样式只检查登录/注册，工作区样式检查培训师/学员工作区，管理员样式只检查相应管理员页面；共享品牌样式才取跨页面并集。数据桩明确是 UI-only，不作为权限证明。

`scoped-release` 与旧平台消费者互斥。稳定 `merge gate / ready PR` 重算 Git 计划，逐项要求选中检查成功；没有固定成功作业数。失败、缺失、取消、异常跳过不得通过。工具专用路线要求完整差异只含确切工具/规则文件、两组件内容未变；混合应用、未知文件、删除/重命名/模式改变仍走保守路线。draft 成功不代表生产已获授权。

## 一次构建与证据复用

- 发生变化的组件在其原 Dockerfile 的 build stage 安装/编译一次，相关检查使用该 build image；最终 runtime 使用相同冻结基础镜像与 BuildKit 阶段缓存。不在 CI 另运行完整组件编译，不在生产再构建。后端 ops 仅用于隔离合成 DB，不更新生产 ops。
- 先扫描/验收实际 runtime image，再保存镜像 tar 与 SHA256。记录源提交、完整组件 tree（含依赖/配置/模式）、构建参数、镜像 ID、验证工具与锁文件指纹。镜像 ID 变化不能沿用旧镜像的扫描/页面证明。
- `qualify.py` 通过官方 Actions API 验证同仓库正式工作流、选中 aggregate 成功、artifact digest、merge-parent 来源、tar 哈希、组件检查、实际镜像扫描、独立前端/登录浏览器证据和 Compose 回退证明。不能自行编写绿色 JSON。
- 复用只适用于消费的组件、依赖、配置、参数和工具不变；输入变化只使消费它的证据失效。工具规则先正式修改，不静默绕过旧 exact-run-only 要求。当前保留 24 小时有效期和显式撤销机制；过期是已知限制，不以此自动启动全量 CI。
- 保留 Compose 切换/回退演练。候选阶段完成浏览器工具、定位器与合成契约预检；部署阶段不用浏览器重做响应式/WCAG/登录契约。代码或工具变化后只复验受影响项。

## 应用完成与灾备独立

普通完成条件：实际组件与产物正确、受影响短流程通过、服务就绪/短观察通过、旧镜像/配置回退路径有效，记录 `APPLICATION_COMPLETE`。

完整 DB 恢复、附件联合恢复和定期性能为独立任务/状态。普通 A/B 不创建重复 DB 备份，不执行迁移、令牌回填、全测评/报告/账号生命周期，不等待附件联合恢复。完成记录 `INDEPENDENT_NOT_CLAIMED`，不冒充新备份已可恢复。

既有备份策略、轮换、附件引用保护和清理授权保持有效。新 DB 版本必须有自己的实际恢复证明；不得复用旧 DB 恢复结果。涉及迁移或备份/恢复程序的 C 发布，相关恢复证明仍可阻塞发布。

## 执行器与安全重试

- UTC 时间 + UUID 的唯一尝试目录，独占检查点、不覆盖历史备份。互斥锁防止并发发布。相同已完成镜像重复调用只确认状态，不再次切换；失败后新尝试保留原证据与历史结果。
- 实际 Compose entry 是唯一入口。只用 image overlay 与 `up -d --no-build --no-deps` 更新选中服务；保留其他组件 overlay。普通后续重启必须使用持久 overlay，避免悄悄回到旧标签。
- 绑定实际项目、入口哈希、当前 base 提交/镜像和配置指纹。先证明旧镜像存在；B 要求完整差异无 DB/schema、依赖、配置变化与既有契约通过。现有固定端口架构下 B 不能声称零停机。
- 就绪采用约一分钟截止、2 秒间隔、单请求 8 秒上限；默认 3 次、间隔 2 秒短观察。短暂 503 等待恢复，持续失败/产物错误/关键路径失败明确回退。回退失败记 `NEEDS_INTERVENTION`。
- 公共生产探测保持 TLS 校验，不缩短科学测评参数，不修改业务测试断言。默认只打印计划；生产 `--apply` 仍需要另外授权、可验证官方产物及实际入口适配。

## 启用方式（另需生产授权）

1. 审查候选代码。当前分支未生成正式合格 runtime artifact；不得把本地工具测试或旧生产镜像冒充它。
2. 按最新项目 Instructions 只读核对生产版本、实际 Compose entry、镜像和配置。旧 `/opt/eduk12-new/deploy/compose.sh` 当前不支持 overlay，新执行器默认拒绝。
3. 保留原 entry 字节和回退记录；参照 `compose-overlay.example.sh` 在授权后适配持久 image overlay。不得修改卷、数据库、TLS、备份或清理配置。记录新的 entry SHA256。
4. 配置需要 `environment/project/entry/entrySha256/state/overlayProtocol/baseHead/baseImages/url/oldReady/configurationFingerprint`；B 另需 `backendReadyUrl/authProbeUrl`。配置指纹使用 `executor.configuration_fingerprint(actual_compose_config, plan.changed)`；baseImages 至少绑定 frontend/backend/worker 实际 IDs。需要能读取 exact base/head 的 Git checkout，不能把服务器的非 Git source export 直接当 checkout。
5. 取得正式 scoped Actions ZIP。用 `qualify.py --plan ... --config ... --archive ... --artifact-id ... --run-id ... --output ...` 核对来源，提取并加载已核验 tar，核对镜像 ID。先运行 `executor.py --config ... --plan ... --receipt ...` 查看计划；批准后使用 `--apply --archive ...`。
6. 分别报告应用与灾备状态。现场旧 `complete-release.py` 的固定 22 与强制联合恢复不得继续用于 A/B 新入口；本 PR 未在生产修改该历史脚本。

## 时间记录与已知限制

目标 A 15–25 分钟、B 20–40 分钟、已有合格产物紧急修复 10–20 分钟，均从开发/本地验收完成后计时，**尚未实测整路线，不作承诺**。排队、下载、执行、并行和返工分别记录，不累加重叠时间。`release-checks.json` 保存编译/相关检查/runtime 阶段状态与秒数；`events.json` 保存切换、就绪、完成和回退原因。

按照本轮用户的最小验证要求，不跑新的全量/业务 CI、不做整应用路线计时；追加部署仅安装工具/适配入口，不切换未修改的业务组件；验证结果与未完成限制见 [validation-20261009.md](validation-20261009.md)，历史根因见 [audit-20261009.md](audit-20261009.md)。冷构建、artifact 下载、证据时效、旧入口适配仍是预算阻塞项，不以无关验证弥补。

旧 `release-verify-local.sh`、`release-candidate-checklist-v1.md` 和 `docs/ci-runner-policy.md` 的 exact-run-only 应用发布要求，以本规则正式生效后的 A/B 路线为入口；其数据、安全、科学和恢复约束仍有效。`training-completion.py` 为固定 PR248 的历史特例，不作为新产物复用入口。
