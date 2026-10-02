# 家长关联与孩子报告授权设计（用户已确认）

基线：main@1ff0e8ef，2026-10-02（日本时间）。范围：本轮新增。以下为用户批准的设计；当前落地范围和验证限制见 parent-implementation.md。

## 已有事实

- schema 已有 ParentStudentRelationship（PENDING / ACTIVE / REVOKED，approvedAt、revokedAt、consentVersion/hash）和一次性、限时、hash 存储的 ParentInviteCode；复用这些模型，不再创建第二套家长关系。
- assessment-identity/identity.ts 已有邀请与关系纯逻辑，但未发现已挂载的完整家长绑定产品 API。现有关系主要由组织投放和测评上下文读取。
- hasCurrentParentOrganizationEvidence 要求当前有效且批准的关系、孩子当前组织 membership、ACTIVE organization。全局关系不能代替组织权限。
- hasHistoricalParentArtifactEvidence 是特定历史 artifact 的证据；不能用它扩大为孩子所有报告访问。
- individualAuthorization.ts 当前授权教师/咨询师/专业人员，不含家长；不能把家长伪装成 SUBJECT/TEACHER。
- assessment-policy/disclosure.ts 当前没有独立 PARENT audience。旧 completion-only、cohort-only 与研究投影必须保持边界。

## 建议批准的产品规则

1. **绑定流程**：学生在已获准课程内生成短时一次性邀请码 → 已登录家长提交 → 关系 PENDING → 学生确认关联与同意版本后 ACTIVE。重用现有 identity 函数及校验。邀请码不是孩子 ID；不得按姓名/电话/班级批量匹配。组织工作人员帮助关联须已有专门关系管理 capability、被授权的孩子范围及审计；SYSTEM_ADMIN 或 legacy ADMIN 不自动取得查看报告权限。
2. **关联仅开放最少的孩子名录/概况**：ACTIVE + approvedAt + 当前双方账号可用。返回关系 ID、孩子显示名、当前可见课程/活动摘要，不返回身份证、联系方式、其他家长或答题内容。仅在组织资格验证通过的范围显示组织数据。
3. **报告另行授权**：关联和“家长可看此报告”是两个不同许可。需要报告所属产品明确允许 PARENT audience、当前有效的 ParentReportDisclosureGrant、对应同意版本、同一 subject/organization、无显式 deny 且组织 ACTIVE。缺少任一条件不可发现、不可读取。允许模式仅 NONE / COMPLETION_ONLY / EDUCATIONAL_SUMMARY / 明确获批的家长摘要。默认 rawAnswers=false、itemLevel=false、researchExport=false。
4. **授权谁批准**：孩子确认关联并同意后，报告所属组织的报告披露负责人（新增窄 capability PARENT_REPORT_DISCLOSURE，不能由 ORG_ADMIN 隐含继承）可对已有冻结 artifact 创建精确 grant。学生个人自助报告由学生明确授权；没有可验证 consent 时拒绝。法定监护人例外需要独立规则，本轮不自动补造身份或同意。
5. **精确 artifact grant**：建议新增 ParentReportDisclosureGrant，包含 relationshipId、studentUserId、parentUserId、organizationId（自助可空）、sourceArtifactId/type、sourcePolicyKey/version/hash、projectionMode、consentVersion/hash、validFrom/until、approvedBy、revokedBy/At/reason、commandKey。有效时间以服务器判断。先 dry-run schema migration；独立 PR 审查。不授予“所有历史/未来报告”。
6. **服务器投影**：报告读取复用 canonical 冻结结果，生成/选择后端家长投影；不重算分数、不改原报告语义、不直接返回教师或研究报告。产品未提供家长解释时仅展示允许的完成状态，不能由客户端编文案。
7. **解绑与撤销**：学生/家长可以解除自身关系；有范围权限的工作人员可因验证失败撤销。解绑、grant 撤销、孩子离开组织、账号冻结、显式 deny 后即时停止新的孩子摘要及报告读取；保留原关系、grant、audit 与 artifact 历史。家长作为 respondent 的本人已完成结果仍走原本人授权，不能被孩子档案入口混淆。既有历史 reader 的独立权限不在此设计中自动删除。
8. **多家长/多孩子**：逐关系、逐 artifact 授权；A 家长看不到 B 家长的信息/原始作答。客户端 child switcher 只是选择可见 subject，每次 API 重算权限。后台重授权或账号切换后清除相关内存 cache；报告默认不落普通本地存储。

## 已批准的 API 设计

| API | 作用 | 服务端必备边界 |
|---|---|---|
| POST /parent-links/invitations | 学生生成邀请 | self + 已获准课程；一次性 hash/TTL/限流 |
| POST /parent-links/claims | 家长认领 | 当前 PARENT；原子 consume；响应不能泄露未确认孩子档案 |
| POST /parent-links/:id/approve | 学生确认 | 原关系 subject + consent 版本；幂等 commandKey |
| POST /parent-links/:id/revoke | 解绑 | 自身关系主体或窄工作人员 scope；不可物理删除 |
| GET /parents/me/children | 孩子切换列表 | 当前登录身份 + ACTIVE approved links；分页；最小字段 |
| GET /parents/me/children/:childId/overview | 孩子概况 | 精确关系 + 当前组织证据；不复用 staff endpoint |
| GET /parents/me/children/:childId/reports | 可见报告列表 | 精确 grant + artifact policy + consent + denies；列表和详情共用授权函数 |
| GET /parents/me/children/:childId/reports/:artifactId | canonical 家长投影 | 上述全部条件；跨孩子/组织/家长统一不可发现 404 |

主体 parentUserId 一律从 session 取；childId、relationshipId、artifactId 均是不可信选择参数。mutation CSRF + 限流 + audit；read Cache-Control:no-store，日志不记邀请码/答案/报告正文。发现权限只决定入口，resource authorization 才决定实际读取。

## 必须通过的验证

- pending/unapproved/revoked/expired links；旧链接 reactivation 不恢复旧 grant。
- 未授权的 childId、artifactId、另一家长、跨组织、组织暂停、离校、显式 deny、账号冻结。
- 关联有但无报告 grant；grant 有但 audience policy 无；家长不得获取 rawAnswers、itemLevel、researchExport、他人数据。
- 双并发 consume、approve/revoke 与 read 竞争、grant revoke、令牌失效、cache 失效。
- 原冻结报告 hash/原分数/原反馈不变；家长投影由后端生成；Web 与小程序共用接口。
- 绑定和披露审计可追溯；对历史读取规则执行独立回归。

## 确认记录

用户于本对话明确确认：“同意按该设计实施”。学生确认关联、逐 artifact 披露授权及解绑撤销规则已获得实施授权。

原暂停点已解除；按此设计实施，不再重复请求相同授权。新增家长受众的科学解释必须来自正式 canonical report package；技术开关和关系本身不能代替内容发布或报告披露许可。
