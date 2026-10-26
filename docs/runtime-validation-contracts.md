# Survey / Training 验证脚本合同与历史报告边界

核对基线：`25215dcc71dd7b4b205ebdef4c92ce9c5785836b`（2026-10-25）。
本说明修正验收脚本的假设，不修改产品接口、授权、发布规则或历史数据。
发布资格与证据复用仍以 [release/README.md](release/README.md) 为准。

## 本次范围与检查

- 修改组件：仅本说明。目的：避免把 DTO 字段误读、发布层级遗漏或业务待决策项记成产品缺陷。
- 必需检查：在本地逐项核对实际响应映射、路由、发布 scope 和现有测试；检查相对链接、差异及敏感数据。预算约 5 分钟。
- 不新增运行时 harness，不修改生产代码，不重复运行已经完成且输入未变的业务验收，不启动数据库、构建、CI 或部署。
- 下文列出的测试是覆盖位置，不是本次新执行的通过证明；单元测试、源码核对、HTTP 实测和正式门禁必须分别报告。

以下路径以 `server-version/backend/src/` 为根；接口路径是对应路由内的相对路径，不包含环境域名或挂载前缀。

## 1. Survey 研究者目录：按公开身份匹配，不借用内部字段

实现：`modules/survey/catalog.service.ts` 的 `researcherCatalog` / `view`，以及
`modules/scale-library-governance/catalog-adapter.ts` 的 `libraryCatalogSnapshot`。

研究者 `GET /:pid/catalog` 的每个共用库量表条目应按以下组合匹配：

- `sourceRef.kind === 'SCALE'`；
- `sourceRef.sourceId === 'library:' + entryId`；
- `sourceRef.sourceVersion` 等于目标入库发布版本，不能用 latest、标题或模板 revision 猜测；
- `sourceProvenance.definitionDigest` 等于该精确来源快照的 definitionDigest。

目录页 `id` 是授权条目身份，导入 `POST /:pid/catalog/:gid/import` 使用此 `id`，不是 library entry ID。
应遍历有界分页并验证目标匹配数；找不到或出现歧义即停止，不能挑同名条目补救。
definitionDigest 应来自同一适配器的规范化快照，不能混用 contentHash、measurementHash 或 scoringDigest。

研究者列表 SQL 主动裁剪内部 provenance。内部快照含 `libraryEntryId`，不等于公开目录承诺返回
`sourceProvenance.libraryEntryId`。这个字段缺失不能证明分发失败，也不能为满足脚本而扩大 DTO。
导入后的完整来源记录与目录列表也不是同一种 DTO。

已有覆盖：`__tests__/scale-library-governance/contracts.test.ts` 的精确来源适配；
`__tests__/survey/catalog.sources.contract.test.ts` 的精确版本与来源边界。
这些内部适配器测试不应被解释为公开响应字段保证；公开裁剪边界以上述真实 mapper / SQL 为准。

## 2. Survey 私有模板发布与项目测量发布不能互换

1. 独立私有 SCALE 模板通过 `POST /:tid/measurement-release` 发布用于共用库申请的快照。
   `modules/survey/tool-publication.service.ts` 将 PRIVATE scope 的 resourceId 绑定到模板 ID。
2. 选入研究项目后，读取该项目 instrument 的真实 ID 和当前 revision。
   项目 SCALE 通过 `POST /:pid/instruments/:iid/measurement-release` 显式发布当前修订，body 为 `{ revision }`。
   `modules/survey/measurement-publication.service.ts` 和 `publication.service.ts` 将项目发布 scope 的 resourceId 绑定到项目 ID。
3. 波次冻结消费项目内精确测量身份。模板成功发布不等于项目 instrument 已发布；不得把模板 releaseId 填入项目字段绕过校验。
4. 普通 FORM 不生成 measurement release，不调用上述测量发布作为表单成功前置条件。
   表单仍须完成自己的有效性、授权和波次冻结流程；“不需要测量发布”不等于“无需发布验证”。

已有覆盖：`__tests__/survey/tool-publication.postgres.integration.test.ts` 核对模板 scope、冻结版本及非 SCALE 拒绝；
`__tests__/measurement-content/survey-measurement-publication.test.ts` 核对项目授权、精确 revision、FORM 拒绝与目录 SCALE 来源检查；
`__tests__/measurement-content/survey-content-options.postgres.integration.test.ts` 核对项目/所有者/测量精确绑定。
本说明不要求重跑这些集成测试，也不授权使用它们的历史本机 fixture。

## 3. Training questionnaire.items：区分输入、数据库与响应 DTO

`modules/questionnaire-product/service.ts` 的写入输入允许 SCALE `scaleId`；
读取详情经 `modules/composite/composite.service.ts` 的 `mapItemForTeacher` 输出嵌套 `scale`。

