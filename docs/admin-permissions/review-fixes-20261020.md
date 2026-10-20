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
