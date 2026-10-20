# 独立 review 后的两项 P2 修复

基于已整合 main `c3f9a7e77447c706f4a83a93c7429a7bcb164e94` 的管理员分支，修复父对话提供的业务身份重叠与报告治理归属问题。不增加三层内容系统、数据模型或迁移，不修改 CI、保护规则和生产配置。

## 已实现的行为

- 同一账号的系统角色、四入口 grants、真实 `businessRole` 独立。Training 的 ADMIN 兼容投影只服务管理窗口；真实 STUDENT/TEACHER 可进入自己的业务窗口，管理资格继续保留。
- 前端按标签保存非凭据的视图偏好。显式业务深链与“业务工作台”选 BUSINESS，管理窗口选 MANAGEMENT，共用页面和刷新保留当前标签选择。请求头 `X-EduK12-Account-View: BUSINESS` 只选择当前数据库已有业务身份；不能指定角色或绕过 tokenVersion、身份域、账号状态、安全密钥与敏感操作重新认证。
- 原 `requireRole` 与管理守卫语义不变。学员专用操作和 SJT 教师参与改用业务身份守卫，报名内部检查一致；纯历史 ADMIN 不被制造为学员，未批准教师拒绝。教师课程恢复仍检查拥有者、学员成员及受保护管理身份。
- 教师业务分析继续使用现有完整 authority context、课程归属及当前批准状态。业务导出保存 TEACHER 发起身份，worker 以当前真实业务身份复核，不借同账号的 Training 管理资格扩大到其他教师课程；原版本、发布、匿名化和下载检查继续执行。
- `/admin/reporting-content`、菜单及返回地址归 SYSTEM_ADMIN。Training 单入口移除不可用的治理卡片；后端治理资格保持 SYSTEM_ADMIN。
- 系统治理不再依赖 Training `/scales` 列表。新增仅系统管理员可读的 `GET /api/organizations/measurement-resources/candidates?page=1`，每页最多 100 条，只返回已发布自定义描述资源的 `id/name/status/instrumentClass`。不返回定义、答卷或成员，不授予资源使用资格；注册仍执行完整发布、许可、哈希、科学证据及独立 review 政策，未满足条件实际返回 409。

## 实际验证与限制

所有测试使用独立 loopback PostgreSQL、合成账号和仓库外私有数据；未连接生产。以下记录分阶段保留，不把成功的未变化输入重新跑成整套，也不把早期失败改写为通过。

| 检查 | 当前结果与证据 |
|---|---|
| 新增重叠身份真实 PG/HTTP | 7 项通过。学员报名/本人任务、教师本人/他人课程、分析、真实 CSV、课程恢复、SJT 开始/恢复/交卷/历史、纯 ADMIN、未批准教师、无密钥证明、系统候选最小字段及注册准入反例。`p2-final-auth-business.log` 中此文件 7 项全部通过 |
| 原认证单测 | 16 项在上述阶段通过；新增 `teacherApproved` 快照字段使 1 项旧精确对象断言失败，更新该断言后只复验该项通过（`p2-auth-shape-final.log`，其余 16 skipped）。不声称同轮 24 项通过 |
| 受影响后端 | 较早集中阶段来源/导出/Training 整合等 108 项通过；后续权限 HTTP、真实签名合成 ceremony、通用导出与重叠身份 25 项通过。新增候选字段和教师批准反例分别在相关 7 项复验，不重复无变化的其他文件 |
| 受影响前端 | 47 项通过；后续聚焦 accountView/Auth/client/reporting 20 项通过。候选接口调整后 reporting 4 项再次通过；新 accountView 有 7 项独立场景 |
| 当前浏览器业务/治理 | 固定本地测试构建 + 当前源码 API：42 项通过、0 页面异常。真实 Chromium 虚拟 CTAP2 登记/登录，覆盖 STUDENT+TRAINING、TEACHER+TRAINING、纯 ADMIN、SYS-only 报告页面及实际候选 API。`p2-final-browser.log` |
| 当前浏览器身份矩阵 | 198 项、9 组身份通过，0 页面异常；部分登记沿用上一阶段真实 ceremony，未重复计算那 6 项。实际 step-up、授权撤销、focus、刷新、深链和重新登录。`p2-final-matrix.log` |
| 类型、构建及 lint | 后端最终 tsc 通过；前端 app/cognitive 类型、145 路由清单及会话门禁通过，本地 Vite 测试构建通过；lint 0 errors / 150 warnings。构建沿用 NODE_ENV=test，不是生产交付产物 |
| 当前小规模测量 | 30 次 principal 均 1 SQL，P50/P95 0.752/1.830 ms；25 人/8 人列表各 10 次均 3 SQL，P50 6.138/3.886 ms，P95 48.632/4.701 ms。该段 CPU user/system 153.7/46.7 ms，RSS 145.3→150.4 MiB。`p2-measurement-final.log` 绑定当前六项源码输入；单进程开发样本，不是吞吐或性能提升证明 |

