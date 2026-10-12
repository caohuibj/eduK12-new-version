# Huiteacher｜PR3 代码收口与 PR4 开工记录（2026-10-12）

**仓库：** `caohuibj/eduK12-new-version`  
**唯一开发分支：** `feat/huiteacher-pr1-education-identity`  
**记录对应代码：** `2d0051d61b8b0fb162cd09b0062030b8492e8506`  
**主干核对：** `main@935a6d5cd7d0acfe1b4b84b5c247cf6d3da6586c`；目前 feature ahead 95、behind 38，不能默认历史 main 仍然最新。  
**规范依据：** [Huiteacher 上线开发实施与验收规范 v1.2](https://app.notion.com/p/3f6d27635a38818d9bbddaf9ec8a48fa)。

> **状态：已提交代码，不等于已验证或可上线。** 按用户授权，本阶段只有 GitHub 分支 Commit/Push；不创建正式 Huiteacher PR、不主动触发 CI、不合并、不修改生产。2026-10-12 核对本分支 Actions 记录为 0。所有测试文件只是提交，**未执行，也没有正式通过证据**。

## PR3｜已实现的主要功能（待正式审查）

| 能力 | 已落地的实现 | 仍需正式验收 |
| --- | --- | --- |
| 学校安排的教师 Scale 自评 | 已发布成年 SELF Pilot Scale 独立审核、学校产品级材料许可、标准 Composite/Assessment Run、正式 FINAL、本人描述性计分报告；管理者无本人敏感结果的默认读取权 | 真实资源版权与科学内容审查、Score/Final/Respondent disclosure 运行测试 |
| 个人自主测评（无需学校开通 Teacher） | 精确 `user_id+resource_id` 的平台许可、统一教育账号、独立标准 `assessments` 冻结版本、既有 Scale FINAL 及评分投射；未创建“个人学校”或新 Scorer | `20261012000900` DB 迁移、Standalone V1/V2 Admission、重复 FINAL、撤销授权、前端单人交互 |
| 学校组织调查 | Huiteacher Form V2 → 标准 Run → START → 加密 FINAL；管理端查看无原始答案的描述性群体报告 | Form/Run/FINAL 的实际隔离集成、移动端、跨产品授权 |
| 群体隐私 | 固定整群体全部 FINAL，N≥10，含补集保护的小单元抑制，文本不披露；同学校、同 Form definition digest 的重复发布只接受同一冻结参与者摘要 | `20261012001000` 迁移；跨轮人口集、样本弃答、小队伍/多选差分对抗用例；不同工具定义的跨版本比较不得默认公布 |

PR3 相关测试已新增到 `huiteacherPersonalScale.postgres.integration.test.ts`、`huiteacherFormRuntime.postgres.integration.test.ts`；**未运行**。个人正式科学报告必须使用实际合法授权工具，Pilot 描述性结果**不能**冒充常模、临床诊断或教师绩效。PR3 的代码功能主要完成，但不能宣称正式质量门禁通过。

## PR4｜已启动，不代表 PR4 已完成

| 范围 | 当前提交内容 | 尚欠缺 |
| --- | --- | --- |
| 现场观察权限 | `huiteacher_observer_grants`，按活动+账号+角色+有效期 INVITED→ACCEPTED→REVOKED，不给外部专家默认 School 组织成员或心理业务身份 | 既有教育账号以外的专家邀请注册，以及完整跨校项目授权周期 |
| 加密记录 | `huiteacher_observation_records`，FACT／FORMAL_FEEDBACK／PRIVATE_REFLECTION；正文统一加密；草稿修订版本；正式提交后 DB trigger 防止修改、删除；作者独立查看 | 正式观察 Form 执行与纯文本证据之间的正式引用关系、附件管理和现场恢复 |
| 隐私披露 | 管理者只可经 Huiteacher 产品管理权限+近期 MFA 读取已提交正式观察；私人反思只向作者提供；邀请名单不附带反馈原文 | 更多有约束的报告受众、项目授权审计及协商共识 |
| 前端 | Manager 邀请/撤销/正式反馈；外部专家/同行邀请领取、本人草稿、正式提交、私人反思 | 实际浏览器/390-768-1440 响应式验收，观察任务复杂状态 |
| 相关测试 | `huiteacherFieldObservation.postgres.integration.test.ts` 定向场景（外部专家无学校 Membership、独立记录、隐私、撤销、不可篡改） | 代码仅提交，**未执行** |

**已发现且仍未解决的 PR4 阻塞**：目前 `transitionHuiteacherEvent` 的 OPEN 条件要求标准 Run 草稿及至少一个 Track，因此**没有 Form/Run 的纯现场观察活动无法仅凭已接受的专家邀请开放**。试图修复该条件的 GitHub 写入工具请求被拦截，`main` 和本 feature 尚未收到该修复；不得把该流程写为已打通。后续 PR4 应先设计并审查：课堂／会议／教研／访校的纯文字现场活动在合法受邀者接受且活动产品开通有效时可 OPEN，普通 `ASSESSMENT` 任务仍严格需要 Run/Track，不允许借此穿透 School 心理或其他产品。原有已创建的空 Run 仍不得随意开放。

**PR4 尚待实现：** 多人独立评价证据绑定；真正的审议共识记录及审计；专家私人反思/正式反馈授权确认、移动端场景、完整项目级权限和时间序列，均不得误报为已完成。保留 `MULTI_INFORMANT_SYNTHESIS` 目前 reserved/unimplemented，不用平均数冒充共识。

## 受影响最小验证清单（尚未执行）

| 本次代码范围 | 检查发现的故障 | 唯一主要执行位置 | 同输入可复用正式证据 | 预算 |
| --- | --- | --- | --- | --- |
| PR3 个人 Scale Migration + FINAL | 错误授权、Prisma/DDL、未冻结计分、重放泄露、用户跨产品访问 | GitHub 正式隔离 PostgreSQL／受影响后端 checks | 无 | 冻结最终差异后按实际 job 估算 |
| PR3 群体披露 + ledger | 缺失答案仍出报告、跨期差分、文本/小单元泄露 | GitHub 受影响隐私集成 | 无 | 同上 |
| PR4 observer/notes Migration + routes | 邀请绕过、提交可篡改、过期后仍可写、私人反思泄露 | GitHub 受影响后端契约、迁移测试 | 无 | 同上 |
| Teacher frontend | 新工作台不能登录/显示、表单无法正式提交、观察与私人日志误公开 | GitHub 受影响前端 typed / browser | 无 | 同上 |
| 生产入口 | 正式域名、证书、同一产物版本、就绪/短流程与回退 | 用户另授权后，仅生产有限就绪和一条受影响流程 | 仅可复用未来同一 digest 正式证据 | 未授权，不执行 |

严格遵循实际仓库 `AGENTS.md` 和 `docs/release/README.md`：每次冻结完整差异后选择可核验正式门禁，避免相同输入跨位置复测；不额外全量。当前 main 已领先该开发分支 38 个提交，**正式 PR 前必须分析并处理主干漂移**，但此刻不擅自 rebase/merge。

**下一项：** 继续 PR4 的“纯现场活动 OPEN”受控修复与专家任务入口审查，再实现可审计的多人独立评价和人类协商共识；随后 PR5、PR6 同一分支继续。学生成绩、完整教务与 SSO 保持排除。
