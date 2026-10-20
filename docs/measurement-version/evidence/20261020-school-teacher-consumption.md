# School / Teacher 注册资源：精确测量消费接入

范围：现有可信注册入口接入统一发布身份，不新增 School/Teacher 编制器、常模选用、独立报告模板选用或数据权限。

## 修改与边界

- `assessment-run/registeredResources.ts` 的新注册在同一事务保存 `trainingContentSnapshot`，review/publish 重查同一冻结组合，不只改 composite 状态。
- `registeredResourceContent.ts` 仅接受 `ORGANIZATION_RESOURCE` 的单个原有 Scale 项。来源必须已有真实 `measurementReleaseId`，通过共享 `readPublishedScaleMeasurementSource` 验证已发布状态、原作者/资源 scope、许可、hash scheme/content hash 和实际定义。
- 原始来源仍是合法的 Training 私有量表身份，不伪造 School/Teacher 作者，不在消费流程自动创建/转换来源发布。
- 本注册通道原本只支持允许再分发的自编描述性量表，明确冻结空参考候选集合；不读取或选择最新常模。
- 不选择 Training 私有教师/研究者报告。共享 FINAL 记录 `report=NOT_SELECTED`；原有 School/Teacher 描述性反馈、组织/Run 数据范围和 respondent/resultDisclosure 检查保持不变。本补丁不是跨入口常模/模板全面开放。
- 原有 Teacher 个人报告的成人受众 QC、无参考、仅本人可读，以及组织/个人精确许可不变。

## 旧数据和显式切换

- 已发布旧资源、已开始作答与旧 null/null 绑定不改写、不删除；旧 START 行为保留。
- 显式重新登记一个无冻结内容的旧注册对象时创建新的资源 ID/版本/composite，不覆盖旧注册记录。
- 旧 DRAFT/REVIEWED 对象不能通过本次 review/publish 静默补造内容身份，须显式重新登记。来源缺失测量发布指针时返回明确 409，先由来源作者发布或执行已授权的转换。
- 已冻结资源的来源指针、实际内容或生命周期发生变化，review/publish 拒绝，不漂移到新版本。

## 定向验证

主要执行位置为云端本地，仅运行直接受影响的合同测试；无新增 CI、压测、真实生产访问、授权或数据迁移。

2026-10-20：

- `vitest run --maxWorkers=1`：`registered-resource-content.test.ts`、`registered-resource-publication.test.ts`、现有 `registered-resource-definition.test.ts`，初轮 16 个测试通过；补充缺失运行目标/半冻结负例后仅复测受影响 publication 文件，7/7 通过，合计当前 17 个有效定向测试。
- 覆盖合法来源冻结、空参考/无私有报告、完整 START→冻结参考→canonical FINAL→receipt 回读、旧 START null/null、来源版本/scope/许可/hash/lifecycle 负例、单项运行目标完整性、旧对象显式重新登记、独立复核及失败不发布。
- 现有真实数据库测试 `registered-resource-longitudinal.postgres.integration.test.ts` 和 `huiteacherPersonalScale.postgres.integration.test.ts` 已补显式合成来源发布与 START/FINAL 身份断言，交由既有集中同环境数据库验证执行；本记录不将尚未执行的数据库测试记为通过。
- `admin-permissions/teacher-license.postgres.integration.test.ts` 仅更新同样的合成来源准备，不改变精确许可/入口权限断言；须在既有独立 admin harness 运行。
- 本单元已启动的一次全后端类型检查结束，报并行 Training 新 reference Prisma 字段尚未生成；不将该检查记为通过，也不重复启动，最终统一检查由主负责人执行。
