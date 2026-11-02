# SJT onboarding Git读取容量修复

当前原生CLI在审阅contentAt及历史基线核对时，使用同一个`git` helper。默认execFileSync缓冲约1MiB；TOSA 0.4.2的真实instrument.json为3,099,475字节，故读取失败ENOBUFS。这会阻断PUBLISHED审阅或该文件进入基线后的不可变检查，首次DRAFT检查成功不覆盖此处。

修复只给既有helper增加`maxBuffer: 8 * 1024 * 1024`。未找到适合直接导入的统一导出helper：`.github/scripts/content-scope.mjs`的私有gitContent已经采用8MiB；`server-version/scripts/release/policy.mjs`的私有Git helper采用32MiB。这里沿用更小的既有8MiB预算，不耦合整个CI分类模块，不新增helper、门禁、哈希资格、schema或评分引擎。

8MiB约为当前真实3.1MB文件的2.7倍，能够读取现有内容并保留有限增长空间；不是无限缓冲，也不声明支持任意大小题库。读不到完整内容仍应失败；不捕获溢出后继续解析截断数据。授权和审阅判定、Git参数列表、cwd、编码及异常传播均保持原状。

## 必要定向验证

Node24.21.0，基线adad907a4b68606ce71bb1a4f2d7c511c872c715。以TypeScript AST提取修改前/后CLI真实git变量的initializer并转译，调用真实git读取；没有复制一个另写的helper作为测试替身。

| 输入 | 结果 |
| --- | --- |
| #537 commit 46ff029d9cca20b221208e85257b5fa482eaefa3，3,099,475字节真实TOSA内容 | 旧helper ENOBUFS；新helper完整读取，与原文件字节一致且JSON身份匹配 |
| main已有sjt-anxiety-golden/1.0.0/publication.json，233字节 | 新旧输出逐字节一致 |
| 隔离临时Git blob，8MiB−1字节 | 完整读取、无截断 |
| 隔离临时Git blob，8MiB+64KiB字节 | 仍报ENOBUFS，不伪造成功 |

[脱敏结果](../evidence/sjt-onboarding-git-buffer/verification.json)仅为这次定向检查证据，不是新的CI资格协议。临时边界仓库已删除。未重跑完整内容、评分、浏览器、后端编译或数据库测试，未执行真实GitHub批准或生产管理员操作。

## 当前审阅规则，非历史说明

`src/modules/situational/onboarding/review-authority.ts` 的 `verifyGitHubPublicationReview`仍由`src/scripts/situational-onboarding-check.ts --verify-reviews`调用；`.github/workflows/situational-publication.yml`和内容作业仍启用。新PUBLISHED来源需真实github-review；migration仅允许已登记历史迁移，TOSA不是其成员。

对#537，审阅者必须是GitHub真实`User`、与PR作者`caohuibj`不同，且拥有此仓库write/maintain/admin权限。审阅必须APPROVED；该审阅者之后最后一次非COMMENTED状态仍须APPROVED，不能被撤销或替代。审阅commit中的原生内容摘要必须等于publication.json绑定摘要及当前内容摘要。检查不要求“专家”职称；也不把PILOT升级为已校准。尚未指派或取得任何真实批准，本修复不代填review URL。

这是**代码层仍有效的内容发布要求**。管理员网页发布权限是另一层；SYSTEM_ADMIN或用户一般发布授权不能冒充GitHub独立review。PILOT且没有scientific.review不要求虚构科学升级审查。

## 最短可执行入库流程

1. 项目维护者审阅并合入此最小工具修复；按同输入证据复用规则完成必需资格，不重跑已通过的完整题库。与内容PR #537分开，不覆盖其冻结题包。
2. 与caohuibj不同、有仓库写权限的人类在#537审阅实际内容并提交APPROVED。维护者将#537的publication.json改为PUBLISHED，填入该真实review URL和既有contentDigest；保留scientific.json的PILOT。执行现有审阅完整性检查后合并/发布安装版本。不得编造批准或改用migration绕过。
3. 实际SYSTEM_ADMIN进入系统管理页`/admin/permissions` → **精确内容授权**；右侧**操作验证**完成双因素验证（有效5分钟）。展开**已安装 SJT 发布准备**，填`tosa-teacher-wd-full` / `0.4.2`，点击**准备精确 SJT 来源**。点击**将此来源填入根授权表单**，给当前发布管理员按精确mapping签发有限期measurement.publish授权并填写原因；使用刚签发授权，填写真实locale/territory，再点**确认发布 SJT 测量版本**。服务器复核真实身份、会话、授权和版本，不需另写SQL或获取服务器凭据。
4. 同一生产目标回读返回的measurementReleaseId/contentHash，并由对应入口管理员按已有Teacher或Survey工具来源/分发流程授予适用范围、发布试用工具，核对PILOT、三版本、教师适用标签及一条授权短流程。测量发布不自动授予所有用户或四入口权限。Training学员组合、School学生SELF不适用此教师自报工具。

