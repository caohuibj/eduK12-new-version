# RES-9 中文「非商业」目录标签收尾回读（2026-10-26）

## 已提交且可复核的范围

- 来源：`server-version/backend/src/modules/scale/instruments/res9_zh_cn/1.0.0/source.json`。
- 源标签修订提交：`181efae796d925fe5af4f942f5b24f11da212358`（仅修改该 source.json）。
- `catalog.catalogManifestVersion: 1 → 2`；`catalog.construct.constructOverlapTags` 在原 `license:noncommercial_only` 之后增加独立的中文标签 `非商业`。
- 旧、新 JSON 回读后，仅反向撤销这两处修改即可得到完全相同的其余字段。题目、应答、计分/缺失、报告、译本、适用性和 usageRequirements 均未修改。原始说明、非商业限制、CC BY-NC 4.0 和草稿边界保留。
- 该源为 `DRAFT`，既不是自动授权使用，也不是公开发布、入库激活或 K12 验证。

## 标签的后台消费链（静态审查）

| 目标层 | 实际位置与发现 | 结果 |
|---|---|---|
| 定义合法性 | `backend/src/modules/scale/library/catalog-manifest.ts`：`constructOverlapTags` 接受非空字符串数组；目录元数据单独版本化 | **PASS：源码结构** |
| 目录读取 | `backend/src/modules/scale/library/scale-library-read-model.ts` 的条目投影以及 `catalog-only-read-model.ts` 均拷贝 `constructOverlapTags` | **PASS：静态透传** |
| 列表关键词检索 | `scale-library-read-model.ts` 的 `filterScaleLibraryEntries` 只搜索 name、abbreviation、family、primaryDomain、constructDefinition、source title，**没有**搜索 `constructOverlapTags` | **BLOCKED：尚不能据此按「非商业」标签关键词搜索** |
| Web 列表筛选 | `frontend/src/pages/ScaleLibrary.tsx` 有关键词、构念、作答者等筛选项，目前并未将这个目录标签字段作为独立筛选条件；实际 UI 展示未做浏览器验证 | **NOTRUN / 无标签专用筛选** |
| DB 目录快照升级 | 当前 content 源已升目录版本，但隔离合成数据库的**目录增量**测试尚未执行；原已有的3条 Scale/快照不能删除重来凑成功 | **NOTRUN** |
| 旧目录快照保持 | 源定义字节级 JSON 非目录部分保持；但没有当前环境的 DB readback，不能宣称历史快照保留已通过 | **NOTRUN** |
| 真实两入口/报告 | 本次目录元数据修订不应触发原计分、报告或浏览器整套重验；也没有重新发放、统计/激活 | **NOTRUN，且不声称需要重复整套检查** |

## 交付边界与功能线任务

**内容线已完成的只是「显式中文标签 + 独立目录版本」**，不是系统级“非商业”检索能力。真正支持通过中文标签搜索，需要功能线对真实列表关键词索引/筛选、分页结果与前端契约作一次有界修订，并保证不误把许可标签当作实际审批状态；本内容包不修改共享过滤器或重建授权门禁。此缺口和当前未完成的 DB catalog-manifest 增量核验，应在功能工作区中处理并保留原快照/ledger。

本记录不属于新量表来源/版本包，不增加 40 包计数，不创建 PR，不触发 CI，不合并或部署。