最新撤权浏览器样本为撤权 POST 至紧随其后的旧会话拒绝 136.324 ms，包含 UI、两次 HTTP 及提交等待，不是精确 commit→deny 或生产 SLA。无权限 TTL 缓存；普通在途请求已经完成认证的仍可完成，关键写事务及任务最终发布使用原锁与版本栅栏。

原始日志、Cookie、虚拟私钥、一次性票据、截图、导出文件和数据库仅留在 `/workspace/admin-permissions-private`，不上传 GitHub。初始 SJT 合成定义 key 使用下划线被原格式校验拒绝，修正测试夹具为合法连字符后成功；未放宽产品校验。Mac 原生 Safari、真实硬件密钥及丢失恢复体验仍等待用户指定时机；虚拟 CTAP2 不等于物理硬件来源认证。独立 review 收尾与官方 CI 接纳尚未完成，不创建 PR 或触发 CI，等待父对话 GO。

## 供内容主线复用的能力接口

| 接口 | 使用合同 |
|---|---|
| `modules/organization/principal.loadCurrentPrincipal` | 一次当前数据库读取返回真实 businessRole、platformRole、entryGrants/version、tokenVersion、状态/身份域/教师批准；`role` 是现有 Training 管理兼容视图，不可用于推断 SYSTEM_ADMIN |
| `middleware/auth.authenticate` | 先校验当前会话、版本、状态、身份域和必要密钥证明，挂载请求快照。`asBusinessPrincipal` 仅选已有业务身份，不替代认证或资源范围检查 |
| `modules/admin-permissions/guards` | `requireSystemAdmin` 用于系统治理；`requireEntryAdmin(entry)` 检查该次已认证快照的显式入口 grant，不额外重复读库。敏感操作组合 `requireRecentAdminKey` |
| `modules/admin-permissions/service.assertEntryAdmin(tx, userId, entry)` | 写事务内按当前状态持有用户/grant 共享锁，使关键变更与撤权排序；不是来源拥有者、研究资格或组织成员校验的替代品 |
| `changeEntryGrant` | 复用系统治理入口；当前 SYSTEM_ADMIN + 最近密钥证明、版本 CAS、原因、稳定锁顺序、tokenVersion 增长及追加审计。不允许通用用户编辑写入权限 |
| 前端 `AdminAccess` / `hasAdminEntry` | 仅决定可见菜单、深链及失权展示，后端独立执行。不要把 `role=ADMIN` 当成系统治理或其他入口资格 |

内容治理可复用系统能力，入口消费复用对应 entry 能力；资源拥有者、组织/课程成员、研究项目、产品/科学发布与许可仍分别核验。入口授权不会自动产生研究者、答卷读取或跨组织权限；后台任务应保存发起身份和权限版本，生成/发布/下载按当前来源范围复核。候选元数据接口是治理发现接口，不是内容消费授权接口。本分支不增加内容版本 schema、用户体系或另一套登录链。

## 正式 CI 首轮及修复阶段

