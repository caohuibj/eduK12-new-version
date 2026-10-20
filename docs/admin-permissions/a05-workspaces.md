# A05 管理窗口与身份匹配

本单元属于管理员权限 PR。系统治理、入口管理与业务身份分别保存；系统管理员必须另获显式入口 grant，才能进入该入口的业务管理页。管理前端读取 `/auth/me` 的当前投影，后端继续独立执行授权、资源范围、会话版本和强认证检查。

## 身份 → 入口与页面

| 合成身份 | 管理入口及独立页面 | 可见内容与操作 | 明确不具备的管理入口 |
|---|---|---|---|
| SYSTEM_ADMIN，业务 STUDENT，无入口 grant | `/admin/permissions` | 四入口授予/撤销、原因、当前版本、授权审计；系统治理 | Training、Survey、School、Teacher 全部拒绝 |
| TRAINING-only，业务 STUDENT | `/admin/training`、培训账号审核与注册码 | 培训账号审核、培训课程监管、适用测评资源授权；原业务身份仍为 STUDENT | 系统治理、Survey、School、Teacher |
| SURVEY-only，业务 TEACHER | `/admin/survey-researchers` | 研究者资格、一次性邀请、精确工具版本授权 | 系统治理、Training 管理、School、Teacher |
| HUISCHOOL-only，业务 STUDENT | `/admin/huischool` | 校园心理健康产品状态、版本、开通/暂停、首次 School 专门管理员字段 | Teacher 产品状态、Teacher 学校管理员名单及操作，以及其他三个管理窗口 |
| HUITEACHER-only，业务 TEACHER | `/admin/huiteacher` | 教师发展产品状态、版本、开通/暂停、Teacher 学校产品管理员名单与授予/撤销 | School 产品状态及首次 School 管理员字段，以及其他三个管理窗口 |
| SURVEY+TRAINING，业务 TEACHER | Training 与 Survey 两个窗口，可切换 | 各窗口显示自身操作；权限和数据范围分别核验 | 系统治理、School、Teacher |
| 无 grant 的旧 ADMIN | `/admin/entrances` 的无授权状态 | 无管理操作、安全密钥按钮；兼容业务投影为 STUDENT | 所有管理窗口 |
| 无 grant 的普通 TEACHER | `/admin/entrances` 的无授权状态；独立培训师业务工作台 | 本人拥有的课程等原业务权限 | 所有管理窗口 |
| 已撤销 TRAINING，业务 STUDENT | 旧会话失效；新登录显示无授权状态 | 无 Training 入口、管理内容或操作 | 刷新、深链、另一标签 focus、重新登录均不能恢复已撤销资格 |

管理窗口使用专门导航，只列当前治理/入口资格；业务工作台在独立账户分组中明确标注。页头和入口页同时显示管理资格与真实业务身份。Training 的兼容 ADMIN 投影用于既有管理 API，不把数据库中的 STUDENT/TEACHER 改写为 ADMIN 或 SYSTEM_ADMIN。带管理资格的普通登录不会静默进入教师/学员管理菜单，而是提示使用独立管理员入口完成密码与安全密钥认证。无管理资格的普通业务登录保持原规则。

## 操作 → 接口 → 资源范围

| 窗口/操作 | 后端接口族 | 资源边界与额外条件 |
|---|---|---|
| 系统授权、撤销与审计 | `/api/admin/permissions/**` | 当前 SYSTEM_ADMIN、最近安全密钥验证、授权版本 CAS、原因；不取得研究/学校答卷权限 |
| 培训账号审核、普通账号创建 | `/api/users/**`、`/api/teacher-codes/**` | 显式 TRAINING；账号只限 LEGACY/TRAINING，不能读取 SCHOOL 账号或创建最高管理员；凭据恢复、账号生命周期仍按各自系统治理合同 |
| 培训课程、分析及导出 | `/api/courses/**`、Training 来源服务、原导出 worker/下载 | 培训与历史课程范围；Campus 活动拒绝。普通教师仅本人课程，分享不授予学生名单或原始分析访问权。当前有效 TRAINING grant 才有兼容 ADMIN 分支；任务绑定权限版本 |
| Survey 邀请、资格及工具管理 | `/api/platform/survey/**` | SURVEY grant、敏感操作最近密钥验证和当前密码；不能凭入口 grant 使用 `/api/survey/projects` 的研究者会话或读取项目原始答案 |
| School 产品开通/暂停 | `/api/platform/education/organizations/:id/products/HUISCHOOL` | HUISCHOOL grant、学校/产品状态、版本、当前密码和最近密钥验证；不取得组织成员或个人报告资格 |
| Teacher 产品及学校管理员 | `.../products/HUITEACHER`、`.../teacher-admins/**` | HUITEACHER grant、学校成员及 Teacher 产品条件；School grant 不能代用 |
| Teacher 工具许可 | `.../teacher-scale-licenses/**`、`.../personal-scale-grants/**` | HUITEACHER grant；继续独立检查正式资源发布和组织/个人来源条件，未发布资源仍拒绝 |
| 学校/Teacher 个人业务、组织报告 | `/api/campus/**`、`/api/huiteacher/**`、组织报告接口 | 对应产品 Cookie/MFA、组织成员、能力、显式 deny、报告披露范围。入口管理授权不产生这些身份 |

系统治理与多入口导航已在前序提交接入。本次专门补齐：管理/业务导航分开；School/Teacher 独立 URL、标题、字段、名单和操作内容；修正旧 SYSTEM_ADMIN 及宽泛 Training 提示；返回业务身份字段；普通登录的管理身份指引；资料更新不能写入入口授权；复用现成浏览器脚本集中验证身份矩阵。

## 验证证据

执行 `server-version/e2e/admin-permissions-browser.cjs` 的 `ADMIN_PERMISSIONS_BROWSER_PHASE=workspaces`；只允许 loopback、私有合成夹具和 Chromium 虚拟 CTAP2。报告与截图留在仓库外私有目录，且不截图一次性邀请链接。该脚本覆盖入口和内容差异、五类管理 API、独立资源范围、真实 Survey 邀请、School/Teacher 产品变更与跨产品拒绝、普通登录指引、系统治理 UI 撤权、另一标签 focus、刷新、深链、新登录。

本轮真实结果将在执行完成后追加。此前已通过的开发证据见 [验证记录](verification-20261020.md)，不得将“已实现”“静态核实”与“实际通过”混用。本文件及本地记录不构成官方 CI 或物理安全密钥验收。

仍需用户指定时机验证：Mac 原生 Safari、真实 FIDO2 安全密钥 PIN/触摸/取消/拔插、备用密钥和丢失恢复体验；本轮不切换 Mac、不注册真实密钥、不部署生产。
