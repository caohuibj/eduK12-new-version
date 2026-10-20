# 管理权限重构（A01–A07）

初始基线：`167478dda6d30df212cb141494c75dd106f04d45`；已整合 Training 后的 main `c3f9a7e77447c706f4a83a93c7429a7bcb164e94`。工作分支：`admin-permissions/a01-a07-20261020`。
本工作区只使用 `eduk12_admin_permissions_20261020` 隔离数据库及合成账号。生产账号盘点、真实安全密钥注册、生产配置、部署均未授权执行。

## A01 权限矩阵与现有身份

身份分为三层，不能互相推导：

| 账号/授权 | 入口 | 操作 | 资源范围 |
|---|---|---|---|
| `platformRole=SYSTEM_ADMIN` + 安全密钥会话 | 系统治理 | 创建受控管理账号、授予/撤销入口管理权、查询授权审计、平台账号生命周期 | 系统元数据；不自动取得业务数据权限 |
| 当前 `AdminEntryGrant(TRAINING)` | Training 管理 | 课程、账号审核、教学素材及工具配置 | Training 资源；既有课程/科学发布/披露限制继续生效 |
| 当前 `AdminEntryGrant(SURVEY)` | Survey 管理 | 研究者邀请/暂停/撤销/恢复、来源目录和工具授权 | 研究者治理元数据；不能浏览研究项目原始数据 |
| 当前 `AdminEntryGrant(HUISCHOOL/HUITEACHER)` | 对应入口的平台管理 | 对应产品治理 | 仅该产品，学校成员及角色变更仍受组织授权约束 |
| 教师、学员、家长 | Training 业务入口 | 既有教学、作答、家庭参与 | 所属课程、本人及已授权关系 |
| Survey 研究者授权 + Survey MFA | Survey 研究入口 | 编排、收集、分析、导出 | 自己的项目及当前工具授权 |
| 学校成员/产品管理员授权 + School/Teacher MFA | School/Teacher 业务入口 | 现有学校及测评管理 | 组织、成员、产品授权、显式 deny |
| 旧 `role=ADMIN`，无显式入口授权 | 无管理入口 | 仅无特权业务身份 | 不回填为系统或入口管理员 |
| 多个入口授权 | 明确获授的各入口 | 分别授权 | 不从任何入口向其他入口传播 |

管理接口归属采用最具体前缀优先：

| 接口族 | 权限归属/额外边界 |
|---|---|
| `/api/admin/permissions` | 系统治理；当前系统身份 + 最近安全密钥验证；授权版本 CAS |
| `/api/admin/security` | 管理员强认证；公开部分只能消耗受控登记票据或密码预认证，不能签发普通会话 |
| `/api/platform/survey/**` | SURVEY 入口管理；保留目录来源合法性、研究者状态及密码再验证 |
| `/api/platform/education/**` | 对应 HUISCHOOL/HUITEACHER 平台治理；涉及两个产品的发现只投影获授入口 |
| `/api/platform-users/**`、`/api/parent-accounts/**`、`/api/parent-tool-policies/**` | 系统治理；保留家庭关系和披露限制 |
| `/api/users/**`、`/api/teacher-codes/**`、`/api/admin/training/**` | TRAINING 入口；个人资料/改密仍为本人操作 |
| `/api/admin/material-grants/**`、`/api/admin/instrument-authorizations/**`、`/api/admin/legacy-archive/**` | TRAINING 入口；归档另需系统治理资格，工具授权不代替科学发布权限 |
| `/api/organizations/reporting-specs/**`、`/api/organizations/measurement-resources/**`、组织创建/暂停/恢复/系统 deny | 系统治理；原组织可用性、显式 deny 和最后管理员保护继续生效 |
| `/api/organizations/:id/**`、组织邀请、`/api/campus/**`、`/api/huiteacher/**` | 原组织/产品/能力与资源范围，不从全局入口管理授权推导组织成员资格 |
| 教学课程、作业、问卷、量表、SJT、认知、综合测评、素材、课堂等路由中的管理员分支 | TRAINING 管理；普通教师仍必须满足原资源所有权或成员条件 |
| `/api/survey/projects/**` | Survey 研究者身份；不接纳入口管理员会话 |
| 导出登记、worker 生成/发布、状态与下载 | 按来源入口及当前身份重新判断；撤权后不能靠旧任务或文件继续取得管理数据 |
| `/api/public/**`、公开参与与学校/研究者登录/登记 | 无管理权；严格参数校验，不能传入平台角色/入口授权升级 |

