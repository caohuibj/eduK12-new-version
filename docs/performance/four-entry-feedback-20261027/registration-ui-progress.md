# 共享资源登记管理界面

后续 exact licenses 接线已完成，见 [精确授权接线记录](registration-exact-license-progress.md)；本文旧 pending/人工授权方案保留为历史状态，不代表当前实现。

独立云端、原分支 `feat/pr363-education-management`，正常吸收 root `467baeb59a72e61a5e4104b5c0163b288b0c234e` 与反馈合同 `385277be09228ace5d9ff8da1bbd8934d86cd471`。本片只改共享 RegistrationPanel、现成 assessmentResourceClient 类型、两个 App 最小挂载及本片测试/证据，不修改 producer、来源权限、迁移或运行/报告。

## 已接入的真实流程

- 使用真实 `assessmentResourceClient` 的 source-candidates、preparations、preparation/read、content-choices、register、registration/read 和 review/publish/retire；没有新 URL、数据库写入或审批 bool。
- 操作区仅在实际登记列表接口鉴权成功后显示。该接口使用当前产品管理员或 PSYCHOLOGY_STAFF 的既有 issuer 检查；私有工具编制 flag 不授予登记资格。401/403 收起操作区，服务端每次动作仍权威。
- 来源选择与真实 grant/resource IDs；准备保存固定请求编号，精确 P 选择 entryKey/priority，精确 R 选择 releaseId/hash，报告指标仅来自选中的已批准报告，其他受众 NONE。纯 Form 只提供完成确认。
- 新登记必须明确选择反馈 IMMEDIATE 或 SCHEDULED。按实际共享 Training schema 提交 `{schemaVersion:1,mode:'IMMEDIATE'}` 或 `{schemaVersion:1,mode:'SCHEDULED',releaseAt:'...Z'}`；UTC 输入由面板规范化，没有发明 releaseAtUTC 字段、policy hash 或新列。旧登记仅显示原冻结 entry，不补默认值。
- 登记成功回读 hash/状态/冻结 entry。之后不显示 P/R/反馈编辑；新版本使用新编号。独立审核仅在明确读取 createdBy 且不是当前作者时出现；状态变化携带原 entryHash 和理由，随后回读。不自动审核或发布。
- 写入同步锁避免重复点击；结果未确认时保留编号并停止重提，只允许回读。未登记的 404 才转 preparation/read，并重新加载真实来源和授权候选；其他错误不冒充准备状态。读请求可以取消；组织/身份/transport 改变及卸载后的迟到响应不能复活旧状态。

## 挂载和复用

Teacher “我的工具”对非学生提供只读权限探测入口，登记操作仍由真实 API 鉴权；不依赖私有工具编制 flag。School 在工具页及已有活动管理资格的活动页挂载同一面板，让无私有编制资格的产品管理员/心理教师也可进入。两个 App 各增加一个 import 和最小挂载，没有改作答宿主。

复用现成 producer client、原准备/冻结/独立审核/发布生命周期、C/P/R 精确候选、同源认证/CSRF/MFA、Training 反馈合同。新增的只是消费这些 API 的共享组织管理 UI；没有题本编辑、计分、版本存储或报告引擎。

## 检查及证据

`registration-ui-evidence/manifest.json` 保存精确筛选、退出码、原 reporter、无损 gzip 日志和源码观察。Node 24.21.0 / Vitest 4.1.11。首轮 6 PASS；随后仅规范 feedback 载荷/取消读取 3 PASS、授权选择影响的精确 P/R 场景 1 PASS、准备回读新增场景 1 PASS。共 8 个不同用例、11 次实际 PASS；未改的成功用例未整套重跑，无失败被重标。

最终 `node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit` exit0；最终面板/测试 eslint exit0（0 errors、1 ref cleanup warning）。最初五文件 lint 包含 client、面板及测试、两个 App，exit0（另有既存 App org dependency warning）；仅源码变化的面板/测试/client 做了后续 lint。类型中间结果保留原身份，不冒充最终输入。早轮没有执行前完整输入清单，源码观察不是追签或正式 CI 接纳。

## 明确剩余项

1. root/source producer 工种须将 register 严格 schema 接纳并要求上述显式 feedbackPolicy，并写入已批准的 origin 合同。此片始终发送明确选择，不通过省略字段兼容旧 producer。当前未执行真实 register HTTP；该依赖为 pending，不是被拒绝或已成功。
2. source-candidates 的 grantedResourceIds 是 grant 覆盖集合，而 producer 要求恰好本来源所需的授权子集。UI 提供真实 ID 勾选并由服务器校验；仍建议 producer 提供安全的“必需来源/C/素材资源”摘要，避免管理者手工辨识多余授权。恢复时也须核对原授权集合，不能用新 grant 替代原证明。
3. 没有运行 source PG、完整浏览器、生产构建、CI、合并或部署；测试使用真实 client 路径配合合成 API，不证明数据库资格或真实工具已批准。发布/停用按钮已接原 API，但完整真实权限生命周期仍由最终集成验收。
