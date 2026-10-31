# 量表报告 / 目录：有界修复候选

本候选修复化学「教师学科喜爱」真实 R/P 不匹配，并收口 #462 CI 暴露的本组旧测试合同。不是平台全库测试通过证明，也不是生产安装或发布记录。

## 内容修正与历史版本

- `teacher_subject_liking_chemistry_zh_cn@1.0.0` 默认 R 从 `1.1.0` 更新为 `1.1.1`。
- 既有 P `wave1-20261001-v2` 初中、高中都只有 `very_low / low / high / very_high`；新 R 删除无 P 支持的 `middle`。不增加 P 分档，不改阈值、题本、计分、缺失规则或 C。
- 四个保留档位只删除「；相对偏高也未必偏向同意」：实际 high / very_high 均在六点认同锚点的同意侧。其他原有解释、反思和行动建议保留。新 QC 如实记录 AI 编辑检查，不代表人工专家批准或新人群验证。
- 原 R `1.1.0` 完整保存于同目录 `report-variants.json`，按既有独立版本机制注册；与原 `3b90f60af83180a24743010ed860db6990581c03` source 中报告逐字段相同。source 除 report 外逐字段相同。
- 新授权仍使用既有匹配检查：新 R + 原 C/P 可用；旧 R + 同一四档 P 仍明确拒绝 middle 缺口。历史快照可保留原 R，不能据此将旧组合授权为匹配。
- PG 检查保留原 R 和新 R 两份不可变快照；重复入库不覆盖，UPDATE / DELETE 拒绝断言保留。没有修改历史读取器、匹配器、授权器或数据库 schema。
- 原 #462 的 55 份报告登记保持原样；七项 catalog-only、Skaalvik / CTAS 的 DRAFT、版权 HOLD 均未改变。

## 原失败与逐项归因

原失败：#462 head `77f9d78e43525267dac5e145ab10b8e5ff622213`，run `41233875089` attempt 1，job `124633588950`；本组 22 文件 / 53 failed cases。原失败不改写为成功。下表文件均位于 `server-version/backend/src/__tests__/`。

| 文件 | 原失败数 | 归因及修正 |
|---|---:|---|
| assessment-governance/product-readiness-inventory.test.ts | 1 | 技术 ready 不自动授予 PUBLISHED；保留 DRAFT 及激活拒绝 |
| assessment-reference/scale-wave1-reporting.postgres.integration.test.ts | 1 | 独立 R 历史登记可共存；仍核精确 v2 冻结及显式 v3 再生成 |
| cognitive/library-catalog.test.ts | 1 | 只读目录消费者的精确 import 例外，禁止评分/哈希路径导入边界保留 |
| education-tools/assessment-resource.catalog.test.ts | 1 | SQL fixture 补版本字段，完整安全 DTO 和敏感字段排除保留 |
| measurement-content/survey-report-results.test.ts | 6 | mock 补真实受众 SQL reader，保留原生受众授权及拒绝断言 |
| reporting/education-scale-personal-report.service.test.ts | 1 | FINAL fixture 补精确 slotKey，错 slot / 异步后重验仍拒绝 |
| scale-library-governance/unified-catalog-discovery.test.ts | 1 | 全库数量扩展；精确源集合、标签、去重与分页语义保留 |
| scale/closeout-scientific-qualification.test.ts | 1 | 使用现有科研证据地域评估；不为安装新加地域门禁 |
| scale/pr1-baseline-compatibility.test.ts | 1 | 固定历史 V1 hash 与当前显式 instruction:null 新写入身份分开验证 |
| scale/pr3-managed.postgres.integration.test.ts | 11 | 合成 registry 使用真实私有 registry 的 validation 缓存；真实安装 fixture 放 beforeAll，避免选择性运行依赖首个测试 |
| scale/scale-library-pilot-boundary-matrix.test.ts | 1 | 人工译审 / 部署诊断与 Product Release 既有合同分离 |
| scale/scale-library-pilot-publication-gate.test.ts | 1 | 同上；错误 locale / 未发布部署仍关闭 |
| scale/scale-library-texi-gate.test.ts | 2 | PENDING 译审提示保留，实际语言与生命周期门禁继续验证 |
| scale/scale-library-wave0-read-model.test.ts | 6 | 安全断言限定原六个精确版本；新目录 reverse 命中仅元数据标签 |
| scale/scale-library-wave1-p1.test.ts | 1 | 全部自我效能条目可发现，原 P1 子集仍仅 GSE |
| scale/self-authored-onboarding.test.ts | 2 | 科研地域评估保留，不恢复 main 已移除的技术安装阻断 |
| survey/library-discovery.pagination.test.ts | 3 | 动态精确身份集合验证全量分页，SDQ 按真实页验证 fingerprint |
| survey/standard-catalog-fingerprint.postgres.integration.test.ts | 1 | 按真实注册源 + 隔离库 authored 集合验证，移除固定十页截断 |
| survey/standard-triplet.test.ts | 1 | 唯一真实内容缺口：化学 R 要求不存在的 middle；原正向用例保留并恢复可用 |
| scale/instruments/learning-motivation-report-semantics.test.ts | 4 | 六构念 × 六学科精确 36 项，保留 C/P 事实、10/26 证据分布与锚点边界 |
| scale/instruments/learning-motivation-wave1.postgres.integration.test.ts | 1 | 按每项精确 R 版本集合核快照；化学新增 R 两份，其他 35 项一份 |
| scale/instruments/learning-motivation-wave1.test.ts | 5 | 限定原 36 项，原题锚点/缺失规则/学段学科及报告反思行动内容仍检查 |

