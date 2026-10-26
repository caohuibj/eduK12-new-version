# PR356 必修③：文献修订与独立版本身份

基于 `6fa3bc0d9240023097edc909337ba7f09088ca50`。目录、报告和参照的独立版本存储已有实现，本步验证实际文献修订，并修复一个局部参照变更错误要求其他未变参照也换版本的判断。不引入另一套版本体系。

## 实际合同

- 目录 evidence.citation 修改而不增加 catalogManifestVersion，拒绝 `SCALE_AXIS_VERSION_CONTENT_CONFLICT`；增加该版本后追加新 source snapshot，instrument/scoring/report/reference 身份不随目录文献改变。
- 报告内文献说明改变，必须增加 reportVersion。未增加时拒绝 `SCALE_DEFINITION_CONFLICT`；增加后保留旧报告快照和原 measurementHash。
- 参数条目的 source.citation 改写不能覆盖同一 ACTIVE referenceVersion；拒绝 `ACTIVE_REFERENCE_IMMUTABLE`，事务中新插入的候选轴快照也回滚。
- 改用新的精确 referenceVersion 并显式更新对应 selection 后，只修订该参照，未变的独立参照保持原版本和哈希。旧行、旧快照保留。单纯删除或重排 selection 不被当作新参数版本；instrument/scoring/measurement 不因文献修订改变。
- `scale_axis_snapshots` 的 PostgreSQL UPDATE/DELETE 保护实际拒绝篡改和删除旧记录。本步没有修改不可变规则、自动选 latest 或写入任何用户使用权。

## 执行范围与结果

- 纯版本契约 3/3，通过报告独立版本、参照新身份和局部修订保留其他参照。
- 新的专用 schema-only 隔离数据库中，真实物化／事务／存储验收 4/4 通过。使用合成文献修订和合成第二参照，不是成人或新工具科学证据；测试专属 source provider 没有修改生产 registry。
- 最终只读回读：1 条 Scale、4 条轴快照、3 条参照、0 条部署、0 条 MaterialGrant、0 条批准组合；Scale 为 DRAFT/HIDDEN。没有制造 ONLINE、施测、报告披露或正式发布结果。
- 当前后端 `tsc --noEmit` 通过。没有前端、依赖、Prisma schema 或生成合同变化，不重复②或⑤⑥的已通过检查。

本次测试从新的任务专用隔离库开始，并逐步保留其旧数据，不重置成功或失败数据。它没有连接内容线原宿主机的三个 Scale／snapshot，因此不把本地平台验收冒充原宿主机目录增量已经执行。

原始结果与回读位于节点 `/workspace/scratch/pr356-step3-evidence/`。随本文件提交的安全 JSON 摘要为本地事后记录，没有原执行签名或完整依赖字节绑定，不能代替正式 CI 资格。

本步完成③的平台收口。未激活 CI、未跑完整回归／压测／生产构建，未改 main、未合并或部署。PHQ 家族仍 HOLD；其内容适配验收、完整纵向与 356-01 基线、认知接入和具体内容发布资格分别保持未完成状态。