API等价入口：`POST /api/admin/permissions/static-sjt/prepare`、`POST /api/admin/permissions/content-grants`、`POST /api/admin/permissions/static-sjt/publish`。生产执行仍由协调主线负责；本修复分支不合并、不部署、不生产入库。

## PR激活范围待协调

当前完整三文件差异被原生分类器判为platform：content/backend_modules/frontend/maintenance/release-tooling均false；脚本路径为outside-scoped-allowlists。向main创建Draft PR会选中`PR light / backend compile`（包含npm run build和situational:contracts）、`PR light / frontend lint + typecheck`，并触发独立publication workflow。它不是本修复要求的定向验证路线。

因此先保留已验证独立分支及审阅说明，PR激活待协调者明确处理现有CI范围与“不重复全套内容验证”的约束冲突。没有用skip-ci、改文件名、借其他分支身份、修改路由或伪造绿灯绕过。此状态不等于修复已经合格合并或进入生产。


## 定向CI路由补充（继续保留上面的历史pending记录）

现复用已有release-tooling路线：仅将此开发CLI、新增Node回归测试和原有publication工作流列入精确工具路径；local-validation现有recipe按变化文件选择Git容量与路由测试。publication工作流用同一完整差异的toolingOnly判定，将纯工具检查交给release-tools；题包、publication/scientific元数据、独立审阅实现、运行时、依赖、schema或不安全文件模式混入时均拒绝工具路线，仍走原有实际检查。没有新的PR号、分支名或hash资格。

新增Node测试执行真实CLI helper的类型擦除后表达式，覆盖小文件、大UTF-8、8MiB以下和超限失败；原真实3.1MB候选结果保持复用。配套正负路由/recipe测试确认没有选择应用编译、Prisma、Vitest全库或完整内容校验。此处TypeScript类型擦除是Node24.21原生能力，不添加依赖或运行引擎。未变更任何GitHub人类审批要求。

Draft现有合格项为scope+release-tools；转Ready时现有merge gate仍强制codeql，既有release-tooling CodeQL paths包含backend/src/scripts及本次共享工具。Draft未执行SAST不得写成已经通过；无需扩大为应用编译或增设新门禁。

与#538协调：本分支基于main adad907a，不修改maintenance-repair-scope.mjs、maintenance-repair.test.mjs或ci.yml；未引入其未合入代码。读取#538的c6c415436ed3ff6f3de2cdf320b7c160cc4fd489快照时未发现文件交集。若其随后改动local-validation等共享文件，合入时应保留各自recipe增量，不能以整文件覆盖另一分支；当前修复不依赖#538业务改动。

## 首轮CI失败与定向修正

保留CI run 41368151605 / job 125032745405 / head 8d42d65dfb580fd2a22803607b2e1497823b1c76 的失败结果：83项工具合约中82通过，`consumed code or configuration change fails without automatic retest`失败；后续Git容量命令未执行。无应用编译或全库内容检查。

原因已本地复现：CI导出的HUI_EVIDENCE_BRANCH继承进临时fixture子进程，导致其“同分支输入变化”用例走到“另一分支无证据”分支，尝试执行临时仓库中不存在的真实工具测试。只在两个fixture子进程显式设HUI_EVIDENCE_BRANCH=payload.branch；不修改生产fromEnvironment、签名、输入绑定或拒绝规则。在模拟CI分支环境下定向复验4项通过：同分支成功复用、同分支输入变化拒绝、不同分支旧证据不冒认、完全相同输入跨分支可复用。

原始失败不会标成成功。Notion指定历史错误页当前连接此前404，回写pending；上述脱敏记录可供协调者后补。新提交保持同一8文件范围，仅复验受影响工具路线。