- 读响应匹配使用 `item.type === 'SCALE' && item.scale?.id === expectedScaleId`，不使用 `item.scaleId`。
- `item.id` 是问卷槽位身份，不是量表身份。同一量表可出现在多个槽位，验证报告或发布选择时还要绑定正确 item ID，不能只取第一个量表匹配。
- 不改产品 DTO 来迎合测试，也不把私有数据库行的 scaleId 当成公开字段。

已有 `__tests__/questionnaire/product.postgres.integration.test.ts` 覆盖同一量表的两个独立槽位；
DTO 字段以真实 `mapItemForTeacher` 为准。此次没有增加重复的全流程测试体系。

## 4. 失败分类、只读核对与续跑

对每次失败分别记录 HTTP 状态、响应是否解析完成、最后已确认成功的步骤，以及故障所在层：

- 响应已成功但断言读错 DTO，记为脚本合同错误；修正断言后优先只读核对已经创建的对象。
- 缺少项目测量发布，先核对模板/项目 scope 与当前 revision；这是流程前置遗漏，不通过放宽产品规则解决。
- 服务端错误、超时或断连不能推定写入未发生。先只读查询 requestId、对象、revision 或发布结果；结果不确定时暂停该写步骤，不盲重放。
- 只有确认未执行或确认该精确请求的既有幂等合同、并保持原身份和 payload 后，才考虑授权范围内的定向续跑。不得生成新 requestId 隐藏第一次不确定结果。
- 预期负向拒绝、真实产品故障、脚本错误、未执行与业务待决定分别列示，不相互抵消。

历史失败 journal 保留原状态、原源码和原请求身份；新只读核对或修正后续跑另记新结果并关联原记录。
不覆写旧失败，不把未执行步骤算通过，不把旧本地证据追认成新提交/CI 的成功。
仅保存脱敏摘要与可核验绑定；账号、凭据、真实 UUID 实例、绝对本机路径和完整本机 harness 不入库。

## 5. 历史报告撤回后是否可读：待业务决定

当前实现边界，不是新增产品规则：

- Training 独立报告编制 audience 仅 `teacher` / `researcher`（`questionnaire-product/content-report.service.ts`）。
  标签本身不授予历史数据访问；现有 ownership、data scope 和指标披露规则仍须通过。
- `composite/training-content-report.ts` 对 participant 返回空列表。对已冻结 FINAL，读取既有事实和解释，不重新选择、计分或生成新的解释。
- measurement 或 report release 为 REVOKED 时，该独立报告项返回 `status: 'REVOKED'`、`rendered: null` 和生命周期提示；不抹除 receipt。
  被撤回的 reference 不再提供可用解释内容。RETIRED / SUPERSEDED 与 REVOKED 不可混为一谈。
- 停止新增授权、停止新采集、撤回测量/报告/参照、撤销某人的读取权限是不同操作。
  “立即停采”不能自动推导“所有历史报告停读”，也不能推导“所有历史报告永久可读”。

最小选择及影响（均未实施）：

1. 保留现行历史读取语义：停采只按现有入口生效；原有有权 staff 仍可在现行生命周期与披露规则下读历史。
   REVOKED 项继续返回 null/状态，不开放 participant 或其他角色，不改变历史事实。
2. 明确增加“同时停止历史读取”的规则：必须先决定触发对象与范围（某 grant、某 release、某用户、某项目），
   以及摘要、明细、导出、缓存是否同时受限。随后仅在相关读路径加一致检查和定向测试；保留不可变事实，不删除、不重算。
   这会改变当前有权用户对既有成果的可见性，不能作为脚本修复顺带实施。

如果希望 REVOKED 后仍显示原解释，那是对现行隐藏策略的另一项明确变更，不属于选择 1，仍需单独决定。
决定前保持现行为，不新增全禁或全开的权限策略。
现有 `__tests__/measurement-content/training-content-report.test.ts` 已覆盖 participant 空结果、REVOKED/null 与 receipt 保留；
`training-report-selection.test.ts` 覆盖新发布不可选已停止的版本。它们不代表“停采即停读”已经被批准或实现。

## 定向验证入口（需要时，而非本次重跑清单）

在 `server-version/backend` 下使用现有 `npm test -- <具体测试文件> -t <受影响用例名>`，
只执行输入改变且未被合格证据覆盖的用例。PostgreSQL 集成测试必须遵循各自的隔离数据库 guard；
不借用生产或历史手工数据库、不为运行测试取消 guard、不把 skip 算通过。
实际 HTTP 续跑前先按以上公开合同确认对象状态，再冻结本次缺失步骤。