复用：保留 `User.platformRole`、`User.tokenVersion`、组织成员/能力/deny、`EducationProductRoleGrant`、`SurveyResearcherGrant` 及既有产品 MFA。后两者分别绑定学校成员和研究身份，不适合作为跨入口平台管理授权，因此增量增加全局入口管理表和独立审计。旧结构不删除。

旧账号盘点工具只输出按身份/入口授权组合分组的数量，不输出用户名、密码、密钥或 Cookie。未读取生产账号。发现旧种子和导入程序具有 ADMIN→SYSTEM_ADMIN 映射，本轮封闭其自动升级路径。既有系统角色保留，必须完成受控强认证才能继续治理；不以迁移自动注册凭据。

## 验证及发布边界

本次为身份、授权、会话、数据库和相关前端的 C 类变更。开发阶段执行受影响隔离验证，约每 5 分钟报告具体阻塞；同输入已通过项不整套重复。正式 CI 仅在完整候选和独立 review 后协调；目前应用本地证据尚无正式接纳路径，不能自称官方 CI 成功。

备份前已核对全部工作流：push 仅触发 main 和 `fix/shared-assessment-foundation-20261017`；本工作分支无 PR，普通 push 不触发 CI。不修改规则集或保护规则。

### 2026-10-20 开发恢复点（不是最终验收）

A01/A02 原固定提交为 `88c8d830fb29ec385f7b8da0c79d751fc392e890`，真实 PG 的 6 项基础服务测试通过。父对话独审发现旧导入器跨版本重跑的 platformRole 比对问题；新建仍为 STANDARD，已映射且 update 为空的账号重跑保留当前授权，不覆盖或重新提权。新增跨版本 dry-run/apply/verify、缺映射和其他字段冲突测试；本阶段与原导入单测共 17 项通过。其后进一步收紧授权服务为可信强认证会话 + 事务内当前系统身份，受影响基础授权测试须在最终输入上更新并复验。

A03/A04/A05 正在开发：受控后台登记票据、安全密钥登录与再认证、四入口后端检查、Socket、导出版本绑定、治理及入口界面已接入。真实密码和私钥只存在仓库外的合成夹具与临时浏览器；未上传。

WebAuthn 的 13 项真实签名/PG 契约通过：RP/origin、UV、备份标志、challenge/ticket 过期、单次消费竞争、账号归属、权限版本变化及会话绑定。使用自行生成的合成 P-256 私钥，不是物理硬件验收。Chromium 虚拟 CTAP2 浏览器已运行，首轮在菜单/深链阶段超时，仍待定位；不报告整轮浏览器通过。前后端类型检查阶段通过，后续变化按实际输入复核。

收到环境断开通知后，实际命令仍可访问本目录与未提交草稿；3100/ready 返回数据库、Redis 和 Socket 就绪。为优先保护恢复点保留开发 commit；此恢复点仍不可创建正式 PR 或合并。

历史 `20260919000100_platform_role` 迁移按原校验值保留，不修改已应用 SQL，也不无差别降权。旧版本升级中的 ADMIN→SYSTEM_ADMIN 历史映射必须列入人工盘点；当前系统身份没有受控安全密钥不能取得管理会话。安全回退不能使用缺少新授权/强认证检查的旧二进制；只允许保留本次安全边界与增量状态的兼容代码回退，具体回退演练尚待 A06。

Training PR #316 已由父对话先合入 main。本分支正常 merge 最新 main，合并提交为 `b123be160142346447c2b6a86f87b3390ba9be00`，没有文本冲突。整合检查发现新增分析、采集轮次及冻结策略仍读取旧业务 ADMIN，正在接入显式 TRAINING 资格并补事务/任务版本测试；保留完整 authority context、延迟统计、不可变事实复用及 artifact 单次读取。不得使用 Training 的一次性 CI 路由接纳本分支。

第二次断开通知后，实际 shell、Git、源码及 `/ready` 仍可访问；180 项迁移已在独立数据库应用。本次保存的是整合开发恢复点，新增真实 PG 测试暴露了夹具的课程发布/投放不完整和待定位的导出断言，尚未全部通过；A05 八类身份界面矩阵与单独验收 commit 仍在继续，不可据此创建正式 PR 或合并。

后续整合修复 `e99d8609` 已完成上述 Training 应用/数据库授权修正及实际复测；181 项迁移演练通过。A05 独立界面匹配提交为 `8d66540e`，固定本地测试构建的 204 项浏览器检查通过。当前状态、逐身份内容/API/资源范围矩阵及开发模式资源耗尽诊断见 [A05 管理窗口](a05-workspaces.md) 和 [验证记录](verification-20261020.md)。当前不具备独立最终 review、官方 CI、Mac/真实密钥验收或生产部署资格。
