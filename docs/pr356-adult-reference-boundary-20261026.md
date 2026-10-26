# PR356 必修⑥：成人参照与外部 dossier 边界

基于 `36d4c4183709699b42d6f9796eb071c97231142f`，补齐成人参照进入 `validateScaleInstrumentSource` 的人群范围校验，以及外部文献 dossier 混入可执行 reference 的拒绝路径。成人治理与年龄匹配原实现保留；本步没有注册内容线工具、激活外部参数或授予新的科学资格。

## 来源与行为

只读核对独立内容分支 `content/dot-local-scales-20261025` 的精确提交 `7330038efbea8778541a42a5d90188a8879a98b9`：

- `docs/scale-instruments/research-drafts/cbi_zh_cn/1.0.0/external-reference-dossier.json` 标记 `EXTERNAL_DOCUMENTATION_ONLY_NOT_BOUND`，`currentTranslationValidated=false`、`sourceParameters.activate=false`；对应 source 的 references 为空，referencePolicy 为 none。
- `docs/scale-instruments/research-drafts/k6/1.1.0/external-reference-dossier.json` 标记 `EXTERNAL_EVIDENCE_ONLY_NOT_BOUND`、`runtimeSelected=false`。

这些文件只用于明确文档边界；没有复制其整包、题目、统计值、宿主机路径或源材料进入运行库。测试使用合成封套和合成成人范围，不把学校样本变成成人科学证据。

最终规则：

1. 成人 reference 仍需原有精确 instrument/scoring/measurement/locale 绑定、216–1440 月边界、无年级身份及禁止跨学段重参照。
2. 成人参数不能绑定到明确声明学校年级的源，或与工具适用性、目录声明年龄完全不相交的源。目录年龄按原合同为完整周岁，maxAge 包含整岁对应的月份；不改成年龄下界推定或年级转成人年龄。
3. ReferenceSet 或 entry 带外部 dossier 封套字段（activationStatus、runtimeSelected、sourceParameters、currentTranslationValidated）时返回 `EXTERNAL_REFERENCE_DOSSIER_NOT_EXECUTABLE`。即便将文档字段展开到其余字段合法的 reference 上，也不能因此激活。
4. 原始 dossier 缺少可执行 entries 时，onboarding validator 返回带位置的问题，不在错误封套上继续解引用并抛 TypeError。以后要采用文献参数，仍需显式建立并核验精确版本的 reference，不能把修改文档开关当作批准。

## 实际检查

- 新增成人 onboarding／dossier 边界：12 项通过。
- 直接受影响的原 Wave1 学校／成人参数与治理：4 + 8 项通过。
- 最后补齐原始 dossier 的结构化拒绝后，仅重验受影响的 2 个 dossier 用例，通过，其余已通过项不重复。
- 当前后端 `tsc --noEmit` 通过；没有前端、数据库、依赖、迁移或生成合同变化，未重复⑤对应检查。

原始 reporter 和类型输出保留在节点 `/workspace/scratch/pr356-step6-evidence/`。随本文件提交的摘要为事后记录的本地开发结果，未签名，不是 CI 资格或科学审核证书。未启动 CI、压测、生产构建、部署或生产操作。

⑥的平台尾项在本步完成；内容及科学验收仍按精确工具分别处理。②八轴／非商业标签、③文献版本身份和后续 HOLD／纵向／资源基线／认知工作不被此记录预写为完成。