main `a58a16dc` 的静态盘点已经有 244 sources、37 student-tag 版本、115 executable versionAxes；36→115、11→12 的全库硬编码漂移早于 #462。#462 新增七个 catalog-only 使总目录达 251，直接暴露旧十页截断。已比对待合 #397/#412/#453/#456/#457/#458，未发现这些组内 fixture 或化学修复的重复实现。

## 定向证据与边界

主要执行位置为隔离云端开发环境。第一阶段在 main `d14b14f50f074f2b60a8013446dd7706665212da` + #462 内容上执行；后续对齐真实 main `8d3d351d7d054ed468b7b8b4a02947ddf051d0a8`，两者间为 CI/build 工具变化，相关产品/schema 输入未变。没有因对齐重放已通过用例。

| 执行 | 结果 | 证据（当前云端文件） |
|---|---|---|
| 第一阶段代表性定向修复 | 43 个 selected case 最终通过（38 unit、5 PG），不是原 53 逐例重放 | `/tmp/scale-group2-first-wave-result.json` 逐命令记录；原失败日志保留 |
| PR3 剩余九个原失败用例 | 9 PASS、0 FAIL、2 filtered | `/tmp/scale-group2-pr3-remaining-nine.json` |
| 化学原正向组合 + 新旧 R 匹配不变量 + 受影响 36 项版本语义 | 3 PASS、0 FAIL | `/tmp/scale-group2-chemistry-unit.json` |
| 受影响既有 PG 入库用例 | 1 PASS、0 FAIL、1 filtered；直接复核化学新旧快照与重复入库 | `/tmp/scale-group2-chemistry-history-pg.json` |

最后两项仅重验化学输入变化直接影响的断言；不把重验计为新的唯一测试。未重跑 55/4/7、TypeScript、10391 全库或其他组；未声称原 53 cases 全部重新执行。原始失败执行、定向失败与后续成功分开保留。

PG 使用缓存官方 `postgres:16.15-bookworm`，Redis `redis:7.4.11-bookworm`，loopback 临时端口与任务自有 tmpfs 数据库，执行现有 migrations，无全局 seed、生产或共享库。任务容器已停止并自动删除；清理记录 `/tmp/scale-group2-final-cleanup.json`。

## 审阅 / 发布状态

Draft 叠放在原 #462 分支上，仅交付本轮 22 个测试文件、3 个内容/登记文件和本说明，避免复制原 #462 的 55/7 登记。开发验证使用当前 main + #462；叠放基线 #462 所在 main `28b8cbe4be407cce063e5584b905cadbaecb9498` 到验证 main `8d3d351d7d054ed468b7b8b4a02947ddf051d0a8` 的差异只含 CI/build/release 工具与说明，未改本次被测 backend 产品、测试、schema 或锁文件。母 DOT 最终集成仍应使用实际当前 main。

仅准备 Draft；不 Ready、合并、生产入库或部署。预期为 backend 产品内容 + 伴随测试路线；本地证据不冒称官方 CI 门禁通过。保留原 CI 失败，未激活新 CI。再次激活前仍需按 AGENTS 将本次归因和 checking list 回写既有 Notion CI 错误页；此前连接工具缺少 link_id / Unknown tool，状态 pending，未绕权限新建页面。

后续只需母 DOT 审阅新旧 R 关系、内容授权和本有界差异，统一安排 #462 与本修复的集成顺序、适用 CI 和发布准备。内容库源码登记与真实生产安装分开报告；回退本候选由母节点选择上一份合格产物，不在生产改写历史 R。