父对话完成产品与 CI 增量独审后，正式创建 [PR #317](https://github.com/caohuibj/eduK12-new-version/pull/317)，首轮 [CI 39362120199](https://github.com/caohuibj/eduK12-new-version/actions/runs/39362120199) 使用 PR head `5234844f` 的 merge commit `796c4cb1`。实际 scope 是管理员专用 functional-only，Training mode=false；两项指定性能不执行，CodeQL 与其余功能门保留。Situational publication 独立运行成功。

该轮管理员 10 文件实际执行 68 项、零失败/跳过；三增量迁移重放、真实 dump/restore、221 表/181 迁移、受限运行身份及三项审计拒绝通过。backend 作业随后因回退预检在 backend 子目录执行，错误地比较空路径而失败；修复为从仓库根目录执行，没有放松回退安全下限。

首轮完整后端回归是 5866 pass / 52 fail / 81 skip，19 个文件失败，不能宣称整轮通过；其他失败涉及过期 Web 清单、旧导出缺少版本/发起身份、报告候选接口 mock 与跨域上传 mock 请求头。定向修复保留原资源、CSRF、并发与负向断言：显式赋予测试账号所需入口；补全当前 principal、真实 session Cookie 和合成强认证前置；无授权旧 ADMIN 的兼容展示不再被断言为管理资格。改动不向系统或普通管理员自动授予任何生产权限。

原生管理操作的签名会话仅是 `__tests__` 中的业务测试前置，不代表原生密码入口完成了安全密钥认证。原生登录识别 `adminKeyRequired` 后明确提示使用 Web 管理入口并停止认证后 discovery；未登记账号继续被受控登记要求拒绝。新增运行时合同验证该提示及匿名状态，实际 HTTP 反例验证密码不能取得管理会话。原有真实两阶段 WebAuthn/密钥/恢复 ceremony 与浏览器虚拟 CTAP2 门禁继续独立执行，没有用签名夹具替代它们。

受影响 19 个后端文件已分阶段定向通过；其中 11 个 PG 文件 50 项、原生操作 20 项，以及 Socket/Survey/课堂 4 文件 32 项通过，阶段重叠不累加为一次全量。原生 runtime 单文件 48 项通过。没有重跑原先 728 个成功后端文件。本地一次误目录调用使用了非锁定运行器，已停止并隔离缓存，其结果弃用；另一次本地新库时区/Redis 前置不足被原断言拒绝，补齐仅该隔离库的 UTC 和显式独立 Redis 后才复验成功。上述均不等于修复候选的官方 CI 通过。

修复固定到无 PR 的备份引用供父对话增量 review，原 PR head 暂不更新；review 后再启动新候选的官方门禁。原始日志、账号、会话、密钥和数据库仍仅保留在私有目录。Mac Safari、物理安全密钥与生产限制保持前述边界。

## 第二轮官方 CI 的浏览器增量

[CI 39366012858](https://github.com/caohuibj/eduK12-new-version/actions/runs/39366012858) 的 PR head 为 `631f49c3`，实际测试 merge 为 `e823e8d2`。后端功能/迁移/回退、完整后端回归、前端、镜像、CodeQL、运维、媒体及 Chromium/Firefox 验收实际成功；四个浏览器作业失败，merge gate 失败。不能将该轮记为通过。

- WebKit 管理审批页有两个经 DOM 实测的溢出点：长身份挤窄组织选择框；原生文件输入宽 357px 超过卡片的 313px。移动端身份另起一行，文件输入限制在容器宽度。原有四档 WebKit（375/768/1280/1920）审批、反馈和编辑断言均通过，组件原有 6 项通过；没有隐藏页面溢出或删除断言。本环境仅解压私有运行库运行 Linux WebKit，没有安装系统包或切换 Mac。
- foundation 的 PR5 平台账号使用旧密码登录前置，HTTP 503；products 的公开组合测评使用无授权旧 ADMIN，无法进入编制页。两个业务套件改用明确标注的合成签名会话前置：仅测试模式、loopback、专用库或 CI 的 `ptool`、固定合成用户名、显式当前管理资格及当前 tokenVersion；通过真实 `/auth/me` 核实。签名夹具不是强认证证据，真实虚拟 CTAP2 门保持独立必需。入口通过原审计授权服务显式建立，不自动解释旧 ADMIN；PR5 咨询师改为教师业务身份加 Training 授权，并实测管理投影 ADMIN 与独立业务身份，保留精确作答、关系撤销、披露及负向检查。
- 本地 PR5 三组业务及旧课程隔离通过：27 次真实 canonical 完成、5 组最终检查；公开组合测评制作、发布、四类匿名作答及报告通过。合成夹具隔离条件另有 5 项正反检查。业务测试的认证前置调整没有新增生产认证接口或放宽后端权限。
- security 的原始失败日志被现有 EXIT 清理移除，官方日志无法确定根因；不能声称已修复该失败。本地新合成账号在系统 Chromium、CI 锁定 Chromium 两种运行器下，真实虚拟 CTAP2 业务 42 项与入口/撤权 198 项均通过（分开运行，不累计）；锁定版撤权样本约 130ms，非生产 SLA。编译后 API 在 CI 对应的测试开关及必需 Redis 下 readiness 也通过。新增失败摘要仅保留阶段、检查数、错误类型和失败退出码；原始消息、URL、账号、票据、Cookie、密钥仍删除且不上传。模拟失败验证退出码仍为失败、私有数据清理且秘密哨兵不外泄，等待官方候选实测以定位环境差异。

本阶段 CI 范围契约 53 项、43 段 shell 语法及 YAML 通过；完整来源清单增加至 160 项，仅明确列入本次受影响的五个 E2E 文件和两个界面文件。仍只排除原已授权的两个性能执行点；所有功能、认证、权限、迁移、恢复、浏览器及安全门保持必需。没有重复运行上一轮已成功的本地后端全套。本增量先进入无 PR 备份引用供独立 review，未获 GO 前不更新 PR 或启动新官方候选。
