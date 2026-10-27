# 管理登记的精确多 grant DTO

基线 `41caf96cac175bafeccc4fd9e6c76111409767e6`；只改后端
`assessment-resource.service.ts`、对应测试及此证据。未改 frontend/client、
authority/repository/locks、迁移或凭据。管理 UI/client 由管理工种接入。

## 冻结 DTO

`License = {resourceId:string,grantId:string}`。

- `GET source-candidates`：`{list:[{sourceCompositeId,title,canPrepare:boolean,
  canPublish:false,unavailableReason:null|'SOURCE_NOT_AVAILABLE'|
  'MISSING_DISTRIBUTION_AUTHORITY',licenses:License[]}]}`。
  已移除旧的单 `grantId` 与 `grantedResourceIds`，不能让用户手选原始 grant keys。
  可准备时 licenses 是真实来源 + 每个 C + 素材的完整精确 selection，按 resourceId
  排序。不可用时 licenses 为空。不返回题目、定义、原件路径或私有样本。
- `POST preparations`（首次及重放）、`GET preparations/:id`：在已有 DTO 上新增
  `licenses:License[]`，直接来自准备事件中原固定 distribution。恢复必须直接用它；
  不从新的 source 候选重建。原证明撤销则恢复失败，不查找替代 grant。
- `GET preparations/:id/content-choices` 的每个 reference/report：已有 releaseId、
  contentHash 等安全摘要不变，移除旧单 grantId；新增
  `{selectable:boolean,unavailableReason:null|'CONTENT_NOT_AVAILABLE'|
  'MISSING_DISTRIBUTION_AUTHORITY',licenses:License[]}`。可选项 licenses 只含该
  P/R + 其全部素材；与准备 licenses 重叠的资源必须使用原 pinned grant。
  不可选项 licenses、choices/metricKeys 为空，UI 禁用并说明原因。

管理提交：准备直接使用所选 candidate.licenses；恢复使用 preparation.licenses。
登记时合并 preparation.licenses 与所选 P/R 的 licenses，按 resourceId 去重；
同资源不同 grant 必须拒绝，不能后者覆盖前者。不添加宽 grant 中的其他 keys，
不添加未选 P/R 的 licenses。register 请求的其余字段及显式 feedbackPolicy 不变。
这些 DTO 只是导航，真正 prepare/register 的原来源/素材/当前权限校验全部保留。

## 实现边界

来源列表先发现 source IDs，按既有 source advisory → Org 顺序取得源身份锁，
再检查当前产品管理资格及源授权。随后复用真实来源投影/原版权/本人 privateVersion/
素材校验；新的 discovery 为每个必要资源找到当前可用 grant，并通过原
`assertEducationAssessmentDistribution` 再验证。宽 grant 只贡献本次需要的资源。
来源按 ID、grant 按 ID 排序，去掉同一 source/release 的 grant 重复行。

发现新用 grant 的 helper 不参与恢复。P/R 选择的 overlapping assets 使用准备中的
原 grant，不允许用新发现的 grant 替代。root 的 NOWAIT helper 仍由原 distribution
检查调用；AUTHORITY_BUSY、数据库错误和未知错误继续抛出，未吞成“不可选”。
只把已知来源定义/权限错误投影为不可用；无当前有效 source grant 的来源不返回。

## 验证与原失败

仅运行新文件 `assessment-resource.license-selection.postgres.integration.test.ts`，
PG16.15 / Node24.21.0 / loopback `eduk12_pr363_publication_test`。r3 退出0，4 passed：

1. source/C/素材分别三个实际 grant；缺素材 grant 明确不可用，补齐后只返回三个必要
   选择，绝不携带宽 grant 的无关 UUID；误传额外 license 时 prepare 拒绝。
2. 实际持久化 Form 定义错误标 SOURCE_NOT_AVAILABLE，DTO 不暴露题目正文。
3. 准备创建/重放/恢复都返回原 licenses；新的候选确实会选择新 grant，但原准备仍
   保留旧 grant；旧 grant 撤销后恢复/重放拒绝，不替换。
4. 私有教育 P/R 都有两个真实 assetRefs；缺额外素材 grant 时均不可选；补齐后返回
   完整 P/R/素材选择，共用源素材保留原 pinned grant。合并后真实 register 成功；
   误传宽 grant 的额外资源时 register 拒绝，原 entry 保存精确合并结果。

这组 C 使用原 CognitiveAssignment measurement 发布；source 是明确合成的已发布
Composite/Form DB fixture，素材仅是隔离数据库元数据。这验证授权投影/登记，
不是素材对象存储、题本审批、浏览器或真实受试者闭环。

r1 退出1、3 case 失败：新 Form 夹具的 formLabel 与 definition.prompt 不同，原 typed
Form guard 正确拒绝。原输入和日志完整保留；修正夹具，同时让该已知400来源错误
能在列表显示不可用。r2 退出127：在仓库根误用 backend 相对 vitest 路径，未启动测试；
切回 backend 后为 r3。没有覆盖失败或声称失败调用通过。
旧18组没有重跑，仅对应旧 DTO 断言适配新字段/排序；原输入的历史证据保持原身份。
最终 backend `tsc --noEmit` r3 退出0，`git diff --check` 退出0。
所有调用及最终源码 hashes 见 `source-license-selection-evidence/manifest.json`。
没有 CI、PR 合并、部署或真实工具批准。
